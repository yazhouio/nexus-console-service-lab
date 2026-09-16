import '../plugin-contract/register.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const { generatePages, escapeMarkdown } = await import('../plugin-contract/generate.ts');
const { sources, contracts } = await import('../plugin-contract/sources.ts');

const copy = () => structuredClone(sources);
const text = (pages) => [...pages.values()].join('\n');

test('real sources compile deterministically without mutating declarations; versions and unresolved references remain visible', () => {
  const before = JSON.stringify(sources);
  const pages = generatePages(sources, contracts);
  assert.deepEqual(pages, generatePages([...sources].reverse(), contracts));
  assert.equal(JSON.stringify(sources), before);
  for (const version of ['1.0.0', '2.0.0']) {
    assert.match(pages.get(`plugin-kubeeye-${version}.md`), /kubeeye-unused/);
    assert.match(pages.get(`plugin-kubeeye-${version}.md`), /未解析/);
  }
  assert.doesNotMatch(pages.get('plugin-kubeeye-1.0.0.md'), /node-alert-messages/);
  assert.match(pages.get('plugin-kubeeye-2.0.0.md'), /node-alert-messages/);
  assert.match(pages.get('points.md'), /"clusterId"/);
  assert.match(pages.get('points.md'), /"capability"/);
});

test('original compiler rejects illegal bindings and expanded profiled declarations', () => {
  const changed = copy();
  const owner = changed.find((s) => s.descriptor.id === 'cluster');
  owner.points.find((p) => p.id === 'node.actions').bindings.itemRefContract =
    'cluster.missing-ref@1';
  assert.throws(() => generatePages(changed, contracts), /REF_CONTRACT_MISSING/);
  const inline = copy();
  inline[0].points[0].contextSchema = {};
  assert.throws(() => generatePages(inline, contracts));
});

for (const field of ['ownerPluginId', 'id', 'contractMajor', 'kind', 'duplicate'])
  test(`Catalog rejects ${field} mismatch`, () => {
    const changed = copy();
    const owner = changed.find((s) => s.catalog?.length);
    if (field === 'duplicate') owner.catalog.push(structuredClone(owner.catalog[0]));
    else if (field === 'kind') owner.catalog[0].kind = 'action';
    else owner.catalog[0].ref[field] = field === 'contractMajor' ? 9 : 'missing';
    assert.throws(() => generatePages(changed, contracts), /Catalog mismatch/);
  });

test('duplicate identities obey Point, route/navigation and owner-scoped extension boundaries', () => {
  for (const group of ['points', 'routes', 'navigation', 'extensions']) {
    const changed = copy();
    const entries = group === 'points' ? changed[0].points : changed[0].contributions[group];
    entries.push(structuredClone(entries[0]));
    assert.throws(() => generatePages(changed, contracts), /Duplicate/);
  }
  const changed = copy();
  changed[1].contributions.routes[0].id = changed[0].contributions.routes[0].id;
  assert.throws(() => generatePages(changed, contracts), /Duplicate routes/);
  const legal = copy();
  legal[1].contributions.extensions[0].id = legal[0].contributions.extensions[0].id;
  assert.doesNotThrow(() => generatePages(legal, contracts));
});

test('assertion and major mismatches are diagnostics, malformed declarations fail', () => {
  const changed = copy();
  const value = changed[0].contributions.extensions[0];
  value.point = { ...value.point, contractMajor: 9 };
  value.expectedProfile = 'detail.tabs@1';
  value.expectedRefContract = 'cluster.resource-ref@1';
  assert.match(text(generatePages(changed, contracts)), /contractMajor 不匹配/);
  assert.match(text(generatePages(changed, contracts)), /expectedProfile 不匹配/);
  assert.match(text(generatePages(changed, contracts)), /expectedRefContract 不匹配/);
  value.description = 'closed field rejected';
  assert.throws(() => generatePages(changed, contracts));
  const invalidManifest = copy();
  invalidManifest.find((s) => s.manifest).manifest.provides = ['illegal.capability@1'];
  assert.throws(() => generatePages(invalidManifest, contracts), /provides must be empty/);
});

test('coverage is display metadata; partial empty groups remain unknown and compiler output is unaffected', () => {
  const changed = copy();
  changed[0].coverage.points = 'partial';
  const baseline = generatePages(sources, contracts);
  assert.equal(generatePages(changed, contracts).get('points.md'), baseline.get('points.md'));
  changed[0].contributions.extensions = [];
  changed[0].coverage.extensions = 'unknown';
  assert.match(generatePages(changed, contracts).get('plugin-console-core-1.0.0.md'), /数量未知/);
  assert.doesNotMatch(
    JSON.stringify(sources.map((s) => [s.descriptor, s.points, s.contributions])),
    /coverage/,
  );
});

test('source changes flow to pages and author text is MDX-safe', () => {
  const changed = copy();
  changed[0].contributions.navigation[0].label = '<script>{x}|`hello`\nnext';
  const generated = generatePages(changed, contracts);
  assert.notDeepEqual(generated, generatePages(sources, contracts));
  assert.equal(escapeMarkdown('<x>{a}|`\n'), '&#60;x&#62;&#123;a&#125;&#124;&#96; ');
});

test('CLI replaces only its dedicated directory and removes output on validation failure', async () => {
  // Isolated repository copy lets us exercise source deletion and a real failed build without editing the workspace.
  const directory = await mkdtemp(resolve(tmpdir(), 'nexus-contract-'));
  const root = resolve(import.meta.dirname, '../..');
  try {
    for (const folder of ['scripts', 'packages', 'apps'])
      await cp(resolve(root, folder), resolve(directory, folder), {
        recursive: true,
        filter: (path) => !/(?:^|\/)(?:node_modules|dist|doc_build|\.rspress)(?:\/|$)/.test(path),
      });
    await writeFile(resolve(directory, 'package.json'), '{"type":"module"}');
    for (const pkg of ['packages/console-core', 'apps/console'])
      await symlink(resolve(root, pkg, 'node_modules'), resolve(directory, pkg, 'node_modules'));
    const output = resolve(directory, 'apps/docs/docs/generated/plugin-contract');
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'stale.md'), 'obsolete');
    const manual = resolve(directory, 'apps/docs/docs/manual-sentinel.md');
    await writeFile(manual, 'keep');
    const run = () =>
      execFileSync(process.execPath, ['scripts/generate-plugin-contract.mjs'], {
        cwd: directory,
        stdio: 'pipe',
      });
    run();
    assert.ok(!(await readdir(output)).includes('stale.md'));
    assert.equal(await readFile(manual, 'utf8'), 'keep');
    const source = resolve(directory, 'scripts/plugin-contract/sources.ts');
    await writeFile(
      source,
      (await readFile(source, 'utf8')).replace(
        '[kubeeyeManifest, kubeeyeManifestV2]',
        '[kubeeyeManifest]',
      ),
    );
    run();
    assert.ok(!(await readdir(output)).includes('plugin-kubeeye-2.0.0.md'));
    await writeFile(
      source,
      (await readFile(source, 'utf8')) + '\nthrow Error("invalid declaration");\n',
    );
    assert.throws(run, /invalid declaration/);
    await assert.rejects(readdir(output), { code: 'ENOENT' });
    assert.equal(await readFile(manual, 'utf8'), 'keep');
    const docs = JSON.parse(await readFile(resolve(directory, 'apps/docs/package.json'), 'utf8'));
    assert.match(docs.scripts.build, /^node .*generate-plugin-contract\.mjs && rspress build$/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

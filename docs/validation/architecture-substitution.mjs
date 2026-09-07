// Reproduce with: node docs/validation/architecture-substitution.mjs
// All implementations and extra contract probes run in a disposable workspace.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { architectureBaseline, restoreArchitectureBaseline } from './architecture-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = mkdtempSync(join(tmpdir(), 'nexus-substitution-'));
const runtime = 'packages/plugin-runtime', host = 'apps/host';
const results = [], changes = new Map();
const evidence = join(root, 'docs/validation/architecture-substitution');
mkdirSync(evidence, { recursive: true });
const read = path => readFileSync(join(scratch, path), 'utf8');
function edit(path, transform) {
  if (!changes.has(path)) changes.set(path, read(path));
  writeFileSync(join(scratch, path), transform(read(path)));
}
function replace(path, before, after) {
  edit(path, original => {
    if (original.split(before).length !== 2) throw Error(`Expected unique anchor in ${path}: ${before}`);
    return original.replace(before, after);
  });
}
function command(pkg, binary, args, timeout = 60_000) {
  return spawnSync(process.execPath, [join(root, pkg, 'node_modules', binary), ...args], { cwd: join(scratch, pkg), encoding: 'utf8', timeout });
}
function test(name, pkg) {
  const output = join(scratch, `${name}.json`);
  const child = command(pkg, 'vitest/vitest.mjs', ['run', '--config', join(scratch, 'vitest.substitution.mjs'), '--reporter=default', '--reporter=json', `--outputFile=${output}`]);
  if (!existsSync(output)) throw Error(`${name}: ${child.error ?? child.stderr}`);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  const logs = (child.stdout + child.stderr).replace(/\u001b\[[0-9;]*m/g, '');
  const result = { name, exitCode: child.status, passed: report.numPassedTests, failed: report.numFailedTests,
    observations: [
      ...[...logs.matchAll(/SUBSTITUTION_POLICY_CALLS\s+(\d+)/g)].map(m => ({ policyCalls: Number(m[1]) })),
      ...[...logs.matchAll(/SUBSTITUTION_ROUTE_CASES\s+(\d+)\s+DIFFERENCES\s+(\d+)/g)].map(m => ({ routeCases: Number(m[1]), differences: Number(m[2]) })),
    ],
    failedTests: report.testResults.flatMap(suite => suite.assertionResults.filter(t => t.status === 'failed').map(t => ({ name: t.fullName, messages: t.failureMessages }))),
    suiteErrors: report.testResults.filter(s => s.assertionResults.length === 0 && s.status === 'failed').map(s => s.message) };
  if (!report.numTotalTests || result.suiteErrors.length || child.error) throw Error(JSON.stringify(result));
  results.push(result); console.log(JSON.stringify({ ...result, failedTests: result.failedTests.map(t => t.name) }));
  return child.status === 0;
}
function typecheck(name, pkg) {
  const child = command(pkg, 'typescript/bin/tsc', ['--noEmit']);
  const result = { name, exitCode: child.status, output: child.stdout + child.stderr };
  results.push(result); console.log(JSON.stringify(result));
  return child.status === 0;
}
function capture(name) {
  let patch = '';
  for (const [path, original] of changes) {
    for (const [version, content] of [['before', original], ['after', read(path)]]) {
      const destination = join(scratch, 'diff', version, path);
      mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, content);
    }
    const before = join(scratch, 'diff/before', path), after = join(scratch, 'diff/after', path);
    const diff = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', before, after], { encoding: 'utf8' });
    if (diff.status !== 0 && diff.status !== 1) throw Error(diff.stderr);
    patch += diff.stdout.replaceAll(`a${before}`, `a/${path}`).replaceAll(`b${after}`, `b/${path}`);
  }
  writeFileSync(join(evidence, `${name}.patch`), patch);
}
function reset() { for (const [path, original] of changes) writeFileSync(join(scratch, path), original); changes.clear(); }

try {
  for (const file of ['package.json', 'tsconfig.base.json']) cpSync(join(root, file), join(scratch, file));
  cpSync(join(root, 'scripts'), join(scratch, 'scripts'), { recursive: true });
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'));
  for (const pkg of [runtime, host]) {
    cpSync(join(root, pkg), join(scratch, pkg), { recursive: true, filter: path => !/(?:^|\/)(?:node_modules|dist|dist-validation)(?:\/|$)/.test(path) });
    symlinkSync(join(root, pkg, 'node_modules'), join(scratch, pkg, 'node_modules'));
  }
  // Pin every workspace import to this temporary source tree, never installed dist.
  restoreArchitectureBaseline(root, scratch);
  const aliases = Object.entries({ '@nexus/plugin-runtime/browser': 'browser/index.ts', '@nexus/plugin-runtime/client': 'ui-client.ts', '@nexus/plugin-runtime/react': 'ui-react.tsx', '@nexus/plugin-runtime': 'index.ts' })
    .map(([find, path]) => ({ find, replacement: join(scratch, runtime, 'src', path) }));
  writeFileSync(join(scratch, 'vitest.substitution.mjs'), `export default ${JSON.stringify({ resolve: { alias: aliases } })};`);

  // Contract probes are identical for baseline and all replacements.
  const probeSource = readFileSync(join(root, 'docs/validation/substitution-probes.txt'), 'utf8');
  writeFileSync(join(scratch, runtime, 'test/substitution.test.ts'), probeSource);
  mkdirSync(join(scratch, host, 'test/reference'), { recursive: true });
  for (const file of ['route-model.ts', 'path-space.ts']) cpSync(join(scratch, host, 'src/routing', file), join(scratch, host, 'test/reference', file));
  writeFileSync(join(scratch, host, 'test/substitution.test.ts'), readFileSync(join(root, 'docs/validation/substitution-route-probes.txt'), 'utf8'));
  for (const pkg of [runtime, host]) {
    if (!test(`baseline-${pkg.split('/').at(-1)}`, pkg) || !typecheck(`baseline-types-${pkg.split('/').at(-1)}`, pkg)) throw Error('Baseline failed.');
  }

  // S1: delete the second mutable declaration registry and transaction.
  // The existing read interface is retained as a projection for its consumers.
  edit(`${runtime}/src/surface-definition.ts`, original => {
    const recordTypes = original.slice(original.indexOf('export interface SurfaceDefinitionRecord'), original.indexOf('export interface SurfaceDefinitionActivation'));
    return `import type { PluginId } from './identifiers';\nimport type { ContributionRegistry, SandboxSurfaceDefinition } from './contribution';\n${recordTypes}
export function projectSurfaceDefinitions(registry: ContributionRegistry, versionOf: (owner: PluginId) => string | undefined): SurfaceDefinitionRegistry {
  const list = (owner?: PluginId): readonly SurfaceDefinitionRecord[] => Object.freeze(registry.listUiSurfaces().flatMap(({ ownerPluginId, contribution }) => {
    const version = versionOf(ownerPluginId);
    if (version === undefined || contribution.target.kind !== 'sandbox-surface' || owner !== undefined && owner !== ownerPluginId) return [];
    return [Object.freeze({ pluginId: ownerPluginId, pluginVersion: version, definition: Object.freeze({ id: contribution.id }) })];
  }));
  return Object.freeze({ list, get: (owner: PluginId, id: string) => list(owner).find(record => record.definition.id === id) });
}\n`;
  });
  const bootstrap = `${runtime}/src/bootstrap.ts`;
  replace(bootstrap, '  createSurfaceDefinitionRegistry,', '  projectSurfaceDefinitions,');
  replace(bootstrap, '  const surfaceController = createSurfaceDefinitionRegistry();\n', '');
  replace(bootstrap, `    const surfaceActivation = surfaceController.beginDeclaration(
      manifest.id,
      manifest.version,
      manifest.surfaces,
    );\n`, '');
  for (const operation of ['validate', 'apply', 'discard']) replace(bootstrap, `      surfaceActivation.${operation}();\n`, '');
  replace(bootstrap, '    surfaces: surfaceController.registry,', '    surfaces: projectSurfaceDefinitions(contributionController.registry, owner => activeRestrictedRecords.get(owner)?.manifest.version),');
  capture('surface-projection');
  test('surface-projection-runtime', runtime); typecheck('surface-projection-types', runtime);
  test('surface-projection-host', host);
  reset();

  // S2: remove custom URL membership matching; existing RR matcher does the job.
  // Keep PathSpace grammar and intersection analysis, which RR does not provide.
  const pathSpace = `${host}/src/routing/path-space.ts`;
  edit(pathSpace, original => original.slice(0, original.indexOf('/** Decode once per segment')));
  const routeModel = `${host}/src/routing/route-model.ts`;
  replace(routeModel, 'makePath, matchSpace, parsePath', 'makePath, parsePath');
  replace(routeModel, 'matchSpace(r.space, location.pathname)', 'matchRoutes([{ path: r.space.path, caseSensitive: false }], location.pathname)');
  capture('router-membership');
  test('router-membership-host', host); typecheck('router-membership-types', host);
  reset();

  // S3: delete repeated policy/contract joins from occurrence reconciliation.
  // Existing runtime initialization compiles immutable admission facts once.
  const ui = `${runtime}/src/ui/runtime.ts`;
  edit(ui, original => {
    const start = original.indexOf('  function relations('), end = original.indexOf('  function endOccurrence(', start);
    if (start < 0 || end < 0) throw Error('UI relation anchor missing.');
    const old = original.slice(start, end);
    const compiler = old.replace('function relations(', 'function compileRelations(');
    const replacement = `${compiler}  const relationTable = new Map(registry.listExtensionPoints().map(({ ownerPluginId, contribution }) => [uiKey(ownerPluginId, contribution.id), frozenCopy(compileRelations(ownerPluginId, contribution))]));
  function relations(owner: string, point: ExtensionPointDefinition): readonly UiRelation[] { return relationTable.get(uiKey(owner, point.id)) ?? []; }
`;
    return original.slice(0, start) + replacement + original.slice(end);
  });
  capture('admission-at-initialization');
  test('admission-at-initialization-runtime', runtime); typecheck('admission-at-initialization-types', runtime);
  reset();
  for (const name of ['surface-projection', 'router-membership', 'admission-at-initialization']) {
    const applied = spawnSync('git', ['apply', '--', join(evidence, `${name}.patch`)], { cwd: scratch, encoding: 'utf8' });
    if (applied.status !== 0) throw Error(applied.stderr);
  }
  for (const pkg of [runtime, host]) {
    test(`combined-${pkg.split('/').at(-1)}`, pkg);
    typecheck(`combined-types-${pkg.split('/').at(-1)}`, pkg);
  }
  writeFileSync(join(root, 'docs/validation/architecture-substitution-results.json'), JSON.stringify({ recordedAt: new Date().toISOString(), node: process.version, baselineCommit: architectureBaseline,
    scope: 'Independent replacements in temporary source tree; full package unit suites, added contract probes and typechecking; source aliases explicitly set; no browser E2E or performance claim.', results }, null, 2) + '\n');
} finally { rmSync(scratch, { recursive: true, force: true }); }

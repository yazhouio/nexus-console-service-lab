import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import loader from '../artifact-css-loader.cjs';
import { checkCss } from '../check-plugin-css.mjs';

async function compile(file, namespace = 'fixture') {
  const assets = new Map(),
    dependencies = [];
  const source = await new Promise((resolve, reject) =>
    loader.call({
      resourcePath: file,
      getOptions: () => ({ namespace }),
      async: () => (error, code) => (error ? reject(error) : resolve(code)),
      emitFile(name, value) {
        assets.set(name, value);
      },
      addDependency(file) {
        dependencies.push(file);
      },
    }),
  );
  return { source, assets, dependencies };
}

test('artifact compilation bundles the complete CSS closure and publishes relative image URLs with content identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-artifact-'));
  try {
    await mkdir(join(directory, 'nested'));
    await writeFile(
      join(directory, 'entry.css'),
      '@import "./nested/part.css"; .fixture-card { color: var(--nexus-color-text-primary); }',
    );
    await writeFile(
      join(directory, 'nested/part.css'),
      '.fixture-picture { background-image: url("../picture.svg?v=1#icon"); }',
    );
    await writeFile(join(directory, 'picture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const result = await compile(join(directory, 'entry.css'));
    const [cssName, css] = [...result.assets].find(([name]) => name.endsWith('.css'));
    assert.match(cssName, /^static\/plugin-css\/fixture\.[a-f0-9]{20}\.css$/);
    assert.match(css, /var\(--nexus-color-text-primary\)/);
    assert.match(css, /\.\.\/plugin-assets\/[a-f0-9]{20}\.svg\?v=1#icon/);
    assert.doesNotMatch(css, /@import/);
    assert.equal(result.assets.size, 2);
    assert.equal(result.dependencies.length, 3);
    assert.match(result.source, /__webpack_public_path__/);
    await writeFile(
      join(directory, 'picture.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>',
    );
    const changed = await compile(join(directory, 'entry.css'));
    assert.notEqual(
      [...changed.assets.keys()].find((name) => name.endsWith('.css')),
      cssName,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CSS Modules retain JS mappings and use plugin identity plus source content in generated names', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-modules-'));
  try {
    const file = join(directory, 'entry.module.css');
    await writeFile(file, '.card { color: var(--nexus-color-text-primary); }');
    const first = await compile(file),
      independent = await compile(file, 'other');
    const mapping = (result) => JSON.parse(/export default (.*);/.exec(result.source)[1]);
    assert.match(mapping(first).card, /^fixture-[a-f0-9]{20}-/);
    assert.notEqual(mapping(first).card, mapping(independent).card);
    await writeFile(file, '.card { color: var(--nexus-color-text-muted); }');
    assert.notEqual(mapping(first).card, mapping(await compile(file)).card);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('build rejects incomplete imports, missing assets and invalid CSS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-invalid-'));
  try {
    for (const source of [
      '@import "https://example.com/styles.css";',
      '@import "./missing.css";',
      '.fixture-card { background: url("missing.png") }',
      '.fixture-card { color: ',
    ]) {
      const file = join(directory, 'entry.css');
      await writeFile(file, source);
      await assert.rejects(compile(file));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('compiled ownership rules reject resets, foreign classes, token writes and global registrations', () => {
  for (const css of [
    'button { color: red }',
    '.fixture-root button { color: red }',
    '.fixture-root [role=tab] { color: red }',
    '.foreign-button { color: red }',
    ':root { --nexus-color-surface: red }',
    '.fixture-root { --nexus-color-surface: red }',
    '@property --nexus-color-surface { syntax: "<color>"; inherits: false; initial-value: red }',
    '@keyframes spin { to { opacity: 0 } }',
    '@layer shared { .fixture-card { color: red } }',
    '@font-face { font-family: Shared; src: url(font.woff2) }',
    '.fixture-root { --other-value: red }',
    '.fixture-root { position: fixed }',
    '.fixture-root { z-index: 100 }',
    '.fixture-root { color: red!important }',
    '.fixture-root [data-nexus-slot] { display: none }',
    '.fixture-root:is(body) { color:red }',
  ])
    assert.throws(() => checkCss(css, 'fixture'), css);
  assert.doesNotThrow(() =>
    checkCss(
      '.fixture-tab[aria-selected=true] { color:var(--nexus-color-action-primary) } @keyframes fixture-spin { to { opacity:0 } }',
      'fixture',
    ),
  );
});

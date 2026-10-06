#!/usr/bin/env node
// Validates the published shape of every non-private workspace package:
// publint checks the package.json exports/files map against the packed tarball,
// attw checks that each typed entrypoint resolves under node16 (ESM) and bundler.
// Packages must be built first (`pnpm build`).
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// Entrypoints that intentionally ship without type declarations.
const attwExcludedEntrypoints = {
  '@feforgejs/console-core': ['styles.css'],
  '@feforgejs/plugin-build': ['artifact-css-loader', 'reject-unmanaged-css'],
};
// Packages that publish no JavaScript/types at all.
const attwSkipped = new Set(['@feforgejs/design-tokens']);

const packages = readdirSync(join(root, 'packages'))
  .map((dir) => join(root, 'packages', dir))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }))
  .filter(({ manifest }) => !manifest.private);

const run = (label, command, args, cwd) => {
  console.log(`\n▶ ${label}`);
  const { status } = spawnSync(command, args, { cwd, stdio: 'inherit' });
  return status === 0;
};

const failures = [];
for (const { dir, manifest } of packages) {
  const { name } = manifest;
  if (!run(`publint ${name}`, 'pnpm', ['exec', 'publint', '--strict', dir], root))
    failures.push(`publint ${name}`);
  if (attwSkipped.has(name)) continue;
  const exclude = attwExcludedEntrypoints[name] ?? [];
  const args = [
    'exec',
    'attw',
    '--pack',
    '.',
    '--profile',
    'esm-only',
    '--format',
    'table-flipped',
  ];
  if (exclude.length) args.push('--exclude-entrypoints', ...exclude);
  if (!run(`attw ${name}`, 'pnpm', args, dir)) failures.push(`attw ${name}`);
}

if (failures.length) {
  console.error(`\n✖ Package export checks failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`\n✔ ${packages.length} packages passed publint and attw`);

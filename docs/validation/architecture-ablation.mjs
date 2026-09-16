// Run from the workspace: node docs/validation/architecture-ablation.mjs
// Mutations run only in a temporary copy; production sources are never edited.
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { architectureBaseline, restoreArchitectureBaseline } from './architecture-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = mkdtempSync(join(tmpdir(), 'nexus-ablation-'));
const results = [];
const packages = ['packages/plugin-runtime', 'apps/host'];
try {
  cpSync(join(root, 'package.json'), join(scratch, 'package.json'));
  cpSync(join(root, 'tsconfig.base.json'), join(scratch, 'tsconfig.base.json'));
  if (existsSync(join(root, 'node_modules')))
    symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'));
  for (const pkg of packages) {
    cpSync(join(root, pkg), join(scratch, pkg), {
      recursive: true,
      filter: (path) => !/(?:^|\/)(?:node_modules|dist|dist-validation)(?:\/|$)/.test(path),
    });
    symlinkSync(join(root, pkg, 'node_modules'), join(scratch, pkg, 'node_modules'));
  }
  restoreArchitectureBaseline(root, scratch);
  function run(name, pkg, files) {
    const output = join(scratch, `${name}.json`);
    const child = spawnSync(
      process.execPath,
      [
        join(root, pkg, 'node_modules/vitest/vitest.mjs'),
        'run',
        ...files,
        '--reporter=json',
        `--outputFile=${output}`,
      ],
      {
        cwd: join(scratch, pkg),
        encoding: 'utf8',
        timeout: 60_000,
      },
    );
    if (!existsSync(output)) throw Error(`${name}: ${child.error ?? child.stderr ?? child.stdout}`);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    if (report.numTotalTests === 0)
      throw Error(`${name}: ${child.stderr}\n${child.stdout}\n${JSON.stringify(report)}`);
    const result = {
      name,
      exitCode: child.status,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      failedTests: report.testResults.flatMap((suite) =>
        suite.assertionResults
          .filter((test) => test.status === 'failed')
          .map((test) => test.fullName),
      ),
    };
    results.push(result);
    console.log(JSON.stringify(result));
    return result;
  }
  const uiTests = ['test/ui-runtime.test.ts'];
  const routeTests = [
    'test/route-model.test.ts',
    'test/navigation.test.ts',
    'test/router-compatibility.test.ts',
  ];
  for (const baseline of [
    run('baseline-ui', packages[0], uiTests),
    run('baseline-routing', packages[1], routeTests),
  ]) {
    if (baseline.exitCode !== 0)
      throw Error('Baseline failed; ablation results would be uninterpretable.');
  }
  function mutate(name, pkg, file, before, after, tests) {
    const path = join(scratch, pkg, file),
      original = readFileSync(path, 'utf8');
    if (original.split(before).length !== 2) throw Error(`Mutation anchor must be unique: ${name}`);
    try {
      writeFileSync(path, original.replace(before, after));
      const result = run(name, pkg, tests);
      if (result.failed === 0)
        throw Error(`Mutation survived: ${name}; inspect coverage before concluding redundancy.`);
    } finally {
      writeFileSync(path, original);
    }
  }
  mutate(
    'remove-ui-admission',
    packages[0],
    'src/ui/runtime.ts',
    "const authorized = ownerPluginId === pointOwner || options.policy({ kind: 'surface', contributorId: ownerPluginId, ownerPluginId: pointOwner, targetId: point.id, contractMajor: c.point.contractMajor });",
    'const authorized = true;',
    uiTests,
  );
  mutate(
    'end-scope-on-attempt-failure',
    packages[0],
    'src/ui/runtime.ts',
    'void endAttempt(a); a.scope.changed?.(); changed();',
    'endScope(a.scope); a.scope.changed?.(); changed();',
    uiTests,
  );
  mutate(
    'remove-route-overlap-governance',
    packages[1],
    'src/routing/route-model.ts',
    "const candidates = routes.filter(r => r.state === 'AVAILABLE');",
    'const candidates: ResolvedRoute[] = [];',
    routeTests,
  );
  writeFileSync(
    join(root, 'docs/validation/architecture-ablation-results.json'),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        node: process.version,
        baselineCommit: architectureBaseline,
        scope:
          'Existing UI core and routing unit tests; independent one-factor mutations in a temporary source copy. Host dependencies use installed workspace packages. No browser E2E or target-design implementation experiment.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

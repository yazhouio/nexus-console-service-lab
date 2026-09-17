#!/usr/bin/env node
// One-time local setup after the first manual publish: registers GitHub Actions OIDC as the trusted
// publisher of every publishable package, then locks each package to 2FA-or-OIDC publishing only.
//
//   npm login
//   pnpm release:trust --dry-run
//   pnpm release:trust
//
// Flags: --dry-run (print only), --skip-mfa (do not disallow token publishing).
// The workflow file and environment below must match .github/workflows/release.yml exactly.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_FILE = 'release.yml';
const ENVIRONMENT = 'npm';

const root = new URL('..', import.meta.url).pathname;
const dryRun = process.argv.includes('--dry-run');
const skipMfa = process.argv.includes('--skip-mfa');

const packages = readdirSync(join(root, 'packages'))
  .map((dir) => join(root, 'packages', dir, 'package.json'))
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')))
  .filter((manifest) => !manifest.private);

const npm = (args, { inherit = false } = {}) =>
  spawnSync('npm', args, { cwd: root, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe' });

const repositoryOf = (manifest) => {
  const url =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  const match = url?.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
  if (!match)
    throw new Error(
      `${manifest.name}: package.json "repository" must point at the GitHub repo (required for trusted publishing)`,
    );
  return match[1];
};

const whoami = npm(['whoami']);
if (whoami.status !== 0) {
  console.error('✖ Not logged in to npm. Run `npm login` first.');
  process.exit(1);
}
console.log(`npm user: ${whoami.stdout.trim()}${dryRun ? ' (dry run)' : ''}\n`);

const failures = [];
for (const manifest of packages) {
  const { name } = manifest;
  const repository = repositoryOf(manifest);

  if (npm(['view', name, 'name']).status !== 0) {
    failures.push(
      `${name}: not on the registry yet — run the first manual publish (pnpm release) before configuring trust`,
    );
    continue;
  }

  const existing = npm(['trust', 'list', name, '--json']);
  const alreadyTrusted =
    existing.status === 0 &&
    existing.stdout.includes(repository) &&
    existing.stdout.includes(WORKFLOW_FILE);
  if (alreadyTrusted) {
    console.log(`= ${name}: already trusts ${repository} ${WORKFLOW_FILE}`);
  } else {
    const args = [
      'trust',
      'github',
      name,
      '--file',
      WORKFLOW_FILE,
      '--repository',
      repository,
      '--environment',
      ENVIRONMENT,
      '--yes',
    ];
    console.log(`+ npm ${args.join(' ')}`);
    if (!dryRun && npm(args, { inherit: true }).status !== 0) {
      failures.push(`${name}: npm trust github failed`);
      continue;
    }
  }

  if (!skipMfa) {
    // "Require two-factor authentication and disallow tokens": OIDC and interactive 2FA remain the only ways to publish.
    const args = ['access', 'set', 'mfa=publish', name];
    console.log(`+ npm ${args.join(' ')}`);
    if (!dryRun && npm(args, { inherit: true }).status !== 0)
      failures.push(`${name}: npm access set mfa=publish failed`);
  }
}

if (failures.length) {
  console.error(`\n✖ Trusted publishing setup incomplete:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `\n✔ ${packages.length} packages ${dryRun ? 'would be' : 'are'} published only from ${WORKFLOW_FILE} (environment: ${ENVIRONMENT})`,
);

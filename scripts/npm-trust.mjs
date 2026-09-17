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
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const WORKFLOW_FILE = 'release.yml';
export const ENVIRONMENT = 'npm';
// `npm trust github` requires --allow-publish since npm 11.15.0; the npm bundled with the
// pinned Node 24.14.1 is older, so the trust commands run through a pinned CLI instead.
const NPM_CLI = 'npm@11.19.1';
// Registry permission granted by --allow-publish (release.yml publishes directly, not staged).
export const PUBLISH_PERMISSION = 'createPackage';

// Registry permission IDs behind the labels `npm trust list` prints.
const PERMISSION_LABELS = { publish: PUBLISH_PERMISSION, 'stage publish': 'createStagedPackage' };
const TRUST_FIELD = /^(type|id|file|repository|environment|permissions): (.*)$/;

// Parses the human-readable output of the pinned `npm trust list`. `--json` cannot be used:
// in JSON mode npm buffers the 2FA authentication URL until exit, so the prompt never shows.
// Each configuration starts with a `type:` line; unrelated lines (2FA prompts, notices) are ignored.
export function parseTrustList(stdout) {
  const configs = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = TRUST_FIELD.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'type') configs.push({ type: value });
    else if (configs.length === 0) throw new Error(`Unrecognized npm trust list output: ${line}`);
    else if (key === 'permissions')
      configs.at(-1).permissions = value
        .split(', ')
        .map((label) => PERMISSION_LABELS[label] ?? label);
    else configs.at(-1)[key] = value;
  }
  return configs;
}

// Decides how to converge a package's trust configurations on exactly one binding for
// repository + workflow + environment with direct publish permission.
export function planTrust(
  configs,
  { repository, file = WORKFLOW_FILE, environment = ENVIRONMENT },
) {
  const sameWorkflow = configs.filter(
    (config) =>
      (config.type ?? 'github') === 'github' &&
      config.repository?.toLowerCase() === repository.toLowerCase() &&
      config.file === file,
  );
  const isValid = (config) =>
    config.environment === environment &&
    Array.isArray(config.permissions) &&
    config.permissions.includes(PUBLISH_PERMISSION);
  const valid = sameWorkflow.find(isValid);
  return {
    satisfied: Boolean(valid),
    revoke: sameWorkflow.filter((config) => !isValid(config)),
    create: !valid,
    unrelated: configs.filter((config) => !sameWorkflow.includes(config)),
  };
}

const describe = (config) =>
  `${config.repository ?? '?'} ${config.file ?? '?'} env=${config.environment ?? '(none)'} permissions=${(config.permissions ?? []).join(',') || '(none)'}`;

async function main() {
  const root = new URL('..', import.meta.url).pathname;
  const dryRun = process.argv.includes('--dry-run');
  const skipMfa = process.argv.includes('--skip-mfa');

  const packages = readdirSync(join(root, 'packages'))
    .map((dir) => join(root, 'packages', dir, 'package.json'))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, 'utf8')))
    .filter((manifest) => !manifest.private);

  const npm = (args, { inherit = false } = {}) =>
    spawnSync('npx', ['--yes', NPM_CLI, ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: inherit ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    });

  // Reading trust configurations requires 2FA, but npm only prompts for it when stdout is a TTY.
  // Report stdout as a TTY, mirror it to stderr so the prompt stays visible, and capture it for parsing.
  const npmInteractiveCapture = (args) =>
    new Promise((resolve, reject) => {
      const preload = `data:text/javascript,${encodeURIComponent("Object.defineProperty(process.stdout, 'isTTY', { value: true });")}`;
      const child = spawn('npx', ['--yes', NPM_CLI, ...args, '--color=false'], {
        cwd: root,
        stdio: ['inherit', 'pipe', 'inherit'],
        env: {
          ...process.env,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${preload}`.trim(),
        },
      });
      let stdout = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        process.stderr.write(chunk);
      });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout }));
    });

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

  const listTrust = async (name) => {
    const result = await npmInteractiveCapture(['trust', 'list', name]);
    if (result.status !== 0) throw new Error('npm trust list failed (see output above)');
    return parseTrustList(result.stdout);
  };

  const whoami = npm(['whoami']);
  if (whoami.status !== 0) {
    console.error('✖ Not logged in to npm. Run `npm login` first.');
    process.exit(1);
  }
  console.log(`npm user: ${whoami.stdout.trim()} via ${NPM_CLI}${dryRun ? ' (dry run)' : ''}\n`);

  const failures = [];
  for (const manifest of packages) {
    const { name } = manifest;
    try {
      const repository = repositoryOf(manifest);

      if (npm(['view', name, 'name']).status !== 0) {
        failures.push(
          `${name}: not on the registry yet — run the first manual publish (pnpm release) before configuring trust`,
        );
        continue;
      }

      const plan = planTrust(await listTrust(name), { repository });
      for (const config of plan.unrelated) {
        console.warn(
          `! ${name}: leaving unrelated trusted publisher untouched: ${describe(config)}`,
        );
      }
      if (plan.satisfied && plan.revoke.length === 0) {
        console.log(`= ${name}: already trusts ${repository} ${WORKFLOW_FILE} env=${ENVIRONMENT}`);
      }

      for (const config of plan.revoke) {
        if (!config.id)
          throw new Error(`cannot revoke a binding without an id: ${describe(config)}`);
        const args = ['trust', 'revoke', name, '--id', config.id];
        console.log(`- npm ${args.join(' ')}   # ${describe(config)}`);
        if (!dryRun && npm(args, { inherit: true }).status !== 0) {
          throw new Error('npm trust revoke failed');
        }
      }

      if (plan.create) {
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
          '--allow-publish',
          '--yes',
        ];
        console.log(`+ npm ${args.join(' ')}`);
        if (!dryRun && npm(args, { inherit: true }).status !== 0) {
          throw new Error('npm trust github failed');
        }
      }

      if (!dryRun && (plan.create || plan.revoke.length > 0)) {
        const after = planTrust(await listTrust(name), { repository });
        if (!after.satisfied || after.revoke.length > 0) {
          throw new Error(
            'trust configuration still does not match release.yml after applying changes',
          );
        }
      }

      if (!skipMfa) {
        // "Require two-factor authentication and disallow tokens": OIDC and interactive 2FA remain the only ways to publish.
        const args = ['access', 'set', 'mfa=publish', name];
        console.log(`+ npm ${args.join(' ')}`);
        if (!dryRun && npm(args, { inherit: true }).status !== 0) {
          throw new Error('npm access set mfa=publish failed');
        }
      }
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }

  if (failures.length) {
    console.error(`\n✖ Trusted publishing setup incomplete:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `\n✔ ${packages.length} packages ${dryRun ? 'would be' : 'are'} published only from ${WORKFLOW_FILE} (environment: ${ENVIRONMENT})`,
  );
}

if (import.meta.main) await main();

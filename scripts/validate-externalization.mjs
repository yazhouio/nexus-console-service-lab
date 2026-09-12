// Production tarball consumers in fresh directories: no workspace paths, source symlinks or copied build tools.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { chromium } from '@playwright/test';
const repo = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'nexus-externalization-'));
const report = { scratch, cases: [], requests: [] };
const packages = ['plugin-runtime', 'browser-host', 'console-core-api', 'cluster-api', 'console-core', 'design-tokens', 'plugin-build'];
const host = join(scratch, 'host'), remote = join(scratch, 'remote'), restricted = join(scratch, 'restricted'), tarballs = join(scratch, 'tarballs');
await Promise.all([host, remote, restricted, tarballs].map(path => mkdir(path, { recursive: true })));
console.log(`Externalization validation: ${scratch}`);
async function run(cmd, args, cwd = repo) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('error', reject); child.on('close', code => code ? reject(Error(`${cmd} ${args.join(' ')}\n${output}`)) : resolve(output));
  });
}
const servers = []; const errors = []; let browser, page;
async function serve(dir, remoteServer = false) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const file = remoteServer ? path.replace(/^\/extension-demo\/1\.0\.0\//, '') : (extname(path) ? path : 'index.html');
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 'no-store');
    try {
      if (path.includes('missing')) throw Error('404');
      const restrictedPath = !remoteServer && path.startsWith('/plugins/kubeeye/1.0.0/');
      const bytes = await readFile(restrictedPath ? join(restricted, 'dist', path.slice('/plugins/kubeeye/1.0.0/'.length) || 'index.html') : join(dir, file));
      res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
      report.requests.push({ remote: remoteServer, path, status: 200, bytes: bytes.length }); res.end(bytes);
    } catch { report.requests.push({ remote: remoteServer, path, status: 404 }); res.writeHead(404).end(); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done)); servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
try {
  await run('pnpm', ['--filter', '@nexus/browser-host...', '--filter', '@nexus/console-core...', '--filter', '@nexus/cluster-api', 'build']);
  const deps = {};
  for (const name of packages) {
    const dir = join(repo, 'packages', name), pkg = JSON.parse(await readFile(join(dir, 'package.json')));
    await run('pnpm', ['pack', '--pack-destination', tarballs], dir);
    const tgz = join(tarballs, `nexus-${name}-${pkg.version}.tgz`);
    deps[pkg.name] = `file:${tgz}`;
    await run('tar', ['-xzf', tgz, '-C', tarballs]);
    const packed = JSON.parse(await readFile(join(tarballs, 'package/package.json'), 'utf8'));
    for (const group of ['dependencies', 'peerDependencies', 'optionalDependencies']) for (const version of Object.values(packed[group] ?? {})) assert.ok(!/^(workspace|catalog):/.test(version), `${name}: unresolved ${version}`);
  }
  const common = { ...deps, react: '19.2.8', 'react-dom': '19.2.8', '@types/react': '19.2.18', '@types/react-dom': '19.2.5', '@types/node': '22.20.1', typescript: '7.0.2', '@rsbuild/core': '2.2.2', '@rspack/core': '2.2.2', '@rsbuild/plugin-react': '2.1.0' };
  await cp(join(repo, 'apps/example-builtin-plugin/src'), join(remote, 'src'), { recursive: true });
  for (const file of ['rsbuild.config.ts', 'tsconfig.json']) await cp(join(repo, 'apps/example-builtin-plugin', file), join(remote, file));
  await writeFile(join(remote, 'package.json'), JSON.stringify({ name: 'external-demo', overrides: { '@rspack/core': '2.2.2' }, version: '1.0.0', type: 'module', dependencies: { ...common, '@module-federation/runtime-tools': '2.9.0' } }));
  await writeFile(join(host, 'package.json'), JSON.stringify({ name: 'external-host', overrides: { '@rspack/core': '2.2.2' }, type: 'module', dependencies: { ...common, '@module-federation/enhanced': '2.9.0' } }));
  await cp(join(repo, 'apps/example-restricted-plugin/src'), join(restricted, 'src'), { recursive: true });
  for (const file of ['index.html', 'manifest.ts', 'build-manifest.mjs', 'rspack.config.mjs', 'tsconfig.json']) await cp(join(repo, 'apps/example-restricted-plugin', file), join(restricted, file));
  await writeFile(join(restricted, 'package.json'), JSON.stringify({ name: 'external-restricted', overrides: { '@rspack/core': '2.2.2' }, type: 'module', dependencies: { ...common, '@rspack/cli': '2.2.2', '@rspack/core': '2.2.2', '@rspack/dev-server': '2.2.1', '@rspack/plugin-react-refresh': '2.0.2', 'react-refresh': '0.18.0' } }));
  const installed = await Promise.allSettled([host, remote, restricted].map(dir => run('npm', ['install', '--no-audit', '--no-fund'], dir)));
  for (const result of installed) if (result.status === 'rejected') throw result.reason;
  await run('npx', ['tsc', '--noEmit'], restricted);
  await run('node', ['build-manifest.mjs'], restricted);
  await run('npx', ['rspack', 'build', '--mode', 'production'], restricted);
  const manifest = JSON.parse(await readFile(join(restricted, 'dist/manifest.json')));
  assert.equal(manifest.entry, '/plugins/kubeeye/1.0.0/');
  for (const file of ['cluster.tsx', 'cluster-data.ts', 'cluster.css', 'kubeeye-installation.ts']) await cp(join(repo, 'apps/console/src/plugins', file), join(host, file));
  for (const file of ['manifest.json', 'manifest-v2.json']) await cp(join(restricted, file), join(host, file));
  await writeFile(join(host, 'kubeeye-manifest.ts'), (await readFile(join(repo, 'apps/console/src/plugins/kubeeye-manifest.ts'), 'utf8')).replaceAll('@nexus/example-restricted-plugin/', './'));
  report.cases.push('restricted-tarball-consumer-builds-versioned-manifest-and-html');
  const remoteOrigin = await serve(join(remote, 'dist'), true);
  await writeFile(join(remote, '.env'), `NEXUS_REMOTE_BASE=${remoteOrigin}/extension-demo/1.0.0/\n`);
  await cp(join(repo, 'apps/console/src/federation-builtins.ts'), join(host, 'federation-builtins.ts'));
  await cp(join(repo, 'apps/console/src/routing/contribution-policy.ts'), join(host, 'policy.ts'));
  await writeFile(join(host, 'env.d.ts'), "declare module '*.css'; declare module '*.css?artifact' { export const css: readonly string[]; }\n");
  await writeFile(join(host, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, resolveJsonModule: true }, include: ['*.ts', '*.tsx'] }));
  await writeFile(join(host, 'main.tsx'), `
import '@nexus/design-tokens/theme.css';
import '@nexus/design-tokens/baseline.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserHost, type BrowserDistribution } from '@nexus/browser-host';
import { consoleCore } from '@nexus/console-core';
import { css } from '@nexus/console-core/styles.css?artifact';
import { CONSOLE_PROFILES, PLUGIN_REF_CONTRACT, CORE_ROUTES_POINT, PRIMARY_NAVIGATION_POINT } from '@nexus/console-core-api';
import { RESOURCE_REF_CONTRACT, DEPLOYMENT_PROFILES } from '@nexus/cluster-api';
import { createInstallationStore } from '@nexus/plugin-runtime';
import { federationBuiltins } from './federation-builtins';
import { contributionGovernance } from './policy';
import { cluster } from './cluster';
import { css as clusterCss } from './cluster.css?artifact';
import { kubeeyeInstallation, clusterBridgeContract } from './kubeeye-installation';
const scenario = new URLSearchParams(location.search).get('case');
const prepare = federationBuiltins([{ id: 'extension-demo', version: scenario === 'identity' ? '9.0.0' : '1.0.0', name: 'nexus_extension_demo_1_0_0', entry: '${remoteOrigin}/extension-demo/1.0.0/' + (scenario === '404' || scenario === 'core' ? 'missing.js' : 'remoteEntry.js') }], scenario === 'timeout' ? 50 : 15_000);
const starts = { preparations: 0, stores: 0 };
Object.assign(window, { starts });
const distribution: BrowserDistribution = {
  applicationLabel: 'External Console', builtins: [consoleCore, cluster], builtinCss: { [consoleCore.id]: css, [cluster.id]: clusterCss },
  bridgeContracts: [clusterBridgeContract],
  prepareBuiltins: () => { starts.preparations++; return prepare(); }, coreRootIds: scenario === 'core' ? ['console-core', 'extension-demo'] : ['console-core'],
  rootPresentation: { ownerPluginId: 'console-core', surfaceId: 'root' }, rootRoutePoint: CORE_ROUTES_POINT, navigationRootPoints: [PRIMARY_NAVIGATION_POINT],
  supportedHostApis: ['kubesphere.console@1'], profiles: [...CONSOLE_PROFILES, ...DEPLOYMENT_PROFILES], refContracts: [PLUGIN_REF_CONTRACT, RESOURCE_REF_CONTRACT],
  policyBundle: contributionGovernance, capabilityGrants: { cluster: ['routes.query','routes.navigate'], 'console-core': ['routes.query','routes.navigate','plugins.query','plugins.manage','diagnostics.query','diagnostics.export','audit.query'] },
  createStore: bridgeContracts => { starts.stores++; return createInstallationStore({ records: [kubeeyeInstallation], isEntryAllowed: entry => entry.startsWith('/plugins/'), supportedHostApis: ['kubesphere.console@1'], bridgeContracts }); }, recovery: { clearInstallations() {} },
};
let root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><BrowserHost distribution={distribution} /></StrictMode>);
Object.assign(window, { unmountHost: () => root.unmount(), remountHost: () => { root = createRoot(document.getElementById('root')!); root.render(<BrowserHost distribution={distribution} />); } });
`);
  await writeFile(join(host, 'rsbuild.config.ts'), `
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ArtifactCssClosure } from '@nexus/plugin-build/closure';
const require = createRequire(import.meta.url);
export default defineConfig({ plugins: [pluginReact({ fastRefresh: false })], source: { entry: { index: './main.tsx' }, define: { 'process.env.PUBLIC_TEST_FIXTURES': '"false"', NEXUS_SHARED_VERSIONS: JSON.stringify({ react: require('react/package.json').version, sdk: require('@nexus/plugin-runtime/package.json').version }) } }, output: { assetPrefix: '/' }, tools: { bundlerChain(chain, { CHAIN_ID }) {
  chain.plugin('closure').use(ArtifactCssClosure, [resolve(import.meta.dirname, 'main.tsx')]);
  chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
  chain.module.rule('artifact').include.add(require.resolve('@nexus/console-core/styles.css')).end().test(/\\.css$/).resourceQuery(/artifact/).type('javascript/auto').use('artifact').loader(require.resolve('@nexus/plugin-build/artifact-css-loader')).options({ namespace: 'core', allowFixed: true });
  chain.module.rule('cluster').include.add(resolve(import.meta.dirname, 'cluster.css')).end().test(/\\.css$/).resourceQuery(/artifact/).type('javascript/auto').use('artifact').loader(require.resolve('@nexus/plugin-build/artifact-css-loader')).options({ namespace: 'cluster' });
} } });
`);
  for (const dir of [remote, host]) { await run('npx', ['tsc', '--noEmit'], dir); await run('npx', ['rsbuild', 'build'], dir); }
  report.cases.push('tarball-install-typecheck-production-build');
  const hostOrigin = await serve(join(host, 'dist'));
  browser = await chromium.launch();
  page = await browser.newPage(); page.setDefaultTimeout(10_000);
  page.on('pageerror', error => errors.push(String(error)));
  const started = Date.now();
  await page.goto(hostOrigin + '/extensions');
  await page.getByRole('heading', { name: 'Extension points', exact: true }).waitFor();
  report.routeReadyMs = Date.now() - started;
  assert.equal(await page.locator('link[data-nexus-artifact-css]').count(), 2);
  await page.getByRole('button', { name: /Copy console-core/ }).first().click();
  await page.getByText('Copied', { exact: true }).waitFor();
  report.cases.push('cross-origin-remote-route-hooks-css');
  await page.evaluate(() => window.unmountHost());
  await page.waitForFunction(() => !document.querySelector('link[data-nexus-artifact-css]'));
  report.cases.push('host-unmount-releases-css');
  const scriptCount = report.requests.filter(request => request.remote && request.path.endsWith('.js')).length;
  const warmStarted = Date.now();
  await page.evaluate(() => window.remountHost());
  await page.getByRole('heading', { name: 'Extension points', exact: true }).waitFor();
  report.warmRouteReadyMs = Date.now() - warmStarted;
  assert.equal(report.requests.filter(request => request.remote && request.path.endsWith('.js')).length, scriptCount);
  report.cases.push('remount-reuses-successful-remote-modules');
  for (const scenario of ['404', 'identity']) {
    await page.goto(hostOrigin + '/?case=' + scenario);
    await page.getByRole('heading', { name: 'Frontend Plugin Runtime', exact: true }).waitFor();
    report.cases.push('feature-' + scenario + '-preserves-core');
  }
  await page.goto(hostOrigin + '/?case=core');
  await page.getByRole('heading', { name: 'Runtime startup failed' }).waitFor();
  assert.match(await page.getByTestId('runtime-snapshot').innerText(), /missing.js/);
  report.cases.push('core-failure-preserves-preparation-diagnostics');
  await page.goto(hostOrigin + '/settings');
  await page.getByRole('button', { name: 'Fast mode', exact: true }).click();
  await page.getByText('Current mode: fast', { exact: true }).waitFor();
  report.cases.push('remote-slot-independent-root-hooks');
  await page.goto(hostOrigin + '/clusters/demo/nodes/n1/events');
  await page.getByRole('button', { name: 'Check node health', exact: true }).click();
  await page.locator('pre').filter({ hasText: /"checkedBy":\s*"extension-demo"/ }).waitFor();
  await page.getByRole('tab', { name: 'Health', exact: true }).click();
  await page.getByRole('heading', { name: 'Node health checks', exact: true }).waitFor();
  await page.getByText('ResourceRef accepted', { exact: true }).waitFor();
  report.cases.push('remote-action-and-tab-surface-context');
  await page.goto(hostOrigin + '/kubeeye');
  await page.locator('[data-testid="restricted-surface"][data-bridge-state="CONNECTED"]').waitFor();
  await page.getByRole('button', { name: 'Read current cluster' }).click();
  await page.getByTestId('current-cluster').filter({ hasText: 'demo-cluster' }).waitFor();
  await page.getByRole('button', { name: 'Watch current cluster', exact: true }).click();
  await page.getByRole('button', { name: 'Stop watching', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop watching', exact: true }).click();
  await page.evaluate(() => window.unmountHost());
  await page.waitForFunction(() => !document.querySelector('wujie-app'));
  report.cases.push('independently-published-restricted-same-origin-bridge-and-disposal');
  // A delayed entry may still evaluate, but cannot commit after Host disposal or timeout.
  await page.route('**/remoteEntry.js', async route => { await new Promise(done => setTimeout(done, 400)); await route.continue().catch(() => {}); });
  await page.goto(hostOrigin + '/?case=timeout');
  await page.getByRole('heading', { name: 'Frontend Plugin Runtime', exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('link', { name: 'Extension points', exact: true }).count(), 0);
  report.cases.push('timeout-late-definition-does-not-enter-runtime');
  await page.goto(hostOrigin + '/extensions');
  await page.getByRole('status').waitFor();
  await page.evaluate(() => window.unmountHost());
  await page.waitForTimeout(500);
  assert.equal(await page.locator('link[data-nexus-artifact-css]').count(), 0);
  assert.equal(await page.locator('#root').innerText(), '');
  assert.equal(await page.evaluate(() => window.starts.stores), 0);
  report.cases.push('unmount-during-preparation-has-no-late-store-or-ui');
  await page.unroute('**/remoteEntry.js');
  assert.deepEqual(errors, []);
  // Production React does not replay effects. Verify replay with a separate development build.
  await run('npx', ['rsbuild', 'build', '--mode', 'development'], host);
  await page.goto(hostOrigin + '/extensions');
  await page.getByRole('heading', { name: 'Extension points', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.starts.preparations), 2);
  assert.equal(await page.evaluate(() => window.starts.stores), 1);
  await page.evaluate(() => window.unmountHost());
  await page.waitForFunction(() => !document.querySelector('link[data-nexus-artifact-css]'));
  report.cases.push('development-strict-mode-replay-commits-one-runtime');
  assert.deepEqual(errors, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = String(error); report.browserErrors = errors; report.body = await page?.locator('body').innerText().catch(() => 'unavailable'); process.exitCode = 1; console.error(error); }
finally {
  await browser?.close(); await Promise.all(servers.map(server => new Promise(done => server.close(done))));
  await mkdir(join(repo, 'test-results/externalization'), { recursive: true });
  report.versions = {};
  for (const [label, directory] of [['host', host], ['remote', remote], ['restricted', restricted]]) {
    try {
      const lock = await readFile(join(directory, 'package-lock.json'), 'utf8');
      await writeFile(join(repo, `test-results/externalization/${label}.package-lock.json`), lock);
      const installed = JSON.parse(lock).packages;
      report.versions[label] = Object.fromEntries(['@rsbuild/core', '@rspack/core', '@module-federation/runtime', '@module-federation/runtime-tools', 'react', 'react-dom', '@nexus/plugin-runtime'].flatMap(name => installed[`node_modules/${name}`] ? [[name, installed[`node_modules/${name}`].version]] : []));
    } catch { /* Installation may have failed before generating a lockfile. */ }
  }
  await writeFile(join(repo, 'test-results/externalization/results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases, routeReadyMs: report.routeReadyMs, warmRouteReadyMs: report.warmRouteReadyMs, error: report.error, evidence: 'test-results/externalization/results.json' }, null, 2));
}

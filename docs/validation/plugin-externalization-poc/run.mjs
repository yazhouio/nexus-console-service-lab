// Isolated, disposable feasibility experiment. Never installs into or edits production packages.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
import { chromium } from '@playwright/test';

const fixture = import.meta.dirname, repo = resolve(fixture, '../../..');
const scratch = process.env.NEXUS_POC_DIR ?? await mkdtemp(join(tmpdir(), 'nexus-mf-gates-'));
const evidence = join(repo, 'test-results/plugin-externalization-poc');
await mkdir(evidence, { recursive: true });
console.log(`PoC directory: ${scratch}`);
const report = { startedAt: new Date().toISOString(), node: process.version, scratch, gates: {}, cases: [], snapshots: {}, versions: {}, network: [] };
const digest = text => createHash('sha256').update(text).digest('hex');
const capture = async (file) => { const bytes = await readFile(join(repo, file)); report.snapshots[file] = digest(bytes); return bytes; };
async function command(label, executable, args, cwd) {
  console.log(label);
  return new Promise((yes, no) => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', no);
    child.on('close', async code => {
      await writeFile(join(evidence, `${label}.log`), output);
      if (code) no(Error(`${label} exited ${code}\n${output.slice(-8000)}`)); else yes(output);
    });
  });
}
let browser;
const openedPages = [];
const servers = [];
try {
  const sdkDir = join(scratch, 'sdk'), host = join(scratch, 'host'), remote = join(scratch, 'remote');
  await mkdir(sdkDir, { recursive: true });
  // Compile the actual source into a temporary outDir; package sources and repository dist stay unchanged.
  await command('compile-sdk', 'pnpm', ['exec', 'tsc', '-p', 'packages/plugin-runtime/tsconfig.build.json', '--outDir', join(sdkDir, 'dist')], repo);
  for (const file of ['packages/plugin-runtime/src/ui-react.tsx', 'packages/plugin-runtime/src/browser/ui-host.ts', 'packages/plugin-runtime/src/browser/artifact-assets.ts', 'packages/plugin-runtime/src/bootstrap.ts', 'packages/plugin-runtime/package.json', 'package.json', 'pnpm-lock.yaml']) await capture(file);
  const pkg = JSON.parse(await readFile(join(repo, 'packages/plugin-runtime/package.json'), 'utf8'));
  await writeFile(join(sdkDir, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, type: pkg.type, exports: pkg.exports, files: ['dist'], dependencies: { wujie: '2.1.0', 'react-router': '8.3.1' }, peerDependencies: pkg.peerDependencies }, null, 2));
  await command('pack-sdk', 'npm', ['pack', '--ignore-scripts'], sdkDir);
  const tgz = join(sdkDir, `nexus-plugin-runtime-${pkg.version}.tgz`);
  await cp(join(fixture, 'host'), host, { recursive: true });
  await cp(join(fixture, 'remote'), remote, { recursive: true });
  await mkdir(join(remote, 'tools'), { recursive: true });
  for (const file of ['packages/plugin-build/artifact-css-loader.cjs', 'packages/plugin-build/check-plugin-css.mjs', 'packages/plugin-build/reject-unmanaged-css.cjs', 'packages/plugin-build/artifact-css-closure.mjs']) {
    const bytes = await capture(file);
    await writeFile(join(remote, 'tools', file.split('/').at(-1).replace('artifact-css-closure.mjs', 'artifact-css-closure.ts')), bytes);
  }
  const common = { '@rsbuild/core': '2.2.2', '@rspack/core': '2.2.2', '@rsbuild/plugin-react': '2.1.0', react: '19.2.8', 'react-dom': '19.2.8', '@nexus/plugin-runtime': `file:${tgz}` };
  const overrides = { '@rspack/core': '2.2.2' };
  await writeFile(join(host, 'package.json'), JSON.stringify({ name: 'poc-host', private: true, type: 'module', overrides, dependencies: { ...common, '@module-federation/enhanced': '2.9.0' } }, null, 2));
  await writeFile(join(remote, 'package.json'), JSON.stringify({ name: 'poc-remote', private: true, type: 'module', overrides, dependencies: { ...common, '@module-federation/runtime-tools': '2.9.0', lightningcss: '1.33.0', postcss: '8.5.26', 'postcss-selector-parser': '7.1.0' } }, null, 2));
  const installations = await Promise.allSettled([host, remote].map((dir, index) => command(`install-${index ? 'remote' : 'host'}`, 'npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts'], dir)));
  for (const result of installations) if (result.status === 'rejected') throw result.reason;
  for (const [label, dir] of [['host', host], ['remote', remote]]) {
    await cp(join(dir, 'package-lock.json'), join(evidence, `${label}.package-lock.json`));
    report.versions[label] = {};
    for (const name of ['@rsbuild/core', '@rspack/core', '@module-federation/runtime', '@module-federation/runtime-core', '@module-federation/runtime-tools', 'react', 'react-dom', '@nexus/plugin-runtime']) {
      try { report.versions[label][name] = JSON.parse(await readFile(join(dir, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { /* Not a direct node_modules entry. */ }
    }
  }
  let slowCss = 0;
  async function serve(dir, label) {
    const server = createServer(async (request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      let file = join(dir, pathname === '/' || label === 'host' && !extname(pathname) ? 'index.html' : pathname);
      response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Cache-Control', 'no-store');
      const event = { server: label, path: pathname, at: Date.now() }; report.network.push(event);
      try {
        const content = await readFile(file);
        if (label === 'remote' && file.endsWith('.css') && slowCss) await new Promise(resolve => setTimeout(resolve, slowCss));
        response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
        event.status = 200; response.end(content);
      } catch { event.status = 404; response.writeHead(404); response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  const remoteOrigin = await serve(join(remote, 'dist'), 'remote'), hostOrigin = await serve(join(host, 'dist'), 'host');
  report.origins = { host: hostOrigin, remote: remoteOrigin };
  for (const variant of ['good', 'badreact', 'badsdk', 'loose', 'duplicatesdk', 'lazybad']) await command(`build-${variant}`, process.execPath, ['build.mjs', variant, remoteOrigin], remote);
  await command('build-host', process.execPath, ['build.mjs', remoteOrigin], host);
  browser = await chromium.launch();
  report.browser = browser.version();
  async function pageFor(variant, extra = '') {
    const page = await browser.newPage();
    const logs = []; page.on('console', message => logs.push({ type: message.type(), text: message.text() }));
    openedPages.push({ page, logs });
    page.on('pageerror', error => logs.push({ type: 'pageerror', text: String(error) }));
    await page.goto(`${hostOrigin}/nested/console/path?variant=${variant}${extra}`);
    await page.waitForFunction(() => window.poc);
    return { page, logs };
  }
  const styleCount = page => page.locator('link[rel="stylesheet"], style').count();
  const loaded = page => page.evaluate(() => window.poc.load());
  const normal = await pageFor('good');
  assert.equal(await styleCount(normal.page), 0);
  const load = await loaded(normal.page);
  assert.equal(load.ok, true, JSON.stringify(load));
  assert.ok(Object.values(load.identity).every(Boolean), JSON.stringify(load));
  assert.equal(load.css.length, 2);
  assert.ok(load.css.every(url => url.startsWith(`${remoteOrigin}/good/`)));
  assert.equal(await styleCount(normal.page), 0, 'entry/expose must not inject CSS');
  const lazy = await normal.page.evaluate(() => window.poc.loadLazy());
  assert.deepEqual(lazy, { ok: true, reactDom: true });
  assert.equal(await styleCount(normal.page), 0, 'lazy chunk must not inject CSS');
  assert.equal(report.network.filter(item => item.server === 'remote' && item.path.endsWith('.css')).length, 0, 'no CSS preload before UI');
  slowCss = 500;
  await normal.page.evaluate(async () => { await window.poc.start(); window.poc.mount('a'); window.poc.mount('b'); });
  await normal.page.waitForFunction(() => document.querySelectorAll('link[data-nexus-artifact-css]').length === 2);
  assert.equal(await normal.page.locator('[data-probe]').count(), 0, 'no UI before CSS resolves');
  assert.equal(await normal.page.evaluate(() => window.poc.renderEvents.length), 0);
  await normal.page.waitForFunction(() => window.poc.phase('a') === 'ready' && window.poc.phase('b') === 'ready');
  slowCss = 0;
  assert.equal(await normal.page.locator('[data-route]').first().textContent(), 'host-context');
  assert.equal(await normal.page.locator('[data-client]').first().textContent(), 'function');
  assert.equal(await normal.page.locator('[data-outlet]').count(), 2);
  assert.equal(await normal.page.locator('[data-probe] a').first().getAttribute('href'), '/from-host/linked');
  await normal.page.locator('[data-counter]').first().click();
  assert.equal(await normal.page.locator('[data-counter]').first().textContent(), '1');
  const style = await normal.page.locator('[data-probe]').first().evaluate(element => ({ color: getComputedStyle(element).color, padding: getComputedStyle(element).padding }));
  assert.deepEqual(style, { color: 'rgb(12, 34, 56)', padding: '7px' });
  await normal.page.evaluate(() => window.poc.mount('lazy', 'lazy'));
  await normal.page.waitForFunction(() => window.poc.phase('lazy') === 'ready');
  assert.equal(await normal.page.locator('[data-probe="lazy"]').evaluate(element => getComputedStyle(element).padding), '9px');
  assert.equal(await styleCount(normal.page), 2);
  await normal.page.evaluate(() => window.poc.close('a'));
  assert.equal(await styleCount(normal.page), 2);
  await normal.page.evaluate(() => window.poc.close('b'));
  assert.equal(await styleCount(normal.page), 2);
  await normal.page.evaluate(() => window.poc.close('lazy'));
  assert.equal(await styleCount(normal.page), 0, 'last UI consumer must release CSS');
  assert.equal(await normal.page.locator('[data-probe]').count(), 0);
  assert.deepEqual(await normal.page.evaluate(() => window.poc.errors), []);
  await normal.page.evaluate(() => window.poc.dispose());
  report.cases.push({ name: 'shared-identities-and-managed-css', passed: true, load, lazy, style, logs: normal.logs });
  await normal.page.close();

  for (const [variant, extra, pattern] of [['badreact', '', /does not satisfy|Unsatisfied/i], ['badsdk', '', /does not satisfy|Unsatisfied/i], ['good', '&missing=1', /shared|RUNTIME-006|not exist/i]]) {
    const { page, logs } = await pageFor(variant, extra), result = await loaded(page);
    assert.equal(result.ok, false, `${variant} should reject: ${JSON.stringify(result)}`);
    assert.match(result.error, pattern);
    assert.equal(await styleCount(page), 0);
    await page.locator('#host-counter').click(); assert.equal(await page.locator('#host-counter').textContent(), 'Host: 1');
    report.cases.push({ name: extra ? 'missing-shared-sdk' : variant, passed: true, result, logs }); await page.close();
  }
  const loose = await pageFor('loose'), looseResult = await loaded(loose.page);
  assert.equal(looseResult.ok, true);
  assert.ok(loose.logs.some(item => /does not satisfy|Unsatisfied/i.test(item.text)), 'non-strict negative control must warn');
  report.cases.push({ name: 'non-strict-negative-control', passed: true, result: looseResult, logs: loose.logs }); await loose.page.close();
  const duplicate = await pageFor('duplicatesdk'), duplicateResult = await loaded(duplicate.page);
  assert.equal(duplicateResult.ok, true);
  assert.equal(duplicateResult.identity.react, true);
  assert.equal(duplicateResult.identity.uiProvider, false);
  await duplicate.page.evaluate(async () => { await window.poc.start(); window.poc.mount('duplicate'); });
  await duplicate.page.waitForFunction(() => window.poc.errors.some(error => error.includes('Host-bound UiProvider')));
  report.cases.push({ name: 'duplicate-sdk-negative-control', passed: true, result: duplicateResult, errors: await duplicate.page.evaluate(() => window.poc.errors), logs: duplicate.logs });
  await duplicate.page.evaluate(() => window.poc.dispose()); await duplicate.page.close();
  const lazyBad = await pageFor('lazybad'), lazyEntry = await loaded(lazyBad.page);
  assert.equal(lazyEntry.ok, true);
  const lazyFailure = await lazyBad.page.evaluate(() => window.poc.loadLazy());
  assert.equal(lazyFailure.ok, false); assert.match(lazyFailure.error, /react-dom/);
  assert.equal(await styleCount(lazyBad.page), 0);
  report.cases.push({ name: 'lazy-shared-conflict-timing', passed: true, entry: lazyEntry, result: lazyFailure, logs: lazyBad.logs }); await lazyBad.page.close();

  // Inspect actual compilation modules, not just shared config. Negative control contains its SDK copy.
  report.bundleAudit = {};
  for (const variant of ['good', 'duplicatesdk']) {
    const stats = JSON.parse(await readFile(join(remote, `dist/${variant}/stats.json`), 'utf8'));
    const names = [];
    function visit(item) { if (item.name) names.push(item.name); for (const child of [...item.modules ?? [], ...item.children ?? []]) visit(child); }
    visit(stats);
    const privateSdk = names.filter(name => /plugin-runtime.*ui-react/.test(name) && !/consume shared/.test(name));
    const privateReact = names.filter(name => /node_modules\/react\/(?:cjs|index)/.test(name) && !/consume shared/.test(name));
    report.bundleAudit[variant] = { privateSdk, privateReact };
    if (variant === 'good') { assert.deepEqual(privateSdk, []); assert.deepEqual(privateReact, []); }
    else assert.ok(privateSdk.length > 0);
  }
  for (const [file, expected] of Object.entries(report.snapshots)) assert.equal(digest(await readFile(join(repo, file))), expected, `production input changed: ${file}`);
  report.gates = { hostInstances: 'PASS', strictVersionRejection: 'PASS', cssSingleOwner: 'PASS' };
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = String(error); console.error(error);
  report.failurePages = [];
  for (const { page, logs } of openedPages) if (!page.isClosed()) report.failurePages.push({ url: page.url(), logs,
    state: await page.evaluate(() => ({ errors: window.poc?.errors, ui: window.poc?.ui?.core.inspect(), body: document.body.innerText })).catch(() => null),
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  report.finishedAt = new Date().toISOString();
  await writeFile(join(evidence, 'results.json'), JSON.stringify(report, null, 2));
  await writeFile(process.env.NEXUS_POC_REPORT ?? join(repo, 'docs/validation/plugin-externalization-poc-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, gates: report.gates, cases: report.cases.length, evidence, scratch }));
}

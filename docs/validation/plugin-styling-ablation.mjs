// Reproduce: node docs/validation/plugin-styling-ablation.mjs
// Only experimental fixtures are built. Production sources are imported unchanged.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const localRequire = createRequire(join(root, 'apps/console/package.json'));
const { createRsbuild } = await import(pathToFileURL(localRequire.resolve('@rsbuild/core')));
const scratch = await mkdtemp(join(tmpdir(), 'nexus-style-ablation-'));
const variants = [
  'baseline', 'direct-generated-list', 'versioned-url-no-hash', 'live-token-copy',
  'no-platform-tokens', 'plugin-token-defaults', 'global-selectors',
  'document-only', 'url-only-dedupe', 'no-dedupe', 'no-reference-lifetime',
  'no-final-release', 'no-ready-gate', 'no-failure-rollback', 'retain-failed-cache',
  'release-on-abort', 'handwritten-stale-assets', 'no-deadline', 'host-static-import',
];
const cases = [
  'theme-inheritance', 'selector-ownership', 'shared-lifetime', 'actual-style-root',
  'ready-gate', 'failure-rollback-retry', 'cancel-shared-load', 'dom-cleanup-order',
  'build-asset-identity', 'bounded-failure', 'slot-overlay-lifetime', 'single-css-owner',
];
const sources = [
  'packages/plugin-runtime/src/ui/runtime.ts', 'packages/plugin-runtime/src/contribution.ts',
  'packages/plugin-runtime/src/browser/ui-host.ts', 'packages/plugin-runtime/src/browser/wujie-driver.ts',
  'packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts',
  'packages/plugin-runtime/node_modules/wujie/lib/index.js',
  'docs/validation/plugin-styling-ablation.mjs', 'docs/validation/plugin-styling-ablation.browser.js',
];
const builds = {};
const stats = { requests: new Map() };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let browser, server;

try {
  for (const { revision, version, filenameHash } of [
    { revision: 'v1', version: 1, filenameHash: true },
    { revision: 'v2', version: 2, filenameHash: true },
    { revision: 'v2stable', version: 2, filenameHash: false },
  ]) {
    const work = join(scratch, revision);
    await mkdir(work, { recursive: true });
    await writeFile(join(work, 'entry.js'), `
      import { createUiRuntime, UiError } from ${JSON.stringify(join(root, 'packages/plugin-runtime/src/ui/runtime.ts'))};
      import { createContributionRegistry } from ${JSON.stringify(join(root, 'packages/plugin-runtime/src/contribution.ts'))};
      import classes from './business.module.css';
      window.probeCore = { createUiRuntime, UiError, createContributionRegistry };
      window.buildClass = classes.cardV${version};
    `);
    await writeFile(join(work, 'business.module.css'), `.cardV${version} { color: rgb(${version === 1 ? '13, 57, 91' : '91, 37, 13'}); padding: ${version * 7}px; }`);
    const rsbuild = await createRsbuild({ cwd: work, rsbuildConfig: {
      mode: 'production', source: { entry: { index: './entry.js' } },
      output: { distPath: { root: join(work, 'dist') }, assetPrefix: `/build/${revision}/`,
        manifest: true, injectStyles: false, filenameHash },
      html: { inject: false }, performance: { printFileSize: false },
    } });
    const built = await rsbuild.build();
    await built.close();
    const manifest = JSON.parse(await readFile(join(work, 'dist/manifest.json'), 'utf8'));
    const entry = manifest.entries.index;
    if (!entry?.initial?.css?.length || !entry.initial.js?.length) throw Error('Build did not emit CSS/JS entry assets');
    builds[revision] = { directory: join(work, 'dist'), css: entry.initial.css, js: entry.initial.js,
      manifestSha256: digest(JSON.stringify(manifest)) };
  }
  const harness = await readFile(join(root, 'docs/validation/plugin-styling-ablation.browser.js'));
  const wujie = await readFile(join(root, 'packages/plugin-runtime/node_modules/wujie/lib/index.js'));
  const productCss = `.owned { color: var(--nexus-test-color, rgb(0, 0, 0)); padding: 17px; }
    .restrictedOwned { color: var(--nexus-test-color, rgb(0, 0, 0)); padding: 19px; }`;
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const key = url.pathname + url.search;
    stats.requests.set(key, (stats.requests.get(key) ?? 0) + 1);
    const send = (body, type = 'text/html', status = 200) => {
      if (!res.destroyed) res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
    };
    try {
      if (url.pathname === '/') return send(`<!doctype html><html><head><script src="/wujie.js"></script>${builds.v1.js.map(src => `<script src="${src}"></script>`).join('')}<script src="/harness.js"></script></head><body></body></html>`);
      if (url.pathname === '/wujie.js') return send(wujie, 'text/javascript');
      if (url.pathname === '/harness.js') return send(harness, 'text/javascript');
      if (url.pathname === '/plugin.html') return send(`<!doctype html><html><head><link rel="stylesheet" href="/restricted.css${url.search}"></head><body><div class="restrictedOwned hostPrivate">Restricted</div><div id="anchor"></div><script>window.__fixtureReady = true;</script></body></html>`);
      if (url.pathname === '/retry-plugin.html') return send(`<!doctype html><html><head><link rel="stylesheet" href="/flaky.css${url.search}"></head><body><div class="owned">Recovered</div><script>window.__fixtureReady = true;</script></body></html>`);
      if (url.pathname === '/restricted.css') return send('.restrictedOwned{color:var(--nexus-test-color, rgb(0,0,0));padding:19px}' + (url.searchParams.get('defaults') === 'true' ? ':root{--nexus-test-color:rgb(200, 0, 0)}' : ''), 'text/css');
      if (url.pathname === '/slow.css') return void setTimeout(() => send(productCss, 'text/css'), 180);
      if (url.pathname === '/hang.css') return; // Client timeout owns completion; server closes remaining sockets.
      if (url.pathname === '/flaky.css') return send(productCss, 'text/css', stats.requests.get(key) === 1 ? 404 : 200);
      if (url.pathname === '/product.css') return send(productCss, 'text/css');
      if (url.pathname.startsWith('/build/')) {
        const [, , revision, ...segments] = url.pathname.split('/');
        const build = builds[revision];
        if (!build) return send('Unknown revision', 'text/plain', 404);
        const file = resolve(build.directory, segments.join('/'));
        if (!file.startsWith(build.directory + '/')) return send('Invalid path', 'text/plain', 400);
        return send(await readFile(file), file.endsWith('.css') ? 'text/css' : 'text/javascript');
      }
      return send('Missing', 'text/plain', 404);
    } catch (error) { send(String(error), 'text/plain', 500); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const variant of variants) {
    const checks = [];
    for (const name of cases) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      try {
        await page.goto(baseURL, { waitUntil: 'load' });
        const observation = await page.evaluate(async ({ variant, name, builds }) => {
          return window.runStylingCase({ variant, name, builds });
        }, { variant, name, builds });
        checks.push({ name, ...observation, ...(pageErrors.length ? { pageErrors } : {}) });
      } catch (error) { checks.push({ name, passed: false, infrastructureError: String(error), pageErrors }); }
      finally { await page.close(); }
    }
    const result = { variant, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, checks };
    results.push(result);
    console.log(JSON.stringify({ variant, passed: result.passed, failed: result.failed,
      failedChecks: checks.filter(c => !c.passed).map(c => ({ name: c.name, error: c.error ?? c.infrastructureError })) }));
    if (variant === 'baseline' && result.failed) throw Error('Baseline failed; fix the probe before interpreting mutations.');
  }
  const page = await browser.newPage();
  await page.goto(baseURL);
  const wujieRetry = await page.evaluate(() => window.characterizeWujieRetry());
  await page.close();
  const evidence = {
    recordedAt: new Date().toISOString(), baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version, chromium: browser.version(), wujie: '2.1.0',
    scope: 'Experimental browser asset loader over unchanged production UI core, real Wujie and three real Rsbuild CSS Modules builds (two source revisions, one no-hash output replacement). No production Browser UI host, React presentation, bridge handshake, Tailwind or StyleX integration certification. Single-factor variants unless explicitly identified as equivalent replacements/additions.',
    sourceSha256: Object.fromEntries(await Promise.all(sources.map(async path => [path, digest(await readFile(join(root, path)))]))),
    builds: Object.fromEntries(Object.entries(builds).map(([key, { directory, ...value }]) => [key, value])),
    results, characterization: { wujieRetry },
  };
  await writeFile(join(root, 'docs/validation/plugin-styling-ablation-results.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (results.some(r => r.checks.some(c => c.infrastructureError))) throw Error('Infrastructure errors occurred; see results');
} finally {
  await browser?.close();
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}

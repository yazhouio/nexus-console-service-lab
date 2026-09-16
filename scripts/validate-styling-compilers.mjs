// Production compiler + real Browser Adapter acceptance. No development CSS injection.
import assert from 'node:assert/strict';
import { transformSync } from '@babel/core';
import stylex from '@stylexjs/babel-plugin';
import { compile } from '@tailwindcss/node';
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { checkCss } from './check-plugin-css.mjs';

const root = resolve(import.meta.dirname, '..');
const requireConsole = createRequire(join(root, 'apps/console/package.json'));
const { createRsbuild } = await import(pathToFileURL(requireConsole.resolve('@rsbuild/core')));
const scratch = await mkdtemp(join(tmpdir(), 'nexus-styling-compilers-'));
let browser, server;
try {
  const sx = transformSync(`import * as stylex from '@stylexjs/stylex';
    const styles = stylex.create({ card: { color: 'var(--nexus-color-text-primary)', backgroundColor: 'var(--nexus-color-surface)', padding: 'var(--nexus-space-4)' } });
    export const props = stylex.props(styles.card);`, {
    filename: join(scratch, 'sx.ts'), configFile: false, babelrc: false,
    plugins: [[stylex, { dev: false, runtimeInjection: false, classNamePrefix: 'sx-' }]],
  });
  const sxCss = stylex.processStylexRules(sx.metadata.stylex, { useLayers: { prefix: 'sx-layer' } });
  const tw = await compile('@import "tailwindcss/utilities.css" layer(tw-utilities) source(none); @theme inline prefix(tw) { --color-body: var(--nexus-color-text-primary); --color-surface: var(--nexus-color-surface); --spacing: var(--nexus-space-1); }', { base: root, onDependency() {} });
  const twCss = tw.build(['tw:text-body', 'tw:bg-surface', 'tw:p-4']);
  for (const [name, css] of [['sx', sxCss], ['tw', twCss]]) {
    assert.match(css, /var\(--nexus-color-text-primary\)/); checkCss(css, name);
    await writeFile(join(scratch, `${name}.css`), css);
  }
  await writeFile(join(scratch, 'sx.ts'), sx.code);
  await writeFile(join(scratch, 'index.ts'), `
    import ${JSON.stringify(join(root, 'packages/design-tokens/theme.css'))};
    import { bootstrapPluginRuntime } from ${JSON.stringify(join(root, 'packages/plugin-runtime/dist/bootstrap.js'))};
    import { createUiHost } from ${JSON.stringify(join(root, 'packages/plugin-runtime/dist/browser/ui-host.js'))};
    import { createWujiePluginAdapter } from ${JSON.stringify(join(root, 'packages/plugin-runtime/dist/browser/wujie-plugin-adapter.js'))};
    import { props } from './sx';
    import { css as sxCss } from './sx.css?artifact';
    import { css as twCss } from './tw.css?artifact';
    const definitions = ['sx','tw'].map(id => ({ id, version:'1.0.0', requires:[], provides:[], activate() {} }));
    const runtime = await bootstrapPluginRuntime({ builtins: definitions, coreRootIds: ['sx'] });
    const trace = [], mounts = new Map();
    let unblock, blocked;
    const ui = createUiHost({ runtime, restrictedAdapter: createWujiePluginAdapter({ runtime }), policy: () => true,
      builtinCss: { sx: sxCss, tw: twCss },
      renderBuiltin(render, container) {
        const element = document.createElement('div'); element.id = render; element.textContent = render;
        element.className = render === 'sx' ? props.className : 'tw:text-body tw:bg-surface tw:p-4'; container.append(element);
        return { async dispose() { trace.push({ event:'before', owner:render, connected:element.isConnected });
          await blocked; element.remove(); trace.push({ event:'removed', owner:render });
          if (window.throwCleanup) throw Error('fixture cleanup failed');
        } };
      }
    });
    document.body.innerHTML = '<button id="host" style="color:rgb(5,6,7);padding:3px">Host control</button><main></main>';
    window.harness = {
      trace, ui, mounts,
      mount(order) { for (const id of order) { const container = document.createElement('div'); document.querySelector('main').append(container);
        mounts.set(id, ui.mountRoot(id, 'card', {kind:'builtin',render:id}, container, id)); } },
      block() { blocked = new Promise(resolve => { unblock = resolve; }); },
      unblock() { unblock(); blocked = undefined; },
      close(id) { mounts.get(id).dispose(); mounts.delete(id); },
      async dispose() { await ui.dispose(); },
    };
  `);
  const build = await createRsbuild({ cwd: scratch, rsbuildConfig: {
    mode: 'production', source: { entry: { index: './index.ts' } },
    output: { distPath: { root: join(scratch, 'dist') }, assetPrefix: '/' },
    tools: { bundlerChain(chain, { CHAIN_ID }) {
      chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
      for (const namespace of ['sx', 'tw']) chain.module.rule(namespace).test(new RegExp(namespace + '\\.css$')).resourceQuery(/artifact/).type('javascript/auto')
        .use('artifact').loader(join(root, 'scripts/artifact-css-loader.cjs')).options({ namespace });
      chain.resolve.modules.add(join(root, 'node_modules')).add('node_modules');
    } },
  } });
  await build.build();
  const html = await readFile(join(scratch, 'dist/index.html'), 'utf8');
  assert.doesNotMatch(html, /plugin-css/);
  server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = join(scratch, 'dist', path === '/' ? 'index.html' : path);
    try { response.setHeader('content-type', ({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css' })[extname(file)] ?? 'application/octet-stream'); response.end(await readFile(file)); }
    catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch();
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  for (const order of [['sx','tw'], ['tw','sx']]) {
    await page.goto(base); await page.waitForFunction(() => window.harness);
    await page.evaluate(order => window.harness.mount(order), order);
    await page.waitForFunction(() => [...window.harness.mounts.values()].every(root => root.execution.phase === 'ready'));
    const read = () => page.evaluate(() => Object.fromEntries(['sx','tw','host'].map(id => { const style = getComputedStyle(document.getElementById(id)); return [id, { color:style.color, background:style.backgroundColor, padding:style.padding }]; })));
    const before = await read();
    assert.deepEqual(before.sx, before.tw); assert.equal(before.sx.padding, '16px'); assert.equal(before.host.color, 'rgb(5, 6, 7)');
    const scope = await page.evaluate(() => [...window.harness.mounts.values()].map(root => root.attemptId));
    await page.addStyleTag({ content: ':root[data-nexus-theme="test"] { --nexus-color-text-primary: rgb(90, 30, 120); --nexus-color-surface: rgb(240, 235, 250); --nexus-space-4: 28px; --nexus-space-1: 7px; }' });
    await page.evaluate(() => { document.documentElement.dataset.nexusTheme = 'test'; });
    const after = await read();
    assert.deepEqual(after.sx, after.tw); assert.equal(after.sx.color, 'rgb(90, 30, 120)'); assert.equal(after.sx.padding, '28px'); assert.deepEqual(after.host, before.host);
    assert.deepEqual(await page.evaluate(() => [...window.harness.mounts.values()].map(root => root.attemptId)), scope);
    await page.evaluate(() => { window.harness.block(); window.harness.close('sx'); });
    await page.waitForFunction(() => window.harness.trace.some(item => item.event === 'before'));
    assert.equal(await page.locator('#sx').count(), 1); assert.equal(await page.locator('link[data-nexus-artifact-css]').count(), 2);
    await page.evaluate(() => { window.throwCleanup = true; window.harness.unblock(); });
    await page.waitForFunction(() => !document.getElementById('sx'));
    await page.waitForFunction(() => document.querySelectorAll('link[data-nexus-artifact-css]').length === 1);
    await page.evaluate(() => window.harness.dispose());
    assert.equal(await page.locator('link[data-nexus-artifact-css]').count(), 0);
    results.push({ order, before, after, preservedAttempts: true, asyncThrowingCleanup: true, disposed: true });
  }
  await mkdir(join(root, 'test-results'), { recursive: true });
  await writeFile(join(root, 'test-results/styling-compilers.json'), JSON.stringify({ passed: true, results }, null, 2));
  console.log('StyleX / Tailwind production compilation, order reversal, theme updates and asynchronous cleanup passed.');
} finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await rm(scratch, { recursive: true, force: true }); }

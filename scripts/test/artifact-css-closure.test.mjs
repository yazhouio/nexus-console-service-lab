import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ArtifactCssClosure } from '../../apps/console/artifact-css-closure.ts';

const root = resolve(import.meta.dirname, '../..');
const requireConsole = createRequire(join(root, 'apps/console/package.json'));
const { createRsbuild } = await import(pathToFileURL(requireConsole.resolve('@rsbuild/core')));

test('the production build rejects asynchronous CSS omitted from Distribution and rejects Host side-effect loading', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexus-css-closure-'));
  try {
    await writeFile(join(directory, 'style.css'), '.fixture-card { color: var(--nexus-color-text-primary) }');
    await writeFile(join(directory, 'lazy.js'), 'import classes from "./style.css?artifact"; console.log(classes);');
    for (const [source, accepted] of [
      ['import {css} from "./style.css?artifact"; console.log(css);', true],
      ['import("./lazy.js");', false],
      ['import "./style.css";', false],
    ]) {
      await writeFile(join(directory, 'distribution.js'), source);
      const build = await createRsbuild({ cwd: directory, rsbuildConfig: {
        logLevel: 'silent', mode: 'production', source: { entry: { index: './distribution.js' } },
        output: { distPath: { root: join(directory, 'dist') } },
        tools: { bundlerChain(chain, { CHAIN_ID }) {
          chain.plugin('closure').use(ArtifactCssClosure, [join(directory, 'distribution.js')]);
          chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
          chain.module.rule('artifact').test(/\.css$/).resourceQuery(/artifact/).type('javascript/auto')
            .use('artifact').loader(join(root, 'scripts/artifact-css-loader.cjs')).options({ namespace: 'fixture' });
          chain.module.rule('unmanaged').test(/\.css$/).resourceQuery({ not: [/artifact/] })
            .use('reject').loader(join(root, 'scripts/reject-unmanaged-css.cjs'));
        } },
      } });
      if (accepted) await build.build(); else await assert.rejects(build.build(), /Rspack build failed/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

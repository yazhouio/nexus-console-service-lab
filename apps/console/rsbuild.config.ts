import { ArtifactCssClosure } from './artifact-css-closure';
import { resolve } from 'node:path';
import { routingBuildSettings } from '../../scripts/routing-gate';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const routing = routingBuildSettings(process.env);

export default defineConfig({
  tools: { bundlerChain(chain, { CHAIN_ID }) {
    chain.plugin('artifact-closure').use(ArtifactCssClosure, [resolve(import.meta.dirname, './src/distribution.ts')]);
    chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
    const artifacts = [
      ['ui-local', './src/ui-local.module.css', false],
      ['core', '../../packages/console-core/src', true],
      ['cluster', './src/plugins/cluster.css', false],
      ['extension-demo', './src/plugins/extension-demo.css', false],
      ['deployment-ui', './src/plugins/deployment-ui.css', false],
    ] as const;
    for (const [namespace, path, allowFixed] of artifacts) {
      chain.module.rule(`artifact-${namespace}`).test(/\.css$/).resourceQuery(/artifact/).include.add(resolve(import.meta.dirname, path)).end()
        .type('javascript/auto').use('artifact-css').loader(resolve(import.meta.dirname, '../../scripts/artifact-css-loader.cjs')).options({ namespace, allowFixed });
    }
    chain.module.rule('no-unmanaged-plugin-css').test(/\.css$/).resourceQuery({ not: [/artifact/] })
      .exclude.add(resolve(import.meta.dirname, '../../packages/design-tokens')).end()
      .use('reject-unmanaged').loader(resolve(import.meta.dirname, '../../scripts/reject-unmanaged-css.cjs'));
  } },
  output: { assetPrefix: '/', distPath: { root: routing.output } },
  plugins: [pluginReact()],
  source: {
    define: { 'process.env.PUBLIC_HOST_ROUTING': JSON.stringify(String(routing.enabled)), 'process.env.PUBLIC_TEST_FIXTURES': JSON.stringify(String(routing.fixtures)) },
    entry: {
      index: './src/main.tsx',
    },
  },
  html: {
    title: 'Nexus Plugin Host',
    meta: { 'nexus-host': 'true', 'nexus-build': routing.buildVersion, 'nexus-validation': String(routing.validation) },
  },
  server: {
    port: Number(process.env.HOST_PORT ?? 3000),
    strictPort: true,
    proxy: {
      '/plugins/ui-': { target: 'http://localhost:3003', changeOrigin: false },
      '/api': { target: 'http://127.0.0.1:3002' },
      '/plugins/kubeeye/2.0.0': {
        target: 'http://localhost:3001', changeOrigin: false,
        pathRewrite: { '^/plugins/kubeeye/2.0.0': '/plugins/kubeeye/1.0.0' },
      },
      '/plugins/kubeeye/1.0.0': {
        target: 'http://localhost:3001',
        changeOrigin: false,
        ws: true,
      },
    },
  },
});

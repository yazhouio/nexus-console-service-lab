import { createRequire } from 'node:module';
import { ArtifactCssClosure } from './artifact-css-closure';
import { resolve } from 'node:path';
import { routingBuildSettings } from '../../scripts/routing-gate';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const require = createRequire(import.meta.url);
const sdkVersion = require('@nexus/plugin-runtime/package.json').version;
const pins = JSON.parse(process.env.NEXUS_BUILTIN_PINS ?? '[]');

const routing = routingBuildSettings(process.env);

export default defineConfig({
  tools: {
    bundlerChain(chain, { CHAIN_ID }) {
      chain
        .plugin('artifact-closure')
        .use(ArtifactCssClosure, [resolve(import.meta.dirname, './src/distribution.ts')]);
      chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
      const artifacts = [
        ['ui-local', './src/ui-local.module.css', false],
        ['core', '../../packages/console-core', true],
        ['cluster', './src/plugins/cluster.css', false],
        ['extension-demo', './src/plugins/extension-demo.css', false],
        ['deployment-ui', './src/plugins/deployment-ui.css', false],
      ] as const;
      for (const [namespace, path, allowFixed] of artifacts) {
        chain.module
          .rule(`artifact-${namespace}`)
          .test(/\.css$/)
          .resourceQuery(/artifact/)
          .include.add(resolve(import.meta.dirname, path))
          .end()
          .type('javascript/auto')
          .use('artifact-css')
          .loader(require.resolve('@nexus/plugin-build/artifact-css-loader'))
          .options({ namespace, allowFixed });
      }
      chain.module
        .rule('no-unmanaged-plugin-css')
        .test(/\.css$/)
        .resourceQuery({ not: [/artifact/] })
        .exclude.add(resolve(import.meta.dirname, '../../packages/design-tokens'))
        .end()
        .use('reject-unmanaged')
        .loader(require.resolve('@nexus/plugin-build/reject-unmanaged-css'));
    },
  },
  output: { assetPrefix: '/', distPath: { root: routing.output } },
  plugins: [pluginReact()],
  source: {
    define: {
      NEXUS_REMOTE_DEMO: JSON.stringify(
        pins.some((pin: { id: string }) => pin.id === 'extension-demo'),
      ),
      NEXUS_BUILTIN_PINS: JSON.stringify(pins),
      NEXUS_SHARED_VERSIONS: JSON.stringify({
        react: require('react/package.json').version,
        sdk: sdkVersion,
      }),
      'process.env.PUBLIC_HOST_ROUTING': JSON.stringify(String(routing.enabled)),
      'process.env.PUBLIC_TEST_FIXTURES': JSON.stringify(String(routing.fixtures)),
    },
    entry: {
      index: './src/main.tsx',
    },
  },
  html: {
    title: 'Nexus Plugin Host',
    meta: {
      'nexus-host': 'true',
      'nexus-build': routing.buildVersion,
      'nexus-validation': String(routing.validation),
    },
  },
  server: {
    port: Number(process.env.HOST_PORT ?? 3000),
    strictPort: true,
    proxy: {
      '/plugins/ui-': { target: 'http://localhost:3003', changeOrigin: false },
      '/api': { target: 'http://127.0.0.1:3002' },
      '/plugins/kubeeye/2.0.0': {
        target: 'http://localhost:3001',
        changeOrigin: false,
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

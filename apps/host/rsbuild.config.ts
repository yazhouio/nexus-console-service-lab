import { routingBuildSettings } from '../../scripts/routing-gate';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const routing = routingBuildSettings(process.env);

export default defineConfig({
  output: { distPath: { root: routing.output } },
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

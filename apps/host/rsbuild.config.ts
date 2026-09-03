import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/main.tsx',
    },
  },
  html: {
    title: 'Nexus Plugin Host',
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/plugins/kubeeye/1.0.0': {
        target: 'http://localhost:3001',
        changeOrigin: false,
        ws: true,
      },
    },
  },
});

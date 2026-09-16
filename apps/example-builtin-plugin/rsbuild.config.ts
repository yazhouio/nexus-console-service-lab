import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { extensionDemoDescriptor } from './src/extension-demo-data';
import { ArtifactCssClosure } from '@nexus/plugin-build/closure';
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const sdkVersion = require('@nexus/plugin-runtime/package.json').version;
if (pkg.version !== extensionDemoDescriptor.version)
  throw Error('Package and plugin descriptor versions must match');
const base =
  process.env.NEXUS_REMOTE_BASE ??
  `http://localhost:3005/${extensionDemoDescriptor.id}/${extensionDemoDescriptor.version}/`;
if (!/^https?:$/.test(new URL(base).protocol) || !base.endsWith('/'))
  throw Error('NEXUS_REMOTE_BASE must be an absolute HTTP directory URL');
// Escape semver punctuation without collapsing different prerelease/build identities.
const versionName = pkg.version.replace(
  /[.+-]/g,
  (character: string) => ({ '.': '_', '-': '$h', '+': '$p' })[character],
);
const name = `nexus_extension_demo_${versionName}`;
const share = (requiredVersion: string) => ({
  import: false as const,
  singleton: true,
  strictVersion: true,
  requiredVersion,
});
export default defineConfig({
  plugins: [pluginReact({ fastRefresh: false })],
  source: { entry: {} },
  output: { assetPrefix: base, distPath: { root: 'dist' } },
  moduleFederation: {
    options: {
      name,
      filename: 'remoteEntry.js',
      exposes: { './plugin': './src/entry.ts' },
      shareStrategy: 'loaded-first',
      shared: {
        react: share(require('react/package.json').version),
        'react/jsx-runtime': share(require('react/package.json').version),
        'react/jsx-dev-runtime': share(require('react/package.json').version),
        '@nexus/plugin-runtime/react': share(sdkVersion),
      },
    },
  },
  tools: {
    rspack: { output: { uniqueName: name, chunkLoadingGlobal: `${name}_chunks` } },
    bundlerChain(chain, { CHAIN_ID }) {
      chain
        .plugin('closure')
        .use(ArtifactCssClosure, [resolve(import.meta.dirname, 'src/entry.ts')]);
      chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
      chain.module
        .rule('artifact')
        .test(/\.css$/)
        .resourceQuery(/artifact/)
        .type('javascript/auto')
        .use('artifact')
        .loader(require.resolve('@nexus/plugin-build/artifact-css-loader'))
        .options({ namespace: 'extension-demo' });
      chain.module
        .rule('unmanaged')
        .test(/\.css$/)
        .resourceQuery({ not: [/artifact/] })
        .use('reject')
        .loader(require.resolve('@nexus/plugin-build/reject-unmanaged-css'));
    },
  },
});

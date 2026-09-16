import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { ArtifactCssClosure } from './tools/artifact-css-closure.ts';

const [variant = 'good', origin] = process.argv.slice(2);
const share = (requiredVersion) => ({
  import: false,
  singleton: true,
  strictVersion: variant !== 'loose',
  requiredVersion,
});
const shared = {
  react: share(['badreact', 'loose'].includes(variant) ? '^18.0.0' : '19.2.8'),
  'react/jsx-runtime': share('19.2.8'),
  'react-dom': share(variant === 'lazybad' ? '^18.0.0' : '19.2.8'),
  ...(variant === 'duplicatesdk'
    ? {}
    : { '@nexus/plugin-runtime/react': share(variant === 'badsdk' ? '^9.0.0' : '0.1.0') }),
};
const build = await createRsbuild({
  cwd: import.meta.dirname,
  rsbuildConfig: {
    mode: 'production',
    plugins: [pluginReact()],
    source: { entry: {} },
    output: { assetPrefix: `${origin}/${variant}/`, distPath: { root: `dist/${variant}` } },
    moduleFederation: {
      options: {
        name: `poc_${variant}`,
        filename: 'remoteEntry.js',
        exposes: { './plugin': './plugin.tsx' },
        shared,
        shareStrategy: 'loaded-first',
      },
    },
    tools: {
      rspack: { output: { uniqueName: `poc_${variant}` } },
      bundlerChain(chain, { CHAIN_ID }) {
        chain
          .plugin('artifact-closure')
          .use(ArtifactCssClosure, [resolve(import.meta.dirname, 'plugin.tsx')]);
        chain.module.rule(CHAIN_ID.RULE.CSS).resourceQuery({ not: [/artifact/] });
        chain.module
          .rule('artifact')
          .test(/\.css$/)
          .resourceQuery(/artifact/)
          .type('javascript/auto')
          .use('artifact')
          .loader(resolve(import.meta.dirname, 'tools/artifact-css-loader.cjs'))
          .options({ namespace: 'poc' });
        chain.module
          .rule('no-unmanaged-css')
          .test(/\.css$/)
          .resourceQuery({ not: [/artifact/] })
          .use('reject')
          .loader(resolve(import.meta.dirname, 'tools/reject-unmanaged-css.cjs'));
      },
    },
  },
});
const result = await build.build();
await writeFile(
  `dist/${variant}/stats.json`,
  JSON.stringify(
    result.stats.toJson({ all: false, modules: true, nestedModules: true, assets: true }),
  ),
);

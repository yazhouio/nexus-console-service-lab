import v1 from './manifest.json' with { type: 'json' };
import v2 from './manifest-v2.json' with { type: 'json' };
import { rspack } from '@rspack/core';
import { defineConfig } from '@rspack/cli';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

const version = process.env.NEXUS_PLUGIN_VERSION ?? v1.version;
const manifest = [v1, v2].find(value => value.version === version);
if (!manifest) throw Error(`Unpublished KubeEye version: ${version}`);

export default defineConfig((_env, argv) => {
  const isDevelopment = argv.mode !== 'production';
  const standalonePreview = process.env.NEXUS_STANDALONE_PREVIEW === 'true';
  if (standalonePreview && !isDevelopment) throw Error('Standalone preview theme must not enter the integrated production artifact');

  return {
    mode: isDevelopment ? 'development' : 'production',
    entry: standalonePreview ? ['@nexus/design-tokens/theme.css', './src/main.tsx'] : './src/main.tsx',
    output: {
      clean: true,
      publicPath: standalonePreview ? '/' : manifest.entry,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    module: {
      rules: [
        { test: /\.css$/, type: 'css' },
        {
          test: /\.(?:js|mjs|jsx|ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              detectSyntax: 'auto',
              jsc: {
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: isDevelopment,
                    refresh: isDevelopment,
                  },
                },
              },
            },
          },
        },
      ],
    },
    plugins: [
      new rspack.CopyRspackPlugin({ patterns: [{ from: version === v1.version ? 'manifest.json' : 'manifest-v2.json', to: 'manifest.json' }] }),
      new rspack.HtmlRspackPlugin({
        template: './index.html',
      }),
      ...(isDevelopment
        ? [new ReactRefreshRspackPlugin()]
        : []),
    ],
    devServer: {
      historyApiFallback: true,
      hot: true,
      port: standalonePreview ? 3004 : 3001,
      allowedHosts: 'all',
    },
  };
});

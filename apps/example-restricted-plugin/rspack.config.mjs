import { rspack } from '@rspack/core';
import { defineConfig } from '@rspack/cli';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

export default defineConfig((_env, argv) => {
  const isDevelopment = argv.mode !== 'production';

  return {
    mode: isDevelopment ? 'development' : 'production',
    entry: './src/main.tsx',
    output: {
      clean: true,
      publicPath: '/plugins/kubeeye/1.0.0/',
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    module: {
      rules: [
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
      port: 3001,
      allowedHosts: 'all',
    },
  };
});

import { rspack } from '@rspack/core';
const owners = ['ui-a', 'ui-b', 'ui-c', 'ui-action'];
export default {
  entry: Object.fromEntries(owners.map(owner => [owner, `./src/${owner}.tsx`])),
  output: { filename: 'plugins/[name]/1.0.0/main.js', publicPath: '/', clean: true },
  resolve: { extensions: ['.tsx','.ts','.js'] },
  optimization: { splitChunks: false, runtimeChunk: false },
  module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: { loader: 'builtin:swc-loader', options: { detectSyntax: 'auto', jsc: { transform: { react: { runtime: 'automatic' } } } } } }] },
  plugins: owners.map(owner => new rspack.HtmlRspackPlugin({ filename: `plugins/${owner}/1.0.0/index.html`, chunks: [owner], templateContent: '<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div></body></html>' })),
  devServer: { port: 3003, hot: false, liveReload: false, historyApiFallback: false, allowedHosts: 'all' },
};

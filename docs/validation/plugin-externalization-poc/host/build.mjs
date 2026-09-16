import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
const build = await createRsbuild({
  cwd: import.meta.dirname,
  rsbuildConfig: {
    mode: 'production',
    plugins: [pluginReact()],
    source: {
      entry: { index: './main.tsx' },
      define: { REMOTE_ORIGIN: JSON.stringify(process.argv[2]) },
    },
    output: { assetPrefix: '/', distPath: { root: 'dist' } },
  },
});
await build.build();

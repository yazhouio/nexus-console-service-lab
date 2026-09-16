# KubeEye Wujie plugin example

This is the **plugin implementation** layer. It consumes the Console reference system's protocol; it does not define a complete plugin system.

Read `manifest.ts` for requested capabilities, permissions and contributions, `src/main.tsx` for execution setup, and `src/App.tsx` for Surface behavior. Host-side contracts and installation grants live in `../console/src/plugins/kubeeye-installation.ts`.

From the repository root run `pnpm install`, then `pnpm dev:plugin` and `pnpm dev:host` in separate terminals. Open `http://localhost:3000` and compare the KubeEye route and home card: they mount independent Surface instances.

For another business system, replace Console/Cluster Point refs, Host API, capabilities, grants and theme assumptions with that system's published contracts. Keep Manifest validation, Bridge connection and cleanup behavior. An independent repository consumes released packages or tarballs instead of workspace/catalog dependencies.

See [Plugin author guide](../docs/docs/plugin-author-guide.md) and [Example map](../docs/docs/example-plugins.md). Wujie is cooperative isolation; backend authorization remains necessary.

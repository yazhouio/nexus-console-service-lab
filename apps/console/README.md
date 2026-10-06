# Console reference plugin system

This application demonstrates the **business plugin system** layer built on `@feforgejs/plugin-runtime`, `@feforgejs/browser-host` and `@feforgejs/plugin-build`. It is a runnable reference and framework regression host, not a complete Nexus service platform.

Read in order:

1. `../../packages/console-core-api/src/index.ts`: public Console contracts.
2. `../../packages/console-core/src/plugin.ts` and `ConsoleLayout.tsx`: root presentation and owned extension points.
3. `../../packages/cluster-api/src/index.ts`: example domain contracts.
4. `src/distribution.ts`: plugins, contracts, grants, assets and storage assembly.
5. `src/main.tsx`: BrowserHost startup and product theme.
6. `src/plugins`: plugins consuming those contracts, including Deployment composition.

From the repository root run `pnpm install`, then `pnpm dev:host`. Run `pnpm dev:plugin` in another terminal for the KubeEye Wujie example. Open `http://localhost:3000`.

To build another product, follow [Build a business plugin system](../docs/docs/build-plugin-system.md). Replace the shell, business API, theme and distribution choices. The current local installation storage and mock resource data do not implement Tenant placement, Region context or production backend authorization.

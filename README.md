# Nexus Frontend Plugin Runtime

V1 frontend plugin runtime workspace described by the normative documents in `spec/`.

## Workspace

- `apps/host`: React 19 host application built with Rsbuild.
- `apps/example-restricted-plugin`: React 19 restricted-plugin fixture built directly with Rspack.
- `packages/plugin-runtime`: build-tool-independent TypeScript runtime model.

## Commands

```bash
pnpm install
pnpm dev:host
pnpm dev:plugin
pnpm test
pnpm typecheck
pnpm build
```


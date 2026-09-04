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

Run `dev:host` and `dev:plugin` in separate terminals, then open
`http://localhost:3000`. The Host proxies `/plugins/kubeeye/1.0.0/` to the
Rspack dev server. Opening KubeEye mounts its Surface on demand; **Read current
cluster** calls the Host's `kubesphere.cluster@2/getCurrentCluster` action over
the Surface's dedicated MessagePort.

## Browser regression tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts both development servers when they are not already running.
The suite checks lazy loading, unary calls, cleanup/remount, cancellation,
artifact failure, and rendering failure. It also explicitly verifies that
same-origin Wujie plugins can access `window.parent`: this is
**cooperative-isolation**, not a hostile-code security boundary.

The implementation currently covers tickets 01–07. Request limits/timeouts,
subscriptions, configuration reload, and the Runtime Inspector remain in
tickets 08–12; the Bridge is not yet a complete V1 production implementation.

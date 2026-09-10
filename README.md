# Nexus Frontend Plugin Runtime

V1 frontend plugin runtime workspace described by the normative documents in `spec/`.

## Workspace

- `apps/console`: Console Distribution, static plugin pins, grants and installation configuration.
- `packages/browser-host`: reusable browser boot, history and recovery adapters.
- `packages/console-core`: required Console plugin with layout, navigation, Home and Settings.
- `packages/console-core-api`: versioned Console Points, parameterized Profiles and PluginRef.
- `packages/cluster-api`: Cluster contracts and ResourceRef.
- `apps/example-restricted-plugin`: React 19 restricted-plugin fixture built directly with Rspack.
- `apps/docs`: independent Rspress 2 documentation workspace.
- `packages/plugin-runtime`: build-tool-independent TypeScript runtime model.

## Documentation

Start with the [Deployment mock walkthrough](apps/docs/docs/deployment-example.md),
then follow the [plugin author guide](apps/docs/docs/plugin-author-guide.md) or
[host integration guide](apps/docs/docs/host-integration.md).
Public documentation describes current usage and contracts. Design decisions and
implementation history have a separate [maintainer entrance](apps/docs/docs/maintainers/index.md).

Open `http://localhost:3000/deployments` for the complete mock resource example:
list → detail → HPA/VPA cards and actions → monitoring/network tabs.
Mock changes last for the current page session and reset on reload.

## Commands

```bash
pnpm install
pnpm dev:host
pnpm dev:plugin
pnpm dev:docs
pnpm test
pnpm typecheck
pnpm build
pnpm build:docs
pnpm preview:docs
```

Run `dev:host` and `dev:plugin` in separate terminals, then open
`http://localhost:3000`. The Host proxies `/plugins/kubeeye/1.0.0/` to the
Rspack dev server. Opening KubeEye mounts its Surface on demand; **Read current
cluster** calls the Host's `kubesphere.cluster@2/getCurrentCluster` action over
the Surface's dedicated MessagePort. Run `pnpm dev:docs` separately and open
`http://localhost:3003` for the Rspress documentation site.

## Browser regression tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright starts both development servers when they are not already running.
The suite checks lazy loading, unary calls, subscriptions, independent Route and
Extension mounts, cleanup/remount, cancellation, artifact/rendering failure,
configuration reload, and Runtime Inspector facts. It also explicitly verifies that
same-origin Wujie plugins can access `window.parent`: this is
**cooperative-isolation**, not a hostile-code security boundary.

The implementation also follows [Console Core architecture](apps/docs/docs/maintainers/console-core-architecture.md), including managed Router-tree rendering, versioned Point admission, Action-only execution and lazy Tabs. `pnpm check:boundaries` enforces package and author import boundaries and runs as part of type checking.

The original runtime covers tickets 01–12 in
[the V1 ticket set](.scratch/frontend-plugin-runtime-v1/issues/).

## Bridge sessions

Every Surface Execution Attempt or Action Invocation owns its MessagePort, request IDs, pending calls,
subscriptions, limits, and cleanup. Unary and subscription actions share the
Host contract validation and permission pipeline. Subscription responses contain
an atomic `{ subscriptionId, snapshot }`; events emitted while opening are
buffered until that response has been sent. Unsubscribe is idempotent and remains
available when the action request rate is exhausted.

The adapter's `bridgeLimits` option overrides these per-session defaults:

| Limit | Default |
| --- | --- |
| JSON message size, including UTF-8 encoding | 64 KiB |
| Concurrent requests, including subscription opens | 16 |
| Action requests per rolling second | 100 |
| Request/open timeout | 10 seconds |
| Active or opening subscriptions | 32 |
| Buffered events per opening subscription | 64 |
| Delivered events per rolling second | 100 |
| Consecutive severe envelope/size/duplicate violations | 3 |
| Lifetime request IDs | 10,000 |
| Retained audit and Host error entries | 200 each |

Limits must be positive integers; message size must allow at least 256 bytes for
control responses. Request IDs are limited to 128 characters. An oversized
rejection omits the invalid request ID if necessary to fit the message limit.
Reaching the lifetime ID budget disposes that session instead of evicting IDs and
allowing reuse. Unmount closes the port; any later Host ingress invocation returns
`BRIDGE_SESSION_INACTIVE` locally. Providers receive an AbortSignal, and late
results or events are discarded. A late subscription open still has its disposer
called. Disposer failures cannot stop cleanup of other subscriptions.

Use **Watch current cluster** in either Surface, then **Switch Host cluster** to
see session-scoped changes. The fixture publishes only Host-defined cluster
actions; plugins cannot define topics or register services.

## Configuration and inspection

`createInstallationStore` validates immutable versioned packages and persists
configuration through an optional `InstallationStorage` adapter. Install,
selectVersion, setEnabled, and uninstall all return `{ reloadRequired: true }`.
`store.list()` supplies the next `bootstrapPluginRuntime` input. Existing Runtime
catalogs and contribution metadata remain immutable.

The Console Distribution uses localStorage and demonstrates install, enable, disable,
uninstall, upgrade, and rollback. **Reload page** rebuilds from static Builtins
and the stored selection. Both fixture versions use the same development bundle
under versioned URLs; this exercises version selection without pretending to
provide a package distribution service.

`inspect(runtime, adapter)` returns a deeply immutable projection of plugin
states, dependencies, Core Closure, ownership, Surface Instances, and session
subscription counts. `inspect({ ready: false, error })` projects bootstrap
failure. Error messages come from fixed templates; safe metadata retains plugin
IDs, stages, capabilities, and dependency paths. Render functions, initial
parameters, capability values, error stacks, and raw Bridge data are excluded.
The adapter's `onAudit` callback receives bounded metadata for every request,
subscription open, unsubscribe, and event validation failure. The Host Inspector
keeps the latest 200 entries and refreshes instance facts four times per second.
Audit request/action/subscription identifiers are capped at 128 characters and
capability diagnostic text at 256, including messages rejected before dispatch.

Playwright also starts a real HTTP authorization fixture on port 3002, proxied at
`/api`. It proves that a plugin denied by Bridge grants can still issue same-origin
requests, while the server's session permissions independently deny an admin
endpoint with 403. This is a test backend; production authorization must be
provided by the actual backend integration.

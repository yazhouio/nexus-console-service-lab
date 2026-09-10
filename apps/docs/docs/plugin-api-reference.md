# Plugin API Reference

公开包为 `@nexus/plugin-runtime`，浏览器适配能力从 `@nexus/plugin-runtime/browser` 导入。

## 1. Runtime Bootstrap

```ts
import { bootstrapPluginRuntime } from '@nexus/plugin-runtime';

const runtime = await bootstrapPluginRuntime({
  builtins,
  coreRootIds: ['console-core'],
  rootPresentation: { ownerPluginId: 'console-core', surfaceId: 'root' },
  profiles, refContracts,
  rootRoutePoint, navigationRootPoints,
  installed,
  supportedHostApis: ['kubesphere.console@1'],
  bridgeContracts,
});
```

```ts
interface BootstrapPluginRuntimeOptions {
  builtins: readonly PluginDefinition[];
  coreRootIds: readonly PluginId[];
  installed?: readonly InstalledPluginRecord[];
  supportedHostApis?: readonly HostApiId[];
  bridgeContracts?: readonly BridgeCapabilityContract[];
  rootPresentation?: { ownerPluginId: string; surfaceId: string };
  profiles?: readonly PointProfile[];
  refContracts?: readonly RefContract[];
  rootRoutePoint?: ExtensionPointRef;
  navigationRootPoints?: readonly ExtensionPointRef[];
}
```

`PluginRuntime` 是一次 Bootstrap 的不可变 Runtime 事实集合：

```ts
interface PluginRuntime {
  readonly ready: true;
  readonly candidates: readonly PluginCandidate[];
  readonly installations: readonly InstalledPluginRecord[];
  readonly resolution: Resolution;
  readonly capabilities: CapabilityRegistry;
  readonly contributions: ContributionRegistry;
  readonly surfaces: SurfaceDefinitionRegistry;
  readonly bridgeContracts: ReadonlyMap<string, BridgeCapabilityContract>;
  readonly restrictedPlugins: ReadonlyMap<PluginId, InstalledPluginRecord>;
  readonly validationIssues: readonly PluginValidationIssue[];
  readonly plugins: ReadonlyMap<PluginId, PluginRuntimeState>;
}
```

Runtime Ready 后不能增加 Plugin、替换 Provider、重算依赖或动态注册 Restricted Contribution。

## 2. Plugin API

```ts
interface PluginDescriptor {
  readonly id: PluginId;
  readonly version: string;
  readonly requires: readonly CapabilityId[];
  readonly provides: readonly CapabilityId[];
}

interface PluginDefinition extends PluginDescriptor {
  activate(context: PluginContext): void | Promise<void>;
}

interface PluginContext {
  readonly actions: { register(id: string, handler: ActionHandler): void };
  readonly capabilities: {
    register<T>(id: CapabilityId, value: T): void;
    require<T>(id: CapabilityId): T;
  };
  readonly contributions: PluginContributionContext;
}
```

`context.capabilities.register` 与 Contribution 注册先进入当前 owner 的 staging area；声明校验通过后才会原子提交。

## 3. Capability API

```ts
interface CapabilityMetadata {
  readonly id: CapabilityId;
  readonly providerPluginId: PluginId;
}

interface CapabilityRegistry {
  get<T>(id: CapabilityId): T | undefined;
  require<T>(id: CapabilityId): T;
  list(): readonly CapabilityMetadata[];
}
```

`CapabilityId` 的格式为 `name@major`，V1 不支持版本范围和多个 Provider 协商。

## 4. Contribution API

```ts
type JsonValue =
  | null | boolean | number | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

interface PluginContributionContext {
  registerRoute(contribution: RouteContribution): void;
  registerNavigation(contribution: NavigationContribution): void;
  registerExtensionPoint(point: ExtensionPointDefinition): void;
  registerSurface(surface: { id: string; target: HostRenderTarget }): void;
  registerExtension(contribution: UiExtensionContribution): void;
}

interface RouteContribution {
  readonly id: string;
  readonly path: string;
  readonly parentRouteId?: string;
  readonly acceptsChildren?: boolean;
  readonly target: HostRenderTarget;
}

interface NavigationContribution {
  readonly acceptsChildren?: boolean;
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly routeId?: string;
  readonly order?: number;
}

interface UiExtensionContribution {
  readonly id: string;
  readonly kind: 'surface';
  readonly point: { ownerPluginId: string; id: string; contractMajor: number };
  readonly surfaceId: string;
  readonly order?: number;
}
```

Builtin 可以使用 `target: { kind: 'builtin', render }`；作为父 Layout 时声明 `routeLayout: true` 并渲染 `<Outlet />`。Restricted Manifest 使用 `surfaceId` 声明式描述 `sandbox-surface` 目标；不能携带 Host-local render value。

## 5. Manifest 与 Installation Store

```ts
const record = validateRestrictedInstallRecord(value, {
  isEntryAllowed: entry => entry.startsWith('/plugins/'),
});
```

```ts
interface InstallationStore {
  list(): readonly InstalledPluginRecord[];
  listVersions(id: PluginId): readonly InstalledPluginRecord[];
  snapshot(): InstallationStoreSnapshot;
  install(record: unknown): { readonly reloadRequired: true };
  selectVersion(id: PluginId, version: string, config?: InstalledPluginConfig): { readonly reloadRequired: true };
  setEnabled(id: PluginId, enabled: boolean): { readonly reloadRequired: true };
  uninstall(id: PluginId): { readonly reloadRequired: true };
}
```

Store 只保存下一次 Bootstrap 的输入，不持有正在运行的 Runtime。完整字段与校验规则见 [Manifest / Contract Spec](./manifest-contract-spec.md)。

## 6. Browser Adapter

```ts
import { createWujiePluginAdapter } from '@nexus/plugin-runtime/browser';

const adapter = createWujiePluginAdapter({
  runtime,
  onSurfaceError: error => console.error(error.issue),
  onAudit: entry => auditSink(entry),
});

const mounted = await adapter.mount({
  pluginId: 'kubeeye',
  surfaceId: 'overview',
  mountPointId: 'route:kubeeye-overview-route',
  container,
  layout: { width: 'full' },
  initialParameters: { view: 'route' },
  routeContext: { routeId: 'kubeeye-overview-route', pathname: '/kubeeye', params: {}, search: '' },
});

await mounted.unmount();
```

```ts
interface WujiePluginAdapter {
  mount(input: MountRestrictedSurfaceInput): Promise<MountedSurface>;
  unmount(surfaceInstanceId: string): Promise<void>;
  getInstance(surfaceInstanceId: string): SurfaceInstanceRecord | undefined;
  listInstances(): readonly SurfaceInstanceRecord[];
}
```

`mount` 会创建新的 `surfaceInstanceId`、Wujie name、MessagePort 和 BridgeSession。`unmount` 必须先关闭通信，再清理 Wujie 和监听器。

## 7. Bridge Contract

```ts
interface RuntimeSchema<T> {
  parse(value: unknown): T;
}

interface BridgeUnaryActionContract<Request extends JsonValue = JsonValue, Result extends JsonValue = JsonValue> {
  readonly kind: 'request';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly resultSchema: RuntimeSchema<Result>;
  readonly requiredPermissions: readonly PermissionId[];
  invoke(capability: unknown, payload: Request, context: BridgeInvocationContext): Result | Promise<Result>;
}

interface BridgeSubscriptionActionContract<Request extends JsonValue = JsonValue, Snapshot extends JsonValue = JsonValue, Event extends JsonValue = JsonValue> {
  readonly kind: 'subscription';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly snapshotSchema: RuntimeSchema<Snapshot>;
  readonly eventSchema: RuntimeSchema<Event>;
  readonly requiredPermissions: readonly PermissionId[];
  open(capability: unknown, payload: Request, context: BridgeInvocationContext, emit: (event: Event) => void): OpenedBridgeSubscription<Snapshot> | Promise<OpenedBridgeSubscription<Snapshot>>;
}
```

每次调用按顺序执行：Session、消息大小、ID 去重、声明、Contract、Action、Request Schema、Permission、资源限制、超时取消、Provider、Result Schema。所有成功和失败出口都会写入 bounded Audit。

## 8. Inspection

```ts
import { inspect } from '@nexus/plugin-runtime';

const snapshot = inspect(runtime, adapter);
```

Snapshot 投影 Runtime Ready、Plugin 状态、依赖、Core Closure、Capability ownership、Contribution ownership、Surface Instance、BridgeSession 和 Subscription count；不暴露原始 payload、Token、Capability value 或 Host 内部对象。

Host 可提供第二条 contribution availability 轴，旧调用保持兼容：

```ts
const snapshot = inspect(runtime, {
  listInstances: () => adapter.listInstances(),
  listHostContributions: () => routeModel.listHostContributions(location.pathname + location.search),
});
```

每个 Route/Navigation snapshot 的可选 `host` 提供 state、parent/fullPath、封闭 diagnostic codes 和瞬时导航 diagnostic。没有 Host source 时不生成该轴；它独立于 Plugin ACTIVE/FAILED。`RouteContext` 不写入 inspection，以免把当前 URL 参数或 search 当成诊断数据公开。安装和发布到旧 Host 前，可用 `assertContributionContractCompatible(manifest, 1)` 明确拒绝新字段；当前支持版本为 2，详见 [路由 rollout](maintainers/host-routing-implementation.md)。

## 9. UI Composition SDK

`@nexus/plugin-runtime/client` 提供 `connectUiHost`、`createUiClient` 与框架无关 `UiClient`；`@nexus/plugin-runtime/react` 提供 `UiProvider`、`Slot`、`useSurfaceContext`、`useUiObservation`。Host 通过 `createUiHost` 连接 Builtin renderer、Wujie adapter 与统一 Contribution Policy；页面内 Slot 不直接调用低层 `adapter.mount`。

Inspector 的 `inspectUi: () => ui.core.inspect()` source 提供 relation、Scope tree、Attempt 与 occurrence 元数据，不包含 Context / Overlay 业务数据。失败执行的呈现资源被清理后，失败事实仍保留在有效 Scope 中供重试；已清理的 Surface Instance 不作为历史记录保留。

完整用法与实际限制见 [UI 组合指南](./ui-composition-guide.md)。


## Console Core 公开组合入口

`@nexus/plugin-runtime/react` 提供 `UiProvider/useUiClient`、`Slot`、`ActionMenu`、`Tabs`、`useSurfaceContext`、`RouteOutlet/useRouteContext`、`RouteLink` 与 `useCapabilitySubscription`。插件消费 Host 绑定的 client，不自行指定 owner 或 Attempt；只有 Browser adapter 使用 Provider 装配接口。

`@nexus/plugin-runtime/client` 提供 Surface 的 `connectUiHost`、Action-only 入口的 `connectActionHost` 和 `createUiClient`。UiClient 的 `invoke/observe` 走 Capability 协议；`actions.query/start` 走 Point 所有权检查，二者授权独立。

Runtime 层公开 `createRouteModel`、`createActionRuntime`、`createContributionPolicy` 与 `resolveRootPresentation`。Registry 公开 `listExtensionPoints/listActions/listExtensions/listUiSurfaces`；Point 为编译后的只读契约，Builtin Action handler 的索引同样从成功接纳事务生成。

Browser Host 的 `BrowserHost` 接收 `BrowserDistribution`：发行版提供插件、根、契约、policy bundle、权限、安装存储和恢复操作。Host 不导入任何 Console 业务实现。`@nexus/browser-host/testing` 仅供 Distribution 验收 harness 使用，Feature 不可依赖。

Platform 的七个 Capability、动作和权限见 [Capability Catalog](./capability-catalog.md)。具体 Point/Ref/Action/Tab 声明示例见 [Author Guide](./plugin-author-guide.md)。


## 自动生成的插件契约参考

[Kind/Profile/Ref、Point 和按版本的插件 Extension API](./generated/plugin-contract/index.md) 直接消费共享声明。该参考不代表当前安装或运行时可用状态。

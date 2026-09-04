# Plugin API Reference

公开包为 `@nexus/plugin-runtime`，浏览器适配能力从 `@nexus/plugin-runtime/browser` 导入。

## 1. Runtime Bootstrap

```ts
import { bootstrapPluginRuntime } from '@nexus/plugin-runtime';

const runtime = await bootstrapPluginRuntime({
  builtins,
  coreRootIds: ['console-shell'],
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
  registerExtension(contribution: UiExtensionContribution): void;
}

interface RouteContribution {
  readonly id: string;
  readonly path: string;
  readonly target: HostRenderTarget;
}

interface NavigationContribution {
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly routeId?: string;
  readonly order?: number;
}

interface UiExtensionContribution {
  readonly id: string;
  readonly slot: string;
  readonly order?: number;
  readonly target: HostRenderTarget;
}
```

Builtin 可以使用 `target: { kind: 'builtin', render }`。Restricted Manifest 使用 `surfaceId` 声明式描述 `sandbox-surface` 目标；不能携带 Host-local render value。

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

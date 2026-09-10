# Manifest / Contract Spec

## 1. 标识与基本类型

```ts
type PluginId = string;
type CapabilityId = `${string}@${number}`;
type HostApiId = `${string}@${number}`;
type PermissionId = string;
```

V1 的兼容匹配使用显式 Major：

- Capability 和 Host API 必须带 Major；
- 不接受隐式 Major、版本范围或 SemVer Solver；
- 同一 Runtime 内 Plugin ID 唯一；
- 同一 Capability ID 只能有一个 Provider。

## 2. Restricted Manifest

```ts
interface RestrictedPluginManifest extends PluginDescriptor {
  readonly provides: readonly [];
  readonly entry: string;
  readonly hostApi: HostApiId;
  readonly permissions: readonly PermissionId[];
  readonly surfaces: readonly SandboxSurfaceDefinition[];
  readonly actions?: readonly { id: string }[];
  readonly roles?: readonly ('provider' | 'feature')[];
  readonly provenance?: 'first-party' | 'partner' | 'third-party';
  readonly contributions: RestrictedContributions;
  readonly extensionPoints?: readonly ExtensionPointDefinition[];
}

interface SandboxSurfaceDefinition {
  readonly id: string;
}
```

Manifest 是版本化的插件声明，必须使用 closed schema。以下字段禁止出现：

```text
trustLevel
runtime.type
requested direct / iframe
critical
Bridge Action
Action Schema
Action -> Permission mapping
```

Bridge Action 与 Permission 的语义由 Host 的 `BridgeCapabilityContract` 决定，不能由 Plugin Manifest 创造。

## 3. Installed Config

```ts
interface InstalledPluginConfig {
  readonly id: PluginId;
  readonly version: string;
  readonly enabled: boolean;
  readonly grantedPermissions: readonly PermissionId[];
}

interface InstalledPluginRecord {
  readonly manifest: RestrictedPluginManifest;
  readonly config: InstalledPluginConfig;
}
```

必须满足：

```text
config.id = manifest.id
config.version = manifest.version
grantedPermissions is a subset of manifest.permissions
```

管理员决策保存在 Config；Entry、Surface、Requested Permissions 和 Contributions 保存在 Manifest。Config 与 Manifest 必须精确配对到同一个版本。

## 4. Contribution Contract

### Route

```ts
interface RestrictedRouteContribution {
  readonly id: string;
  readonly path: string;
  readonly parentRouteId?: string;
  readonly point?: ExtensionPointRef;
  readonly childPoint?: ExtensionPointRef;
  readonly acceptsChildren?: boolean;
  readonly surfaceId: string;
  readonly layout?: JsonValue;
  readonly initialParameters?: JsonValue;
}
```

`parentRouteId` 引用父 Route，child 的 `path` 为非空相对路径；省略时使用顶层绝对路径。`point` 是可达声明必需的版本化接纳引用；`childPoint` 必须指向父 Owner 发布的 Point。`acceptsChildren` 保留为可读的旧字段，不能替代 Point 或授权。Restricted Surface 只作为叶 target，Host realm 的 Builtin Layout 承担 Outlet 组合。Host 路径、授权、环与冲突的 quarantine 不改变 Plugin bootstrap state。完整 grammar、隔离和 rollout 见 [Host 路由实施](maintainers/host-routing-implementation.md)。

### Navigation

```ts
interface NavigationContribution {
  readonly acceptsChildren?: boolean;
  readonly id: string;
  readonly label: string;
  readonly parentId?: string;
  readonly routeId?: string;
  readonly order?: number;
}
```

### UI Extension

```ts
interface ExtensionPointDefinition {
  readonly id: string;
  readonly kind: 'surface';
  readonly contractMajor: number;
  readonly contextSchema: ContextSchema;
}
interface RestrictedUiExtensionContribution {
  readonly id: string;
  readonly kind: 'surface';
  readonly point: { ownerPluginId: string; id: string; contractMajor: number };
  readonly surfaceId: string;
  readonly order?: number;
}
```

约束：

- Route ID 与 Navigation ID 在 Runtime 全局唯一；
- Extension Point、Contribution、Surface 的 local ID 分别按 owner 唯一；Contribution ID 跨 point 也不重复；
- UI Surface、point、kind、Major 和授权引用错误按 contribution 隔离；Route 的本地 Surface 引用仍在 Manifest 阶段校验；
- UI Context 使用声明的内联 JSON Schema 2020-12 子集，同一 Major 完全冻结，任何 Schema / semantic 变化都升 Major；
- Contribution 不产生 Capability Dependency；
- Contribution 使用显式 order、ownerPluginId、contributionId 稳定排序；
- 未挂载的 Slot 不会触发 Surface 执行；Ready 后不能新增静态定义；
- 新契约不接受原型的 `slot: string` 字段。

精确白名单与校验落点见 [UI 组合指南](./ui-composition-guide.md)。

## 5. Bridge Contract

```ts
interface BridgeCapabilityContract {
  readonly id: CapabilityId;
  readonly actions: Readonly<Record<string, BridgeActionContract>>;
}

interface BridgeInvocationContext {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly surfaceInstanceId: string;
  readonly mountPointId: string;
  readonly signal: AbortSignal;
}
```

Unary Action：

```ts
interface BridgeUnaryActionContract<Request, Result> {
  readonly kind: 'request';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly resultSchema: RuntimeSchema<Result>;
  readonly requiredPermissions: readonly PermissionId[];
  invoke(capability: unknown, payload: Request, context: BridgeInvocationContext): Result | Promise<Result>;
}
```

Subscription Action：

```ts
interface OpenedBridgeSubscription<Snapshot> {
  readonly snapshot: Snapshot;
  dispose(): void | Promise<void>;
}

interface BridgeSubscriptionActionContract<Request, Snapshot, Event> {
  readonly kind: 'subscription';
  readonly requestSchema: RuntimeSchema<Request>;
  readonly snapshotSchema: RuntimeSchema<Snapshot>;
  readonly eventSchema: RuntimeSchema<Event>;
  readonly requiredPermissions: readonly PermissionId[];
  open(capability: unknown, payload: Request, context: BridgeInvocationContext, emit: (event: Event) => void): OpenedBridgeSubscription<Snapshot> | Promise<OpenedBridgeSubscription<Snapshot>>;
}
```

Host 必须保证：

```text
requiredPermissions is a subset of grantedPermissions
requestedPermissions are known by the required Bridge Contracts
```

`CAPABILITY_NOT_BRIDGE_EXPOSED` 是 Manifest 阶段错误，不是运行期 RPC 错误。

## 6. Bootstrap Validation 分层

### Local Validation

只依赖当前 Manifest 与 Config，可在安装期执行：

- closed schema、ID / version 配对；
- `provides = []`；
- HostApiId 与 Permission ID 格式；
- Surface、Route、Navigation、Extension 的局部唯一性；
- Route 的局部 `surfaceId` 引用存在；UI relation 引用由 Host 在独立 contribution 轴诊断；
- Granted Permissions 是 Requested Permissions 的子集；
- Entry 通过 Artifact Allowlist。

### Runtime Validation

依赖当前 Host Catalog 和完整 Plugin Set：

- Host API Major 是否支持；
- required Capability Provider 是否存在且唯一；
- 每个 required Capability 是否有 Bridge Contract；
- Requested Permissions 是否被 Contract 认识；
- Plugin、Contribution 和跨 Plugin 引用是否冲突；
- Dependency Cycle 与 Core Closure 是否合法。

Local Validation 失败时不加载 `entry`、不创建 Wujie、MessagePort 或 BridgeSession。


## 7. Contract version 3：Profile、Action 和 Tab

Contribution 的目标引用统一为 `{ ownerPluginId, id, contractMajor }`。所有跨 Owner Kind 都需要 Distribution 明确 grant；Builtin 或来源分类不能绕过检查。Route/Navigation 根也必须指向 Distribution 选定的 Point，缺少 Point 会被隔离。

Point 定义二选一：

- 内联 `contextSchema` 与可选 `payloadSchema`；
- `profile: contractId@major` 与 `bindings`。绑定键必须来自 Profile 的 `refParameters`，值必须为 Distribution 注册的 Ref Contract；禁止同时传入 schema 覆盖。

`constraints` 只允许 `cardinality: { min, max }`、`groups: string[]`、`order: { min, max }`、`sizing: { modes, minWidth?, maxWidth?, minHeight?, maxHeight? }`、`presentations: string[]`。有 Profile 时只能收窄其允许范围。目录身份冲突、未知字段和不合法约束在声明接纳阶段拒绝；最终契约冻结后供执行消费。

```ts
interface ActionContribution {
  kind: 'action'; id: string; actionId: string; label: string;
  point: ExtensionPointRef;
  expectedProfile?: `${string}@${number}`;
  expectedRefContract?: `${string}@${number}`;
  group?: string; order?: number;
  visibleWhen?: readonly ActionCondition[];
  disabledWhen?: readonly ActionCondition[];
}
interface TabContribution {
  kind: 'tab'; id: string; tabId: string; label: string;
  surfaceId: string; point: ExtensionPointRef;
  expectedProfile?: `${string}@${number}`;
  expectedRefContract?: `${string}@${number}`;
  group?: string; order?: number;
}
```

Action contribution 的 `actionId` 必须来自同 Owner 接纳的 actions，Tab 的 `surfaceId` 必须来自同 Owner Surface。Action 声明中没有函数或 Host command；Builtin handler 单独由激活事务注册，Restricted handler 由执行入口 SDK 提供。兼容断言只拒绝当前选择，不搜索替代 Point。

`visibleWhen` 与 `disabledWhen` 分别使用 AND 语义，每组最多 20 条：selectionCount 的有限比较、Capability 的 available 布尔断言、trait 比较或 predicate 布尔断言。Ref 条件以 `match: 'all' | 'any'` 作用于引用集合；trait 的字段只能在 Ref Contract 中显式发布。条件不能代替每次 Capability 权限和业务实例验证。

Profile 中 `$refContract` 是专用占位符，不是通用 JSON Schema `$ref`。最终 schema 使用本文既有有限子集；函数、React 值、循环对象和超限 JSON 均拒绝。列表 selectedRefs 上限为 100。

`surfaces: []` 对 Action-only Manifest 合法。SDK 使用 `connectActionHost`，不创建 Surface Scope；Tab 复用既有 Surface/Slot 执行。Surface 与 Action Session 共用 Bridge 握手和 Capability 协议，并以 execution 元数据区分一次 Attempt 或 Invocation。


V1 约束适用范围：`group/order` 适用于各 Kind。`cardinality` 对 Surface/Tab 表示当前 Placement 选中的贡献数量，对 Action 表示一次调用的执行数量（固定为 1，范围不含 1 时贡献不可调用）；Route/Navigation 不接收该维度。`sizing/presentations` 仅适用于 Surface/Tab；Point Surface 支持 `inline`，Tab 支持 `tab`。Overlay 的 modal/drawer 是独立协议，不属于 Point 的呈现方式。尚无执行语义的维度或方式在声明接纳时明确拒绝，不作为无效限制静默保存。

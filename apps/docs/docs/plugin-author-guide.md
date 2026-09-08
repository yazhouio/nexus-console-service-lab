# Plugin Author Guide

## 1. 先确定插件类型

V1 只有两条正式执行路径：

| 执行边界 | 装载 | 执行方式 | 适用场景 |
| --- | --- | --- | --- |
| Builtin Plugin | 与 Host / Kernel 同包构建 | Direct `activate(context)` | Host 自有、可信代码 |
| Restricted Plugin | 已安装的 Manifest | 按需 Wujie Execution + PluginBridge | 外部或合作方 UI 插件 |

外部插件在 V1 统一为 `Restricted + Wujie`。Manifest 不能请求 Direct、iframe、Trust Level 或自定义安全策略。

角色 `roles: ["provider", "feature"]` 可重叠；来源 `provenance: "first-party" | "partner" | "third-party"` 与 Builtin/Restricted 独立。分类是元数据，不产生 Point 或 Capability grant。

本文主要说明 Restricted Plugin。Builtin 的 Host 侧实现见 [Example Plugins](./example-plugins.md)。

## 2. 最小开发流程

1. 为每个可渲染 UI 资源定义一个 `surface`。
2. 在 Manifest 中声明 `requires`、`hostApi`、Requested Permissions 和 Contributions。
3. 只通过 Host 发布的 Bridge Contract 调用 Capability。
4. 所有跨边界数据保持为 JSON 值。
5. 在 Surface 被挂载后再连接 Bridge；不要假设 Plugin 被 Bootstrap 接纳就已经运行。
6. 用 Route 和 Extension 两条真实挂载路径验证独立实例、清理和失败隔离。

## 3. Manifest 示例

```json
{
  "id": "kubeeye",
  "version": "1.0.0",
  "entry": "/plugins/kubeeye/1.0.0/",
  "hostApi": "kubesphere.console@1",
  "requires": ["kubesphere.cluster@2"],
  "provides": [],
  "permissions": ["cluster.read"],
  "surfaces": [{ "id": "overview" }],
  "contributions": {
    "routes": [{
      "id": "kubeeye-overview-route",
      "path": "/kubeeye",
      "point": { "ownerPluginId": "console-core", "id": "routes", "contractMajor": 1 },
      "surfaceId": "overview",
      "layout": { "width": "full" },
      "initialParameters": { "view": "route" }
    }],
    "navigation": [{
      "id": "kubeeye-overview-navigation",
      "label": "KubeEye",
      "point": { "ownerPluginId": "console-core", "id": "primary-navigation", "contractMajor": 1 },
      "routeId": "kubeeye-overview-route",
      "order": 200
    }],
    "extensions": [{
      "id": "kubeeye-overview-card",
      "kind": "surface",
      "point": { "ownerPluginId": "console-core", "id": "home.cards", "contractMajor": 1 },
      "surfaceId": "overview",
      "order": 200
    }]
  }
}
```

关键规则：

- `provides` 必须是空数组；Restricted Plugin 不能向 Runtime 注册 Global Capability。
- `entry` 必须通过 Host Artifact Allowlist，并使用 Host 支持的同源 HTTP(S) 地址。
- UI Contribution 的 `surfaceId` 引用本 owner 已声明 Surface；引用错误隔离该 contribution，不执行它。Route 的局部 Surface 引用仍在 Manifest 阶段校验。
- Route ID 和 Navigation ID 在 Runtime 内唯一；Extension Point / Contribution / Surface 的 local ID 分别在声明 owner 内唯一，Contribution ID 跨 point 也不能重复。
- `grantedPermissions` 由安装配置决定，且必须是 Manifest `permissions` 的子集。

## 4. Surface 编写规则

Surface 是一个普通前端入口，但它运行在独立的 Surface Instance 中：

- 不要从 Wujie props 中读取未声明的身份、权限或 Capability 信息。
- `plugin`、`surface` 和 `bridge` 是 Host 传入的有限 Bootstrap 数据。
- Route 的 `layout` / `initialParameters` 保持 JSON；Slot 的业务输入使用结构化 Context，尺寸由 A 的 sizing policy 与真实 container 协调。不能跨边界传递 Function、DOM Node、React Context、Token 或 Raw API Client。
- 组件卸载时停止订阅；即使不主动停止，Session dispose 也会清理所属 Subscription。
- 每次打开 Surface 都可能产生新的 `surfaceInstanceId`，不要把它当作 Plugin 永久 ID。

## 5. 调用 Bridge

Bridge 请求的消息形状是：

```ts
{
  type: 'request',
  requestId: crypto.randomUUID(),
  capability: 'kubesphere.cluster@2',
  action: 'getCurrentCluster',
  payload: null
}
```

Subscription Action 返回：

```ts
{
  subscriptionId: 'subscription-1',
  snapshot: 'demo-cluster'
}
```

之后从 Host 收到：

```ts
{
  type: 'event',
  subscriptionId: 'subscription-1',
  payload: 'second-cluster'
}
```

调用注意事项：

- `capability` 必须存在于 Manifest `requires`。
- Action 所需权限必须已 Grant，否则返回 `PERMISSION_DENIED`。
- Request、Result、Snapshot 和 Event 都由 Host Contract 做 Schema 校验。
- `requestId` 只在当前 BridgeSession 内去重，且不能复用。
- Unsubscribe 是 Session 控制消息，重复释放是幂等的。
- 超时、Unmount 或 Session failure 后，不要继续使用旧 MessagePort。

## 6. 不要依赖的能力

V1 不提供：

- Generic EventBus 或 Plugin-defined Service Registration；
- Plugin 之间直接访问彼此内部实现；
- Hot Install、Hot Upgrade、Hot Unload；
- Trusted External Direct Plugin；
- Hostile-code Containment 或独立 Origin 安全边界。

同源 Wujie 的 `window.parent` 可能可访问。真实数据安全必须由 Backend Authorization 保证，Bridge Permission 不能替代后端鉴权。

## 7. 作者验收清单

- [ ] Manifest 通过 closed schema 校验。
- [ ] `id`、`version`、`entry`、`hostApi` 和 `provides` 正确。
- [ ] 所有 `requires` 都有 Host Bridge Contract。
- [ ] Requested / Granted Permissions 清晰且最小化。
- [ ] Route、Navigation、Extension ID 无冲突。
- [ ] 每个 `surfaceId` 都存在且只传 JSON 数据。
- [ ] Bridge 调用覆盖成功、权限拒绝、Schema 错误、超时和 Unsubscribe。
- [ ] Route 与 Extension 同时挂载时相互独立。
- [ ] Surface 失败不会误报 Plugin FAILED。
- [ ] 后端接口有独立授权测试。

## 8. 跨插件页面组合

A 静态声明 Extension Point，在自己的 Surface 中渲染 `<Slot id="details" contextKey={nodeId} context={{ nodeId }} />`。B 声明指向 A 的 point@major 的 Contribution 和自身 Surface，用 `useSurfaceContext()` 读取最新合法快照。Host 负责授权、选择、执行和清理；A 只管理 placement。

Restricted 入口用 `connectUiHost()` 创建唯一控制连接，再用 `UiProvider` 包装 UI。Builtin 使用 Host 注入的同一 `UiClient`。Overlay 使用 `nexus.ui-overlay@1` Capability 并声明 `ui.overlay` 权限。完整可运行代码、Schema 白名单和 v1 限制见 [UI 组合实现与作者 API](./cross-plugin-ui-composition-implementation.md)。


## Console Core 作者接口（contract version 3）

Feature 从 `@nexus/console-core-api` 获取 Point ID、Profile 和贡献构造器，从自己的领域 API 获取 Ref Contract。不要导入 `@nexus/console-core` 实现、`@nexus/browser-host` 或 Runtime 私有源码。Distribution 在 `apps/console/src/distribution.ts` 汇集契约并提供两类独立授权：`contributor → point@major` 的静态 grant，以及 Capability 的 permission grant。

所有 Route/Navigation 都指向版本化 Point。父节点通过 `childPoint` 发布自己拥有的子接纳点；`acceptsChildren` 不能替代 Point 或 grant。Builtin Layout 使用 `RouteOutlet/useRouteContext`，链接用 Route ID 和参数；Restricted 调用 `routes.navigate@1/navigate`，输入 `{ routeId, params }`。它不能提交 URL、search 或 history 操作。

### 参数化 Point

```ts
contributions.registerExtensionPoint({
  id: 'node.actions', kind: 'action', contractMajor: 1,
  profile: 'detail.actions@1',
  bindings: { itemRefContract: 'cluster.resource-ref@1' },
});
```

Profile 是 API 包的声明，Distribution 注册 Profile 与 Ref Contract 后，由接纳事务编译最终 schema。Point 可以收窄 Profile 允许的 group、order、cardinality、尺寸和呈现约束，但不能覆盖 Context/Payload schema。修改 Profile、Ref 绑定或最终 Context（包括可选字段）须升 Point Major。`expectedProfile/expectedRefContract` 只做兼容断言，不会改选其他 Point。

详情 Context 使用 `{ itemRef }`，列表使用 `{ selectedRefs, filtered, matchedCount? }`；最多 100 个引用，同时受 JSON 资源上限限制。只传引用和摘要，详细数据通过获授权 Capability 查询。需要实例身份的业务操作应要求 `uid` 并由业务 Capability 验证，不以按钮 visible/disabled 条件代替授权。

### 无 Surface 的 Action

Manifest 可以声明 `surfaces: []` 和 `actions: [{ id: "check" }]`。贡献仅声明 JSON 元数据：

```json
{
  "id": "check-node", "kind": "action", "actionId": "check", "label": "Check node",
  "point": { "ownerPluginId": "cluster", "id": "node.actions", "contractMajor": 1 },
  "expectedRefContract": "cluster.resource-ref@1"
}
```

Restricted 入口使用 SDK；每次执行都有独立 Session，不维护常驻 plugin-wide 连接：

```ts
import { connectActionHost } from '@nexus/plugin-runtime/client';
await connectActionHost(async ({ invocationId, actionId, context, payload, signal, capabilities }) => {
  // context / payload 已复制并冻结；能力、权限和结果校验与 Surface 相同。
  return capabilities.invoke('routes.query@1', 'current', null);
});
```

Builtin 在 `activate` 中调用 `actions.register('check', handler)`，handler 接收同一输入和受授权的 `capabilities.invoke`。声明事务失败时 handler 和元数据一起回滚。页面 Owner 用公开 `ActionMenu` 或 `useUiClient().actions.start(point, ref, context, options)` 创建调用；后者返回 `{ invocationId, result, cancel }`，`result` 只完成一次为 succeeded/failed/cancelled/timed-out。

Action 默认 30 秒超时，可指定至多 300 秒；取消、超时及调用者 Scope 结束会失效通信并回收执行资源。Runtime 不重试副作用，不承诺回滚；业务结果应经 Capability 再查询。可用条件仅允许 selectionCount、已声明 Capability 和 Ref Contract 发布的 trait/predicate，禁止任意 schema path。

### Tab

Tab 贡献声明 `{ kind: 'tab', tabId, label, surfaceId, point }`，其中 Surface 必须归贡献 Owner 所有。页面使用 `Tabs`：

```tsx
<Tabs id="node.tabs" label="Node extensions" contextKey={`${clusterId}/${name}`}
  context={{ itemRef: { clusterId, apiVersion: 'v1', kind: 'Node', name } }} />
```

初始不选择内容；点击或 Enter/Space 选择，方向键/Home/End 移动焦点。选中后复用 Slot/Surface 执行，切走卸载，重入新建，不支持 keep-alive。Tab 默认不改变 URL；页面需要 URL 映射时自行声明 Route。

### 发布检查

`pnpm check:plugin-contract manifest.json 3` 校验目标声明代际；选择 1/2 时新 Kind、Profile 和 Point 路由会被拒绝。Bridge protocol version 继续独立演进。`pnpm check:boundaries` 会拒绝绕过公开作者接口的依赖。


V1 约束适用范围：`group/order` 适用于各 Kind。`cardinality` 对 Surface/Tab 表示当前 Placement 选中的贡献数量，对 Action 表示一次调用的执行数量（固定为 1，范围不含 1 时贡献不可调用）；Route/Navigation 不接收该维度。`sizing/presentations` 仅适用于 Surface/Tab；Point Surface 支持 `inline`，Tab 支持 `tab`。Overlay 的 modal/drawer 是独立协议，不属于 Point 的呈现方式。尚无执行语义的维度或方式在声明接纳时明确拒绝，不作为无效限制静默保存。

# Plugin Author Guide

## 1. 先确定插件类型

V1 只有两条正式执行路径：

| 类型 | 来源 | 执行方式 | 适用场景 |
| --- | --- | --- | --- |
| Builtin Plugin | 与 Host / Kernel 同包构建 | Direct `activate(context)` | Host 自有、可信代码 |
| Restricted Plugin | 已安装的 Manifest | 按需 Wujie Surface + PluginBridge | 外部或合作方 UI 插件 |

外部插件在 V1 统一为 `Restricted + Wujie`。Manifest 不能请求 Direct、iframe、Trust Level 或自定义安全策略。

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
      "surfaceId": "overview",
      "layout": { "width": "full" },
      "initialParameters": { "view": "route" }
    }],
    "navigation": [{
      "id": "kubeeye-overview-navigation",
      "label": "KubeEye",
      "routeId": "kubeeye-overview-route",
      "order": 200
    }],
    "extensions": [{
      "id": "kubeeye-overview-card",
      "slot": "console.home.cards",
      "surfaceId": "overview",
      "order": 200,
      "layout": { "width": "compact" },
      "initialParameters": { "view": "card" }
    }]
  }
}
```

关键规则：

- `provides` 必须是空数组；Restricted Plugin 不能向 Runtime 注册 Global Capability。
- `entry` 必须通过 Host Artifact Allowlist，并使用 Host 支持的同源 HTTP(S) 地址。
- `surfaceId` 必须引用同一个 Manifest 中已声明的 Surface。
- Route ID 和 Navigation ID 在 Runtime 内唯一；Extension ID 在同一个 Slot 内唯一。
- `grantedPermissions` 由安装配置决定，且必须是 Manifest `permissions` 的子集。

## 4. Surface 编写规则

Surface 是一个普通前端入口，但它运行在独立的 Surface Instance 中：

- 不要从 Wujie props 中读取未声明的身份、权限或 Capability 信息。
- `plugin`、`surface` 和 `bridge` 是 Host 传入的有限 Bootstrap 数据。
- `layout` 与 `initialParameters` 只能使用 JSON 值，不能传递 Function、DOM Node、React Context、Token 或 Raw API Client。
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

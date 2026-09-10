# Capability Catalog

Capability 是 Host / Builtin 提供给 Plugin 的版本化行为 Contract。当前清单来自示例 Host 的 `apps/console/src/plugins` 与 `packages/plugin-runtime/src/platform.ts`，正式产品应由具体 Host 维护自己的 Catalog。

## 1. Catalog 总览

| Capability | Provider | 类型 | Bridge | Permission |
| --- | --- | --- | --- | --- |
| `kubesphere.console-core@1` | `console-core` | Direct-only Builtin Capability | 否 | 无 |
| `kubesphere.cluster@2` | `cluster` | Builtin Capability | 是 | `cluster.read` |
| `nexus.ui-overlay@1` | `nexus-ui-overlay` | Host UI Capability | 是 | `ui.overlay` |

当前 Host API 为 `kubesphere.console@1`。

## 2. `kubesphere.console-core@1`

Provider：`console-core@1.0.0`。

```ts
interface ConsoleCoreCapability {
  readonly name: string;
}
```

当前实现返回：

```ts
{ name: 'Nexus Console' }
```

该 Capability 用于 Builtin 依赖示例，未定义 Bridge Contract，因此 Restricted Plugin 不能在 Manifest 中要求它。

## 3. `kubesphere.cluster@2`

Provider：`cluster@1.0.0`。

```ts
interface ClusterCapability {
  getCurrentCluster(): string;
  setCurrentCluster(name: string): void;
  watchCurrentCluster(emit: (name: string) => void): {
    snapshot: string;
    dispose(): void;
  };
}
```

### Unary Action: `getCurrentCluster`

| 字段 | 值 |
| --- | --- |
| Action kind | `request` |
| Request | `null` |
| Result | `string` |
| Required Permission | `cluster.read` |
| 失败行为 | `PERMISSION_DENIED`、`INVALID_REQUEST`、`INVALID_RESULT` 等 |

消息示例：

```ts
{
  type: 'request',
  requestId: 'request-1',
  capability: 'kubesphere.cluster@2',
  action: 'getCurrentCluster',
  payload: null
}
```

### Subscription Action: `watchCurrentCluster`

| 字段 | 值 |
| --- | --- |
| Action kind | `subscription` |
| Request | `null` |
| Snapshot | `string` |
| Event | `string` |
| Required Permission | `cluster.read` |
| 生命周期 | 绑定到当前 BridgeSession |

成功结果是 `{ subscriptionId, snapshot }`。Host 在发送 Snapshot Response 前产生的 Event 会有界缓冲，发送成功后按 MessagePort 顺序投递。

## 4. Catalog 约束

- Capability ID 必须包含显式 Major。
- 同一 Runtime 只能有一个 Provider。
- Restricted Plugin 只能消费 Host 已 Bridge-expose 的 Capability。
- Manifest `permissions` 只能引用所需 Bridge Contract 已知的 Permission。
- Action 所需 Permission 在每次调用时检查。
- Capability value、Host object 和 Raw API Client 永远不跨 Bridge 暴露。
- 增加新的 Capability 或 Action 应同步更新 Host Catalog、Manifest Contract、Example 和 E2E 测试。

## 5. `nexus.ui-overlay@1`

`open` 返回自有已声明 Surface 的 Overlay handle；`complete` 完成当前 Overlay 执行，`cancel` 取消本 owner Scope 的 handle。`observe` 是 subscription：传 `{ handle }` 观察单项，传 `null` 枚举当前 owner Scope 的全部记录。每个动作都要求声明 capability 并获得 `ui.overlay` grant。

业务 outcome 与呈现 execution 分开；open 不等待业务结果，终态只可从 pending 进入 completed / cancelled 一次。资源属于 Host 绑定的 owner Scope，替代 Attempt 可恢复观察。完整输入输出及生命周期见 [UI 组合指南](./ui-composition-guide.md)。


## 6. Platform Capability（Builtin / Restricted 共用）

Provider 为 `nexus-platform`；每次请求均检查声明的 requires、schema 和下表权限。Builtin 通过本地 MessagePort Adapter 使用相同检查；伪造调用 context 不能直接调用服务。平台数据只以有界 JSON 返回。

| Capability | Actions | Permission |
| --- | --- | --- |
| `routes.query@1` | `list`、`current`、`navigation`（null 输入）；`watch` 订阅 | `routes.query` |
| `routes.navigate@1` | `navigate({ routeId, params })` | `routes.navigate` |
| `plugins.query@1` | `list`、`watch`（null 输入） | `plugins.query` |
| `plugins.manage@1` | `install({ id, version })`、`selectVersion({ id, version })`、`setEnabled({ id, enabled })`、`uninstall({ id })` | `plugins.manage` |
| `diagnostics.query@1` | `get(null)` | `diagnostics.query` |
| `diagnostics.export@1` | `export(null)` → `{ filename, contents }` | `diagnostics.export` |
| `audit.query@1` | `list(null)` | `audit.query` |

Route 查询返回 Route ID、owner、参数 schema、ancestry 和当前参数；Navigation 返回元数据及树结构，不暴露原始 URL/pathname/search/history。导航先校验可达 Route 和精确参数集合，再由 Host 执行，并记录调用 pluginId 的审计。无任意 URL 跳转接口。

Plugin 查询包括所有插件；manage 仅修改可安装的非 Core Restricted 配置，返回 `reloadRequired: true`。Core/Builtin 的 disable、uninstall、切版和 install 均拒绝。升级保留当前启用状态和新版仍声明的既有权限，不自动添加新权限。

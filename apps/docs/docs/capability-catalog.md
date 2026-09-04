# Capability Catalog

Capability 是 Host / Builtin 提供给 Plugin 的版本化行为 Contract。当前清单来自示例 Host 的 `apps/host/src/plugins`，正式产品应由具体 Host 维护自己的 Catalog。

## 1. Catalog 总览

| Capability | Provider | 类型 | Bridge | Permission |
| --- | --- | --- | --- | --- |
| `kubesphere.console-shell@1` | `console-shell` | Direct-only Builtin Capability | 否 | 无 |
| `kubesphere.cluster@2` | `cluster` | Builtin Capability | 是 | `cluster.read` |
| `nexus.ui-overlay@1` | `host-ui-overlay` | Host UI Capability | 是 | `ui.overlay` |

当前 Host API 为 `kubesphere.console@1`。

## 2. `kubesphere.console-shell@1`

Provider：`console-shell@1.0.0`。

```ts
interface ConsoleShellCapability {
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

业务 outcome 与呈现 execution 分开；open 不等待业务结果，终态只可从 pending 进入 completed / cancelled 一次。资源属于 Host 绑定的 owner Scope，替代 Attempt 可恢复观察。完整输入输出及生命周期见 [UI 组合实现](./cross-plugin-ui-composition-implementation.md)。

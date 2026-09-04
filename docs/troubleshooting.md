# Troubleshooting

## 1. 先跑统一检查

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

开发 Host 和示例 Plugin 需要两个终端：

```bash
pnpm dev:host   # http://localhost:3000
pnpm dev:plugin # http://localhost:3001
```

Playwright 会在需要时启动 Host、Plugin 和授权 Fixture。

## 2. Runtime 没有 READY

症状：Host Inspector 显示 Bootstrap error，或页面显示 `FAILED`。

检查：

1. 查看 `inspect(runtime)` 的 `bootstrapError`。
2. 确认 Core Root ID 存在。
3. 确认 Core Closure 中的依赖都是 Builtin。
4. 检查 `MISSING_CAPABILITY`、`DUPLICATE_CAPABILITY_PROVIDER` 和 `CIRCULAR_DEPENDENCY`。
5. 检查 Builtin `activate()` 是否抛错、是否缺少声明的 provide。

Core 失败会阻止 Runtime Ready；这是预期行为。

## 3. Plugin 是 SKIPPED

按错误阶段分辨：

| 阶段 | 常见原因 | 处理 |
| --- | --- | --- |
| `manifest` | Schema、Entry、Host API、Permission、Bridge Contract 或 Contribution 无效 | 修复 Manifest / Config；Plugin Code 尚未执行 |
| `resolve` | Missing、Duplicate Provider、Cycle 或上游 Provider 非 ACTIVE | 修复 `requires` / Provider；检查依赖链 |

Restricted Plugin `CAPABILITY_NOT_BRIDGE_EXPOSED` 必须在 Manifest 阶段处理，不要在 Surface 内重试 RPC。

## 4. Surface 打开失败

Inspector 或 `SurfaceMountIssue.stage` 的含义：

| Stage | 常见原因 |
| --- | --- |
| `artifact` | Entry 不可访问、代理路径错误、资源返回非成功 |
| `wujie-bootstrap` | Wujie driver 启动失败 |
| `handshake` | 协议版本、nonce、Origin、Surface instance 不匹配或超时 |
| `render` | 子窗口运行时 Error / unhandled rejection |
| `bridge` | Session 被严重协议违规或通信失败关闭 |

Surface failure 只影响当前 Surface Instance。若 Plugin 仍为 `ACTIVE` 且 Runtime 为 `READY`，这是预期的 fail-soft 语义。

检查清单：

- `entry` 是否以 `/plugins/` 开头并与 Host 同源；
- `publicPath` 是否与 Manifest versioned entry 一致；
- Host proxy 是否同时支持 HTTP 和 WebSocket；
- Browser 是否创建了 iframe / `wujie-app`；
- `data-parent-accessible` 是否被错误地当作安全保证；
- 是否在 Unmount 后继续使用旧 MessagePort。

## 5. Bridge 返回错误

| 错误码 | 首要检查 |
| --- | --- |
| `UNDECLARED_CAPABILITY_REQUIRE` | Capability 是否写入 Manifest `requires` |
| `CAPABILITY_UNAVAILABLE` | Contract 和 ACTIVE Provider 是否存在 |
| `UNKNOWN_ACTION` | Action 名称及 Host Catalog |
| `INVALID_REQUEST` | closed envelope 和 requestSchema |
| `INVALID_RESULT` | Provider 返回值和 result / snapshot Schema |
| `PERMISSION_DENIED` | Config `grantedPermissions` 与 Action Required Permissions |
| `DUPLICATE_REQUEST` | 是否复用了当前 Session 的 requestId |
| `MESSAGE_TOO_LARGE` | JSON UTF-8 大小和自定义 limits |
| `RATE_LIMITED` | 请求速率、Event 速率或 Session ID budget |
| `CONCURRENCY_LIMITED` | Pending 请求是否过多 |
| `SUBSCRIPTION_LIMITED` | 当前 Session 的订阅数是否达到限制 |
| `TIMEOUT` | Provider 是否响应 AbortSignal |
| `BRIDGE_SESSION_INACTIVE` | Session 是否已 Unmount / dispose |

默认 Bridge 限制见 [README.md](../README.md#bridge-sessions)：64 KiB 消息、16 并发、100 requests/s、10 秒超时、32 个订阅。

## 6. 订阅没有更新

检查：

1. Open Action 是否返回 `{ snapshot, dispose }`。
2. `snapshotSchema` 和 `eventSchema` 是否接受真实值。
3. Plugin 是否保存并匹配正确的 `subscriptionId`。
4. 是否已执行 Unsubscribe。
5. 是否触发 Event rate / buffer limit。
6. Surface 是否已经进入 `FAILED` 或 BridgeSession `DISPOSED`。

Open Response 发送前的 Event 会被有界缓冲；Open 失败时不会暴露 subscription ID。

## 7. 配置修改后页面仍显示旧版本

这是 Runtime Immutable 设计：`install`、`setEnabled`、`selectVersion` 和 `uninstall` 只更新 Installation Store，并返回 `reloadRequired: true`。必须 Reload 页面，当前 Runtime 不会热更新。

## 8. 需要查看安全问题

用 E2E 验证两条独立边界：

- Bridge grants 缺失时，Bridge Action 返回 `PERMISSION_DENIED`；
- Plugin 仍可能发起同源请求，后端必须独立返回允许或 403。

不要把 Wujie 同源能力描述成 hostile-code sandbox。

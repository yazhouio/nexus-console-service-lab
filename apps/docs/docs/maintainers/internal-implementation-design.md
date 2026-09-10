# Internal Implementation Design

本文是 P2 内部设计说明。对外行为仍以仓库中的 `spec/技术落地方案.md` 和 P0 Contract 文档为准。

## 1. Module 划分

| Module | 责任 |
| --- | --- |
| `identifiers.ts` | Capability / Host API / Permission 标识校验 |
| `resolver.ts` | 纯依赖解析、Cycle、Core Closure、稳定拓扑顺序 |
| `capability.ts` | Capability Registry、Owner-bound activation staging |
| `contribution.ts` | Route / Navigation / Extension Registry 与排序 |
| `surface-definition.ts` | Restricted Surface Definition Registry |
| `manifest.ts` | Manifest / Config Local Validation |
| `bootstrap.ts` | Host Validation、Builtin Activation、Restricted Commit |
| `installation-store.ts` | 配置持久化与 Reload-required 操作 |
| `browser/wujie-plugin-adapter.ts` | Surface Instance 和 Wujie 资源生命周期 |
| `browser/window-bridge-handshake.ts` | Window / MessagePort Handshake |
| `browser/plugin-bridge.ts` | Contract、Permission、限制、取消、Subscription、Audit |
| `inspection.ts` | Runtime Facts 的不可变安全投影 |

V1 不把这些责任拆成 Generic RuntimeLoader、Generic PluginAdapter、PermissionBroker、Limiter、AuditService 或通用 RPC Framework。单一深模块隐藏完整行为，避免调用者重新组合安全顺序。

## 2. Bootstrap 不变量

Bootstrap 的关键顺序：

```text
validate local input
  → collect candidates
  → resolve once
  → activate Builtins in stable order
  → commit Builtin registrations atomically
  → validate and commit Restricted declarations
  → expose Runtime
```

关键不变量：

- Resolver 不执行代码。
- Core Closure 只能包含 Builtin。
- `require` 只能读取已 commit 的 Provider。
- 一个 Plugin 的 Capability 和 Contribution 必须一起提交或一起丢弃。
- Restricted `ACTIVE` 不代表 Surface 已加载。
- Runtime Ready 后 Plugin Set 不变化。

## 3. Browser Adapter 清理顺序

Adapter 使用每实例的 AbortController、Handshake Attempt、BridgeSession 和 cleanup Promise。清理顺序是：

```text
mark / dispose BridgeSession
  → abort pending requests and subscriptions
  → cancel handshake
  → abort artifact fetches
  → remove listeners
  → await late start task
  → destroy Wujie instance
```

这个顺序防止 late Wujie start 在 Unmount 后重新复活。每个 disposer 至多调用一次，单个 disposer 失败不能阻止其余清理。

## 4. Bridge 内部模型

一个 `PluginBridgeSession` 持有：

- immutable Session identity；
- `pending` AbortController 集合；
- 永不驱逐的 request ID 集合；
- rolling request / event timestamps；
- active Subscription 集合；
- Host error 和 Audit bounded arrays；
- 当前协议违规计数。

Subscription 在 Snapshot Response 发送前处于 opening 状态，Event 进入 session-local buffer；Response 成功后才标记 ready 并释放 buffer。

每个入口使用统一 `recordAudit`，包括 envelope 尚未完整解析的早期拒绝，从而保证诊断归因一致，并对 identifiers / diagnostic text 做长度上限。

## 5. Runtime Inspection

`inspect(runtime, source?)` 是纯 Projection：

- 不改变 Runtime、Registry 或 Adapter；
- 对 Map / Set / Array / nested records 做不可变拷贝；
- 将内部 `unknown` 错误转换为稳定 code、message 和安全 metadata；
- 不暴露 Raw payload、Capability value、Token、stack 或 Host object；
- 通过可选 `listInstances()` 合并实时 Surface Instance facts。

## 6. 测试策略

| 层级 | 重点 |
| --- | --- |
| Unit | Identifier、Manifest、Resolver、Registry、Bootstrap、Inspection |
| Bridge Unit | Envelope、Schema、Permission、Dedup、Limit、Timeout、Subscription、Audit |
| Adapter Unit | Mount / Unmount、Handshake、late start、cleanup、failure stage |
| Browser E2E | 同源 Wujie、Route / Extension 独立实例、真实网络授权、Reload |

Resolver、Registry 和 Bridge 使用纯输入输出测试；Wujie 的同源 cooperative-isolation 结论必须由 Browser Integration / E2E 验证，不能用 Mock Context 代替。

## 7. 当前验证基线

最近一次 V1 review 记录：

- `pnpm test`：134 tests passed；
- `pnpm typecheck`：passed；
- `pnpm build`：runtime、Host、Restricted fixture 均通过；
- `pnpm test:e2e`：8 browser cases passed；
- `git diff --check`：passed。

详细记录见仓库中的 `.scratch/frontend-plugin-runtime-v1/review.md`。

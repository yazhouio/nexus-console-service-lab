# Lifecycle & Architecture

## 1. 架构总览

```text
Builtin Definitions       Installation Store
        │                         │
        └──────────┬──────────────┘
                   ▼
           Validate + Resolve
                   │
          Core Closure / Order
                   │
          Activate Builtins
                   │
      Commit Restricted Declarations
                   │
              Runtime Ready
                   │
       On-demand Surface Mount
                   │
       Wujie + Handshake + Bridge
```

Kernel 只负责 Bootstrap、Resolver、Capability Registry、Contribution Registry、Surface Definition Registry 和 Runtime Facts。Restricted Plugin 不获得 Direct `PluginContext`、Host Runtime Object 或 Raw Host API。

## 2. 一次 Runtime 生命周期

```text
Page Load
  → collect static Builtins and enabled InstalledPluginRecords
  → local / runtime validation
  → resolve dependencies and Core Closure
  → serial Builtin activation
  → atomic Restricted declaration commit
  → Runtime Ready
```

Runtime Ready 后，以下事实不可变：

- Plugin Set；
- Dependency DAG 与 Provider；
- Capability Provider；
- Surface Definitions；
- Contributions。

可变的只有按需资源事实：Surface Instance、BridgeSession 和 Subscription。

## 3. Resolver 与 Core Closure

Resolver 是纯计算过程，不加载 Artifact、不执行 Plugin Code、不修改 Registry。

步骤：

1. 校验 Plugin ID。
2. 构建 Capability → Provider 索引。
3. 拒绝 Duplicate Provider。
4. 解析 `requires` edges。
5. 检测缺失 Capability 和 Cycle。
6. 从 Host Core Roots 反向展开 Core Closure。
7. 校验 Core Closure 全部是 Builtin。
8. 以 `pluginId ASC` 作为 tie-breaker 进行稳定拓扑排序。

Core Closure 任何失败都会阻止 Runtime Ready。Non-core 错误只会让相关 Plugin 和消费者进入 `SKIPPED`。

## 4. Builtin 激活与原子提交

每个 Builtin 都得到 owner-bound `PluginContext`：

```text
begin activation
  → stage Capability / Contribution
  → activate(context)
  → validate declared provides and contributions
  → atomic commit
```

激活期间 staged records 不进入 Global Registry。`require()` 只能看到已经 commit 的 Capability。

- Core Builtin activate / assertion 失败：Runtime Bootstrap Failed。
- Non-core Builtin activate / assertion 失败：Plugin `FAILED`，Runtime 仍可 Ready。
- 失败时丢弃当前 Plugin 的全部 staged records。
- V1 不承诺撤销 Plugin 私自执行的任意外部副作用。

## 5. Restricted Plugin 生命周期

Restricted 在 Bootstrap 阶段只做声明接纳：

```text
Manifest + Config valid
  → Host API / Bridge / dependency valid
  → Surface Definitions + Contributions atomic commit
  → Plugin ACTIVE
```

`Plugin ACTIVE` 不表示 Artifact 已下载、Wujie 已启动或 Bridge 已连接。

首次访问 Route 或 Extension 时才执行：

```text
mount request
  → create Surface Instance identity
  → create nonce and Bridge Bootstrap Descriptor
  → start Wujie
  → validate Handshake
  → create dedicated MessagePort / BridgeSession
  → Surface MOUNTED
```

每次 mount 都拥有独立的 `surfaceInstanceId`、Wujie name、MessagePort、BridgeSession、request IDs、limits 和 Subscription 集合。

## 6. 状态语义

### Plugin Runtime State

| 状态 | 含义 |
| --- | --- |
| `ACTIVE` | Bootstrap 接纳并完成必要注册 |
| `SKIPPED` | Plugin Code 未执行，因 Manifest 或 Resolve 阶段不满足条件 |
| `FAILED` | Builtin 已执行，但 activate 或声明断言失败 |

Restricted Plugin 只有 `ACTIVE` / `SKIPPED`；Surface 执行失败不把 Plugin 改成 `FAILED`。

### Surface Instance

```text
UNMOUNTED → MOUNTING → MOUNTED
                    └→ FAILED
MOUNTED / FAILED → unmount → UNMOUNTED
```

Failure stage 为 `artifact`、`wujie-bootstrap`、`handshake`、`render` 或 `bridge`。

### BridgeSession

```text
ACTIVE → DISPOSED
```

Unmount 或严重协议违规时，先标记 Session `DISPOSED`，中止 Pending Requests，调用所有 Subscription disposer，再销毁 Wujie 和 MessagePort。

## 7. Bridge Dispatcher

```text
MessagePort
  → resolve bound Session
  → Session ACTIVE
  → message size
  → requestId dedup
  → envelope parse
  → capability declared
  → Bridge Contract / Action
  → request schema
  → permission
  → concurrency / rate / subscription limits
  → timeout + AbortSignal
  → Provider invoke
  → result / snapshot / event schema
  → audit + response
```

每个成功和失败出口都 Audit；原始 Request、Result 和 Event payload 不进入 Audit。

## 8. 配置变更

```text
install / enable / disable / upgrade / rollback / uninstall
  → update Installation Store
  → return { reloadRequired: true }
  → next page reload rebuilds Runtime
```

当前 Runtime 不热更新、不调用 Plugin-level `deactivate()`，也不在 Ready 后重新解析依赖。

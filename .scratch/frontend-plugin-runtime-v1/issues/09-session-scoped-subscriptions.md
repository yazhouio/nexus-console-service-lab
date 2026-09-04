# 09 — 通过 Session-scoped Subscription 推送动态 Host 状态

**What to build:** 让 Restricted Surface 通过 Host-defined Subscription Action 原子获得当前状态与后续事件流，且该订阅只能存在于所属 BridgeSession 生命周期内。

**Blocked by:** 08 — 对 Bridge 请求实施授权与资源隔离

**Status:** done

- [x] Subscription Action 复用 capability requires、Action、Schema、Permission、并发、速率和超时校验管线。
- [x] 成功响应原子返回 Host 生成的 session-local subscriptionId 与已通过 snapshotSchema 的初始 Snapshot。
- [x] `open` 在 Snapshot Response 发送前产生的 Event 被有界暂存，响应发送后按 MessagePort 顺序释放，不丢失中间变化。
- [x] `open` reject 或 Snapshot 校验失败时不暴露 subscriptionId，丢弃缓冲 Event，并清理已经取得的 disposer。
- [x] 每个 Event 在发送前通过 eventSchema、message size 和 Event rate 校验；违规事件不发送，并关闭所属 Subscription。
- [x] 重复或未知 Unsubscribe 幂等成功，只能处理当前 Session 拥有的 Subscription。
- [x] Unsubscribe 成功响应后不再投递新 Event；后续 emit 被丢弃。
- [x] Session dispose 会继续清理全部 Subscription，即使单个 disposer 失败也不阻塞其余清理，且每个 disposer 至多执行一次。
- [x] Subscription 不引入全局 Topic、通用 EventBus 或 Plugin-defined Service Registration。

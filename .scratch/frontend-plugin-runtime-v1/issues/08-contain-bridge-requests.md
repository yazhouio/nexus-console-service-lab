# 08 — 对 Bridge 请求实施授权与资源隔离

**What to build:** 为 Unary Bridge 调用补齐资源上限、取消与失败隔离，使错误或高频 Restricted Surface 只能影响自己的请求或 BridgeSession，并让每个成功与失败出口都可审计。

**Blocked by:** 07 — 让 Restricted Surface 调用 Unary Capability Action

**Status:** done

- [x] 每个 BridgeSession 独立执行 message size、requestId 去重、并发和请求速率限制，并返回对应稳定错误码。
- [x] 超时返回 `TIMEOUT` 并触发 Provider 收到的 AbortSignal；Unmount 或 Session failure 会中止全部 Pending Requests。
- [x] requestId 去重不跨 Session 共享，重复 ID 在调用 Provider 前被拒绝。
- [x] 单次 Unknown Action、Invalid Payload、Permission Denied、Rate Limit 等错误默认只拒绝当前 Request。
- [x] 持续严重协议违规会先将当前 Session 标为 DISPOSED，再把对应 Surface Instance 标为 FAILED；Plugin 仍保持 ACTIVE。
- [x] Session dispose 后的请求返回 `BRIDGE_SESSION_INACTIVE`，且不会重新创建或切换 Session identity。
- [x] 每个成功和失败出口都记录 plugin/surface/instance/mountPoint/capability/action/result/duration/timestamp，不记录原始 payload。
- [x] 一个 Session 的限制、失败或销毁不影响同一 Plugin 的其他 Surface Instance。
- [x] 浏览器集成用例证明 Bridge Permission 不是网络安全边界，绕过 Bridge 的同源请求仍由 Backend Authorization 拒绝无权访问。

# 07 — 让 Restricted Surface 调用 Unary Capability Action

**What to build:** 让已完成 Handshake 的 Restricted Surface 通过其专用 MessagePort 调用一个 Host 定义的 Unary Capability Action，在不暴露 Host Runtime Object 的情况下获得经过授权和 Schema 校验的结构化结果。

**Blocked by:** 06 — 首次访问时按需挂载 Restricted Route

**Status:** ready-for-agent

- [ ] Dispatcher 只通过 MessagePort 解析 Host-bound ACTIVE BridgeSession，不接受消息中的 pluginId、Permission、nonce 或 protocolVersion 作为身份输入。
- [ ] Bridge envelope 使用 closed schema，包含未知身份或协议字段的请求返回 `INVALID_REQUEST`。
- [ ] capability 必须位于 Session 绑定的 Manifest requires 中，否则返回 `UNDECLARED_CAPABILITY_REQUIRE`。
- [ ] Capability 必须存在 Bridge Contract、已知 Action 和 ACTIVE Provider，分别返回稳定且可归因的错误。
- [ ] Request payload 在调用 Provider 前通过 requestSchema，失败返回 `INVALID_REQUEST`。
- [ ] 每次调用都检查 Action requiredPermissions 是 Session grantedPermissions 的子集，失败返回 `PERMISSION_DENIED`。
- [ ] Provider 只通过 Host 定义的 Action Contract 调用，并获得含 Surface Instance 和 AbortSignal 的 invocation context。
- [ ] Result 通过 resultSchema 后才发送；Host 返回不合约数据时返回 `INVALID_RESULT` 并记录 Host-side contract error。
- [ ] Plugin 只能看到 JsonValue 响应，不获得 Capability Value、Host Object 或 Raw API Client。

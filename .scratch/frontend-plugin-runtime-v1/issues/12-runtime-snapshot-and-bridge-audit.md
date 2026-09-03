# 12 — 输出完整 Runtime Snapshot 与 Bridge Audit

**What to build:** 提供一个低成本、无敏感信息的 Runtime Facts 投影，使运维人员可以解释 Runtime 是否 Ready、每个 Plugin 为什么 ACTIVE/SKIPPED/FAILED，以及当前 Surface、BridgeSession、Subscription 和 Bridge 调用发生了什么。

**Blocked by:** 09 — 通过 Session-scoped Subscription 推送动态 Host 状态；10 — 在 Route 与 UI Extension 中独立挂载同一 Surface；11 — 通过 Reload 应用安装、禁用、升级与回滚

**Status:** ready-for-agent

- [ ] Snapshot 包含 Runtime Ready 或 Bootstrap Error、Plugin 终态、依赖、Core Closure、Capability ownership 和 Contribution ownership。
- [ ] Builtin 的 execution/security/core 展示字段由来源与 Core Closure 派生；Restricted 固定投影为 wujie、cooperative-isolation、非 Core，且这些字段不写回 Manifest 或 Config。
- [ ] Restricted Plugin 记录同时显示 requested/granted permissions、Surface Definitions 与当前活动实例。
- [ ] 未挂载 Surface 通过空实例集合投影为 UNMOUNTED，不创建空 Wujie Instance，也不改变 Plugin ACTIVE。
- [ ] 每个活动实例显示 surfaceInstanceId、mountPointId、MOUNTING/MOUNTED/FAILED、BridgeSession 状态和 subscription count。
- [ ] Surface failure 不被误投影成 Plugin FAILED；一个 Plugin 的多个实例与 Session 分别呈现。
- [ ] 内部 `error: unknown` 被转换为稳定 error code 和经过清理的 message，默认不泄露 stack、Token、Capability Result 或 Host Internal Object。
- [ ] Bridge Audit 覆盖 Request、Subscription 和 Unsubscribe 的成功与失败，并在已分配时包含 subscriptionId。
- [ ] Audit 不保存原始请求、结果或 Event payload，并可以按 pluginId、surfaceInstanceId 和 mountPointId 关联 Runtime Snapshot。
- [ ] 同一 Runtime 的重复 inspect 返回稳定、不可变的事实视图，不暴露 Registry 或 Session 的内部可变对象。

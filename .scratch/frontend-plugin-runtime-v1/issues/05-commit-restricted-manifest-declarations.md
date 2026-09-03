# 05 — Manifest-first 接纳 Restricted Plugin

**What to build:** 在 Bootstrap 中把合法 Restricted 安装记录与当前 Host Catalog、Plugin Set 和 Bridge Contracts 联合验证，并原子发布 Surface Definitions、规范化 Contributions 与 Plugin ACTIVE 事实，全程不执行 Restricted Plugin Code。

**Blocked by:** 03 — 让 Non-core Builtin 以 fail-soft 发布 UI Contribution；04 — 在安装期验证 Restricted Plugin 而不执行代码

**Status:** done

- [x] HostApiId Major 必须被当前 Host 支持，Manifest 的每个 required Capability 都有已解析的 ACTIVE Builtin Provider。
- [x] 每个 Restricted required Capability 都必须拥有 Host 定义的 BridgeCapabilityContract，否则在 Manifest 阶段返回 `CAPABILITY_NOT_BRIDGE_EXPOSED` 并包含 capability。
- [x] Requested Permissions 只能来自 Manifest 所需 Bridge Contracts 已知的 Permission 集合。
- [x] 全局 Contribution ID 冲突和 Route/Navigation 跨 Plugin 引用基于最终 eligible 的全量集合校验，不受 Restricted commit 顺序影响。
- [x] Restricted Route 与 Extension 被规范化为显式 sandbox-surface target，Restricted 数据不能携带 Host-local render value。
- [x] Surface Definitions、全部 Contributions 与 ACTIVE 状态按 Plugin 原子提交；任一失败都丢弃整组记录并将 Plugin 标为 SKIPPED。
- [x] Manifest 或依赖阶段已 SKIPPED 的 Plugin 不发布任何 Surface 或 Contribution。
- [x] Restricted ACTIVE 只表示声明已被接受；其 `entry` 未加载，Surface Snapshot 显示无活动实例。
- [x] Restricted Contribution 不会通过 RPC 动态注册，也不会产生新的 Capability dependency edge。

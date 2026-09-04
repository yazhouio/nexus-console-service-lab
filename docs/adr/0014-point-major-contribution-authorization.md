---
status: accepted
---

# UI 扩展授权绑定 contributor owner 到 point@major

跨 owner UI 贡献授权绑定 `contributor owner → point@major`，其中 point 由 owner 与本地 ID 标识，Major 变化必须重新授权；同 owner 仍须满足声明、类型与版本规则。该规则让扩展契约变更成为显式治理动作，不让旧 grant 隐式覆盖另一版 Context Contract；A 只能筛选已授权贡献，并依据标准化运行状态决定反馈 UI，重试和资源操作由 Host 执行。Host overlay 另行遵守 Capability 权限，首期仅允许调用方 owner 自有的已声明 Surface，不以扩展点 grant 代替 Capability 授权。

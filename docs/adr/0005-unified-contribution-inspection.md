---
status: accepted
---

# Runtime 与 Host Contribution 双轴状态统一观察

Plugin Runtime state 与 Host contribution availability 是两条独立状态轴，quarantine 不转译为 Runtime `SKIPPED`，但 inspection API/UI 必须从插件直接下钻到其 Route/Navigation contribution 状态与 diagnostic code。Contribution 解析、URL resolution 与 Surface 生命周期分别采用分层封闭模型，统一观察面通过 owner 与 contribution identity 关联这些事实，而不将 startup、parent failure、URL conflict 和 Surface error 混成一个大枚举。这样既保留 Runtime 原有语义，也能在同一插件视图解释 `ACTIVE` 下的 `QUARANTINED / ROUTE_CONFLICT` 与 `UNREACHABLE / PARENT_QUARANTINED`。

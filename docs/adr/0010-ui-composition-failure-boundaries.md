---
status: accepted
---

# UI 组合按 Manifest、relation 与 runtime 分层隔离失败

Manifest 错误按插件拒绝，合法声明之间的 relation 错误按 contribution 隔离，runtime 错误按 session / occurrence 隔离；单项贡献无法接入不应使所属插件的其他合法贡献失效。该决策明确改变原型 UI Extension 跨插件冲突会整组跳过 Restricted 插件的行为，并将 UI 组合纳入与 Route / Navigation 一致的分层治理，而非把声明接纳、关联可用性与执行成功混成一个状态。各类重复定义、Context 错误及父子运行关系的具体归属仍按[设计文档](../../apps/docs/docs/maintainers/cross-plugin-ui-composition-design.md)继续收敛。

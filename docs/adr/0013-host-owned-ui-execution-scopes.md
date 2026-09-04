---
status: accepted
---

# Host 内部执行域统一管理 UI 资源寿命

Execution Scope 由 Host 内部创建、维护和销毁，表达一次逻辑 UI 执行；统一遵守 Attempt 拥有呈现资源、Scope 拥有逻辑资源，插件不直接创建或销毁 scope。Session 失败可以结束当前 Attempt 而保留有效 scope 及其直接拥有的 overlay，但该 Attempt 内的 Slot 及其贡献执行子树必须撤销；贡献被移出或 contextKey 切换则结束对应 scope，资源终止固定遵守 `invalidate → reject new operations → cleanup`，防止异步清理期间旧执行重新产生资源。Builtin 与 Restricted 共用同一套语义，仅 adapter 不同；Owner Execution Scope 表示资源的归属角色，更长寿命的资源归属只能由 Host 明确授予，避免把通信会话寿命误当成所有 UI 资源的寿命。

整体审阅明确 Host 管理 Scope tree：Contribution Scope 是 occurrence 内一次贡献逻辑执行的子 Scope，同时受父 Attempt / occurrence 生命周期约束；Owner Execution Scope 始终指资源实际归属的具体 Scope，Attempt 是呈现资源拥有者而非另一类逻辑 Scope。key A → B → A 建立新 Scope A₂，retry 则在同一有效 Scope 中以 Host 接受时的最新合法 Context 建立新 Attempt。

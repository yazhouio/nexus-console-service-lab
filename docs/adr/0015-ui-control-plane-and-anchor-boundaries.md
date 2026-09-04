---
status: accepted
---

# UI 控制语义独立于 RPC，物理挂载不承载身份与授权

UI Control Plane 与 Capability RPC 语义隔离，但可复用同一 Session / MessagePort，Builtin 通过本地 adapter 进入同一控制核心，使 transport 和隔离适配方式不会产生两套组合语义。组合定位遵守 `Declaration → Occurrence → DOM Anchor` 三层：Anchor 仅在当前 Presentation Root 内解析，只负责物理挂载，不构成身份或授权依据，避免 DOM 嵌套或标记被误当成跨 owner 权限。具体 dispatcher、限流、resize 合并策略及 DOM 标记形式留到实施时决定。

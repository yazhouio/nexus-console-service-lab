---
status: accepted
---

# Surface 遵守 Slot 布局边界，跨区域 UI 由 Host Capability 执行

A owns outer layout，B owns inner UI；首期 Surface 同时支持 content-sized 与 bounded container，A 声明 sizing policy 和 min/max constraints，实际宽高主要由真实 container 协调，resize 属于 runtime control，不进入业务 Context。Surface 遵守 Slot 分配的区域边界；Modal、Drawer 等跨区域 UI 通过 Host Capability 挂载已声明 Surface，open 只返回 handle，不等待业务结果，overlay 在 Owner Execution Scope 内产生一次性的 `completed | cancelled` 终态，同一 scope 的新 Attempt 可以继续 observe，scope 结束后 handle 永久失效。该决定延续协作隔离前提，新增的是布局和正式集成约束，不是恶意代码安全边界；具体动作与载荷仍在[设计文档](../../apps/docs/docs/cross-plugin-ui-composition-design.md)中收敛，也不使 B → A scoped events 自动进入基础协议。

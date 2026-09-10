---
status: accepted
---

# Slot Context 独立版本化，以 contextKey 划定实例连续性

Extension Point 的 Context Schema 与 `contractMajor` 独立于插件包版本，首期基础协议只传递 A → B 的结构化 Context，采用 latest-snapshot channel，允许合并尚未交付的中间 revision。A 用 `contextKey` 显式区分业务对象的连续性：同一 Slot occurrence 内相同 key 更新 Context 并保留实例，key 改变由 Host 销毁重建，不由 Host 猜测业务字段，也不因两个 occurrence 的 key 相同而共享实例。这样既避免每次数据更新都丢失 B 的临时状态，也避免业务对象切换后沿用旧实例；Context 表达当前状态，不承诺逐 revision 执行，首次连接及失败处理的具体规则见[设计文档](../../apps/docs/docs/maintainers/cross-plugin-ui-composition-design.md)。

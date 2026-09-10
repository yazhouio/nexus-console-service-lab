---
status: accepted
---

# Extension Point、Slot 与 Surface 分离，由 Host 执行跨插件组合

跨插件 UI 组合采用 A owns placement、B owns contribution、Host owns execution：A 在自己的页面内通过 `<Slot id="..."/>` 呈现 Extension Point 的运行时 occurrence，B 声明贡献，Host 通过统一 Host Contribution Policy 授权并管理执行，A 不直接创建、调用或销毁 B 的实例。Slot 与 Surface 解耦，首个验收场景是 Restricted A 页面内 Slot 展示 B 的自由业务 Surface；这一边界保留 menu、page tab、resource action 等贡献类型的扩展空间，避免把每个扩展点都固化成 Surface 容器或跨插件组件引用。Extension Point 与 Contribution Definition 静态声明且 Ready 后不新增，Slot occurrence、会话和 Wujie 实例按需创建与销毁，并保留现有协作隔离模型；这扩展了 [ADR-0004](./0004-unified-contribution-extension-policy.md) 的统一治理范围，具体契约仍在[设计讨论](../../apps/docs/docs/maintainers/cross-plugin-ui-composition-design.md)中收敛。

# 维护者文档

这里面向 Runtime 和 Console 的维护者，记录设计背景、实施细节与历史决策。开发插件请从[公开指南](../plugin-author-guide.md)开始。

## 设计与实施

- [Console Core 架构与目标](./console-core-architecture.md)
- [内部实现设计](./internal-implementation-design.md)
- [Host 路由设计](./host-routing-design.md)
- [Host 路由实施记录](./host-routing-implementation.md)
- [插件样式设计](./plugin-styling-design.md)
- [插件样式实施记录](./plugin-styling-implementation.md)
- [跨插件 UI 设计](./cross-plugin-ui-composition-design.md)
- [跨插件 UI 实施记录](./cross-plugin-ui-composition-implementation.md)

## 仓库中的决策与证据

以下为仓库路径，不属于公开用户指南：

- `docs/adr/`：按时间记录的架构决策。
- `docs/validation/`：验收、性能与架构替换实验。
- `spec/技术落地方案.md`：原 V1 规范。

原 V1 规范之后，UI 组合契约由 ADR 0007–0015 补充，Console Core 职责与参数化扩展点由 ADR 0017–0018 补充。维护时应结合对应决策的适用范围；实现与规范冲突需明确修复或记录偏差。

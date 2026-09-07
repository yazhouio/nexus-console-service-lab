# Nexus Frontend Plugin Runtime 文档

这组文档面向 Plugin Author、Host 集成开发者和 Runtime 维护者。文档按交付优先级排列；P0 是使用和集成 V1 所必需的契约，P1 用于上线运维和兼容性，P2 用于理解内部实现。

## 文档优先级

| 优先级 | 文档 | 用途 |
| --- | --- | --- |
| P0 | [Console Core 插件化设计](./console-core-architecture.md) | Q1–Q60 已确认目标：四层边界、参数化契约、治理与验收 |
| P0 | [Plugin Author Guide](./plugin-author-guide.md) | 如何编写、声明和调试 Restricted Plugin |
| P0 | [Plugin API Reference](./plugin-api-reference.md) | Runtime、Manifest、Bridge 和 Adapter 的公开 API |
| P0 | [Manifest / Contract Spec](./manifest-contract-spec.md) | Manifest、Config、Contribution、Bridge Contract 的规范 |
| P0 | [跨插件 UI 组合契约](./cross-plugin-ui-composition-contract.md) | owner-scoped 声明、Context、Scope / Attempt 与 Overlay |
| P0 | [UI 组合实现与作者 API](./cross-plugin-ui-composition-implementation.md) | SDK、Schema 子集、adapter 限制与真实浏览器验收 |
| P0 | [Lifecycle & Architecture](./lifecycle-architecture.md) | Bootstrap、依赖解析、挂载和失败边界 |
| P0 | [Capability Catalog](./capability-catalog.md) | 当前 Host 暴露的 Capability 与 Action 清单 |
| P1 | [Compatibility & Versioning](./compatibility-versioning.md) | Major、Host API、Bridge Protocol 和 Reload 规则 |
| P1 | [Sandbox Security Model](./sandbox-security-model.md) | Restricted + Wujie 的真实安全边界 |
| P1 | [Troubleshooting](./troubleshooting.md) | 常见失败、检查入口和修复方向 |
| P1 | [Example Plugins](./example-plugins.md) | Host 和 KubeEye 示例的完整走读 |
| P2 | [Internal Implementation Design](./internal-implementation-design.md) | Module 责任、原子提交和测试策略 |

## 规范来源与优先级

V1 的规范性来源是仓库中的 `spec/技术落地方案.md`。本目录是面向读者的拆分版：

跨插件 UI 容器协议是 2026-09-04 后续确认的设计，按 [首期 UI 契约](./cross-plugin-ui-composition-contract.md) 与 ADR 0007–0015 执行；它取代早期 UI Extension 的全局 slot string、局部唯一性和直接挂载假设，其他既有 V1 约束继续有效。

Console Core 插件化是 2026-09-07 后续确认的目标设计，按 [Console Core 插件化设计](./console-core-architecture.md) 与 ADR 0017–0018 执行；其中明确变更的职责、导航和扩展契约优先于早期方案。新增能力尚待实施，现有 API 文档仍反映当前实现。

1. 除上述后续决策明确变更的范围外，如果本目录与 V1 规范冲突，以 V1 规范为准。
2. 如果实现与规范冲突，应修复实现或明确记录偏差，不通过文档默默改变 Contract。
3. `README.md` 描述仓库运行方式和当前 Fixture；它不是替代 V1 规范的架构决策记录。

## 当前状态

V1 tickets 01–12 已完成，最近一次 Standards / Spec Review 没有遗留问题；验证记录保存在仓库的 `.scratch/frontend-plugin-runtime-v1/review.md`。

当前仓库的示例 Host 使用：

- Host：`http://localhost:3000`
- Restricted Plugin dev server：`http://localhost:3001`
- 测试授权服务：`http://localhost:3002`
- Host API：`kubesphere.console@1`
- Bridge Capability：`kubesphere.cluster@2`

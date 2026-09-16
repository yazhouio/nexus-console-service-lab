# 文档地图

文档沿三条路径组织：框架本身、构建业务插件系统、为该系统开发插件。

| 读者任务 | 阅读顺序 |
| --- | --- |
| 理解通用框架 | [三层边界](./framework-overview.md) → [生命周期](./lifecycle-architecture.md) → [API 参考](./plugin-api-reference.md) |
| 从零构建自己的业务插件系统 | [搭建指南](./build-plugin-system.md) → [宿主集成](./host-integration.md) → [Console 参考实现](./example-plugins.md) |
| 遵循目标系统的协议开发插件 | [插件开发](./plugin-author-guide.md) → [示例地图](./example-plugins.md) → [Deployment 完整案例](./deployment-example.md) |

协议参考：[Manifest](./manifest-contract-spec.md)、[UI 组合契约](./cross-plugin-ui-composition-contract.md)、[Console 生成契约](./generated/plugin-contract/index.md)、[能力清单](./capability-catalog.md)。其中 Console/Cluster 的具体 ID 和业务 schema 属于参考系统。

运行与维护：[兼容性](./compatibility-versioning.md)、[安全边界](./sandbox-security-model.md)、[故障排查](./troubleshooting.md)。

内部架构、设计决策和实施记录集中在[维护者文档](./maintainers/index.md)，不作为入门前置条件。

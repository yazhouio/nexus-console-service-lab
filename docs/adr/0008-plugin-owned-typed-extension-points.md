---
status: accepted
---

# Extension Point 归属插件，以明确类型约束贡献

Extension Point 归属插件，以 `ownerPluginId + localId` 寻址，每个点接受一种 Host 定义的 Extension Kind，Contribution 必须与其类型匹配；首期实现 Surface 类型，业务 Card、Panel、Chart 仍由贡献者自由实现。选择插件级定义而非 Surface 级定义，使 owner 的不同页面或 Surface 可以呈现同一扩展点的独立 Slot occurrence；首期仅允许 owner 放置自己的扩展点，其他 owner 不能仅凭引用建立放置权。共享的是类型化的声明、寻址与授权模型，各 kind 保留自己的载荷与呈现契约，避免把未来 menu、page tab、resource action 都绑定到 Surface 执行方式；多 occurrence 与多项贡献的运行语义继续在[设计文档](../../apps/docs/docs/maintainers/cross-plugin-ui-composition-design.md)中收敛。

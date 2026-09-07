---
status: accepted
---

# 分离 Console 组装、Host 适配、Runtime 机制与 Core 业务

完整设计、迁移范围和验收要求见 [Console Core 插件化设计](../../apps/docs/docs/console-core-architecture.md)。

Console Distribution 负责选择并固定插件版本、声明 Core Closure、提供静态 policy bundle 与 grants；Host 只负责启动、browser/history adapter 和不依赖插件系统的 break-glass UI；Plugin Runtime 负责插件解析与生命周期、Route Model、Contribution Policy、Extension Kind 和 UI 执行机制；Required System Plugin `console-core` 负责 Global Layout、Navigation、Home、Settings 与 Console 业务 Point Profile。四层必须落实为单向物理依赖，Builtin 与 Restricted Plugin 共享公开的声明、组合、治理和生命周期语义，但保留本地与隔离执行 Adapter；这取代 ADR-0001 中 Host 内置 Overview、Host 拥有 Route Model 以及 V1 不向 Restricted Plugin 提供主动 Console 导航的决定。

## Consequences

Distribution 显式提供 `rootPresentation: { ownerPluginId, surfaceId }`，Runtime 校验 Owner、Core Closure 成员身份和 Surface 声明，Host 通过公开执行入口挂载。缺失或执行失败进入独立 break-glass 路径，使 Host 无需认识具体业务插件。

`console-shell` 在设计阶段一次性更名为 `console-core`，不保留双 ID；Runtime Ready 仅表示 Core Closure 的本地声明与协议可用，Console 根呈现失败不会反转 Ready，而由 Host 切换至 break-glass UI。获 Distribution grant 的 Restricted Plugin 可以通过版本化 `routes.navigate` Capability 使用 Route ID 与校验参数导航，但不能访问原始 path、history 或任意外部 URL。

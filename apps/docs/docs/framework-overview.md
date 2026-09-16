# 通用框架、业务插件系统与插件

本项目由三部分组成：提供机制的通用框架、用机制定义业务协议的插件系统，以及遵循协议的插件。Console 是可运行的参考实现，不是所有宿主必须采用的产品模型。

## 1. 通用框架

| 包 | 职责 |
| --- | --- |
| `@nexus/plugin-runtime` | 插件声明、依赖解析、路由与贡献接纳、能力调用、Surface/Action 生命周期，以及 Wujie Bridge |
| `@nexus/browser-host` | 浏览器启动、历史路由、根呈现、恢复入口，以及 Distribution 组装接口 |
| `@nexus/plugin-build` | 构建时的 CSS artifact 处理与闭包校验；不进入浏览器运行时代码 |

框架定义如何声明 Point、Profile、Capability 和插件，不规定产品必须有集群、Tenant、服务目录或某种侧边栏。其公共接口通过版本演进；发布边界不意味着实现被冻结。npm 包承载 SDK 和构建工具，插件浏览器制品仍需由宿主可访问的地址交付。

## 2. 业务插件系统

平台开发者选择并发布自己的业务契约，编写根呈现插件，再用 Distribution 组装执行环境。

| Console 参考内容 | 展示的职责 |
| --- | --- |
| `packages/console-core-api` | Console 的 Point、Profile、PluginRef 与贡献构造器 |
| `packages/console-core` | 根布局、导航、首页、设置及插件管理 |
| `packages/cluster-api` | 容器领域 Capability、资源引用和扩展点 |
| `packages/design-tokens` | Console 共享视觉约定 |
| `apps/console` | 插件选择、契约注册、授权、样式关联、安装存储与启动 |

这些包是参考实现的一部分。新产品可以借鉴或复制，并维护自己的 API 包、主题和平台壳；使用通用框架不要求导入 Console 或 Cluster API。产品 API 包也可以发布到 npm，供独立插件仓库依赖。

从零搭建请阅读[构建业务插件系统](./build-plugin-system.md)，具体启动接口见[宿主集成](./host-integration.md)。

## 3. 插件实现

插件同时遵循框架协议和目标系统的业务契约。例如 `point` 的结构来自框架，而 `console-core/home.cards@1` 是 Console 发布的具体扩展位置。

可信 Builtin 与 Restricted + Wujie 是两种执行路径。可信插件可以随宿主构建，也可以像独立 Builtin 示例一样独立构建，由 Distribution 明确选择和加载；独立构建不会自动取得可信身份。Restricted 按 Manifest 接入并通过受控 Bridge 使用宿主能力。

一个完整服务工作台可以由任一种插件承载。是否允许其他插件插入 UI 取决于它开放的 Point，而非执行方式。框架不要求新增 Service 运行时；服务目录、业务身份与后端权限属于产品决策。

按[示例地图](./example-plugins.md)选择代码，再阅读[插件开发指南](./plugin-author-guide.md)。

## 两类协议与授权

- 框架协议：Manifest、PluginDefinition、Surface、Action、Point、Bridge 和生命周期。
- 业务契约：具体 Point/Profile、资源引用、平台上下文、能力与设计 Token。

Point grant 控制插件能向哪里贡献，Capability grant 控制插件能调用什么宿主能力；二者都不代替后端对用户和业务资源的鉴权。业务上下文也不等于授权凭证。详见[安全边界](./sandbox-security-model.md)。

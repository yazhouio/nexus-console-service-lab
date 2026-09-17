# 从零构建业务插件系统

本文面向平台开发者：使用三个框架包，定义适配自己业务的插件系统。Console 提供可走读、可运行的参考，下面的步骤不要求新产品沿用其名称或领域模型。

## 1. 划定产品与包边界

建议先在一个仓库中维护以下结构，等发布边界稳定后再拆独立插件仓库：

```text
apps/host                # 组装和启动
packages/platform-api    # 供插件引用的业务协议
packages/platform-core   # 可信根呈现插件
packages/design-tokens   # 产品视觉约定（按需）
plugins/example-feature  # 第一个业务插件
```

Host 依赖 `@feforgejs/browser-host` 和 `@feforgejs/plugin-runtime`；API 与插件使用 Runtime 的公开导出；采用 artifact CSS 工具链时加入 `@feforgejs/plugin-build`。后者目前面向 Rsbuild/Rspack，不能作为任意构建器的通用适配器。

跨仓库接入时使用已发布版本或本地打包的 tarball，替换本仓库的 `workspace:` / `catalog:` 依赖。不要把尚未发布的包当作已可从公共 npm 安装。

## 2. 先发布自己的 API 契约

参考 `packages/console-core-api/src/index.ts`，在自己的 API 包中定义：

1. 稳定的根插件 ID，以及根 Route/Navigation Point ref。
2. 对应 ExtensionPointDefinition 和 PointProfile；只开放产品需要的扩展位置。
3. 需要跨边界传递的 ResourceRef schema，以及消费契约的辅助构造器。
4. 平台能力 ID 和版本约定；面向 Restricted 的调用还需要 Host Bridge Contract。

不要复制 Cluster ResourceRef 作为所有业务的统一资源模型。它要求 `clusterId/apiVersion/kind/name`，适合容器领域。Tenant、Region 等上下文需要产品自己定义；当前参考只提供 Cluster 示例，没有实现完整租户模型。

公开 API 包只提供契约，插件不导入平台壳实现。Profile 与 RefContract 要由 Distribution 注册。Point 最终 Context schema 的变化需要遵循 [major 版本规则](./compatibility-versioning.md)。

## 3. 编写根呈现插件

参考 `packages/console-core/src/plugin.ts` 和 `ConsoleLayout.tsx`：

- 在 `activate` 中声明根 Surface、扩展点、初始路由和导航。
- 根布局通过 Runtime React API 的 `RouteOutlet` 渲染当前页面。
- 导航通过公开的路由查询与导航能力工作，不访问 BrowserHost 私有状态。
- 业务请求放在页面执行阶段；不要在声明注册期间等待业务数据。

平台可以采用“TopBar + 服务整页”，也可以使用侧边导航。现有 Console 固定侧边栏是参考布局，不是框架要求。完整服务页面可以不开放内部 Point；需要扩展的资源页再声明自己的 Action、Tab 或 Surface Point。

## 4. 用 Distribution 组装

参考 `apps/console/src/distribution.ts`，逐项替换为自己的定义：

| 配置 | 需要决定什么 |
| --- | --- |
| `builtins` / `prepareBuiltins` | 选择哪些可信插件，如何准备独立构建的可信制品 |
| `coreRootIds` / `rootPresentation` | 必须存在的根插件和根 Surface |
| `rootRoutePoint` / `navigationRootPoints` | 系统的页面、导航入口 |
| `profiles` / `refContracts` | 插件贡献使用的业务契约 |
| `supportedHostApis` / `bridgeContracts` | Restricted 插件可消费的宿主接口 |
| `policyBundle` | contributor 到具体 Point major 的授权 |
| `capabilityGrants` | 可信插件使用宿主能力的授权 |
| `catalog` / `createStore` | Restricted 可安装记录与配置存储；记录包含 grantedPermissions |
| `builtinCss` / `recovery` | UI 样式制品与启动失败后的恢复路径 |

授权使用自己的 owner/point ID，不要保留 Console 示例 grant。安装存储是前端插件配置，不能直接替代平台后端的服务目录与权限数据。

参考 `apps/console/src/main.tsx` 启动：

```tsx
import { createRoot } from 'react-dom/client';
import { BrowserHost } from '@feforgejs/browser-host';
import { distribution } from './distribution';

const root = document.getElementById('root');
if (!root) throw new Error('Host root element is missing.');
createRoot(root).render(<BrowserHost distribution={distribution} />);
```

这段入口依赖上一步完成的 Distribution；HTML 容器、构建配置和产品主题也由宿主提供。

## 5. 接入第一个插件

先用一个只贡献独立页面和导航的插件验证公开契约，不必一开始就开放页面内部扩展。

- 可信路径：参考 `apps/console/src/plugins/extension-demo.tsx` 的注册方式；独立构建参考 `apps/example-builtin-plugin`。
- Wujie 路径：参考 `apps/example-restricted-plugin`，替换它依赖的 Console/Cluster ID、权限和 Manifest，保留声明、连接、挂载与清理方式。

插件只依赖自己的业务契约包和框架公开 API。插件访问自有后端时，服务端仍独立校验用户权限；不要求所有业务请求都绕经 Host Action。

## 6. 验证并交付协议

验证首页与深链接、导航、合法贡献、无 grant 的拒绝、页面卸载和失败恢复；使用 Wujie 时再验证 Bridge schema、权限拒绝与订阅清理。用脱离 workspace 的构建验证独立包边界。

给插件作者交付：API 包版本、Host API/Bridge Contract、可用 Point 和 Profile、授权申请方式、制品地址要求、样式约定及可运行示例。当前仓库的[生成契约](./generated/plugin-contract/index.md)属于 Console 参考系统，不能直接当作新产品的协议。

当前 Runtime 的插件集合与贡献目录在一次启动中固定，安装配置变化需要 reload。Tenant 切换后的业务数据和权限更新需要产品实现，不应通过改写静态 Point grant 代替用户权限判断。

接下来进入[插件开发指南](./plugin-author-guide.md)，从平台开发者切换到插件作者视角。

# 示例地图

示例按三层阅读，Console/Cluster 的业务命名可由自己的系统替换。

| 层次 | 从哪里读 | 学习目标 |
| --- | --- | --- |
| 通用框架 | `packages/plugin-runtime`、`packages/browser-host`、`packages/plugin-build` | 理解公开机制和执行边界 |
| 业务插件系统 | `packages/console-core-api` → `packages/console-core` → `apps/console/src/distribution.ts` → `main.tsx` | 定义协议、实现平台壳并组装系统；视觉约定见 `packages/design-tokens` |
| 领域契约 | `packages/cluster-api` | 为业务资源定义引用、能力和扩展点 |
| 可信插件 | `apps/console/src/plugins/extension-demo.tsx`、`apps/example-builtin-plugin` | 消费协议；分别观察宿主内组装和独立构建 |
| Wujie 插件 | `apps/example-restricted-plugin` | Manifest、Surface、Bridge 与生命周期 |
| 跨插件组合 | Deployment 案例；`apps/ui-composition-fixtures` 为验收 fixture | 观察页面 owner 与扩展贡献方协作 |

搭建新系统从[搭建指南](./build-plugin-system.md)开始。开发插件时保留注册和通信方式，替换目标系统的 Point、Capability、权限和业务 schema；不要将示例私有实现变成依赖。

第一次使用建议先运行 [Deployment 完整案例](./deployment-example.md)，了解列表、详情、卡片、操作和 Tab 如何组合。

## 示例组成

| 路径 | 作用 |
| --- | --- |
| `apps/console/src/distribution.ts` | Console 发行版：固定插件、Core roots、契约、grants 与恢复 |
| `packages/browser-host/src/App.tsx` | 通用 Browser Host 启动、Router adapter 和 break-glass |
| `packages/console-core/src/plugin.ts` | Console Core：根布局、导航、Home、Settings 和 PluginRef Action Point |
| `packages/console-core-api/src/index.ts` | Console Point、Profile、PluginRef 和贡献构造器 |
| `packages/cluster-api/src/index.ts` | Cluster Capability、ResourceRef 和节点 Point |
| `apps/console/src/plugins/cluster.tsx` | Feature/Provider Builtin：Cluster 卡片、节点 Layout、Action/Tab Placement |
| `apps/console/src/plugins/extension-demo.tsx` | Builtin Demo：只消费 Host 固定 Point，展示 Route、Navigation、Surface、Action、Tab 注册 |
| `apps/console/src/plugins/kubeeye-installation.ts` | Restricted Manifest、Config 和 Cluster Bridge Contract |
| `apps/example-restricted-plugin/src/App.tsx` | KubeEye Surface：读取、订阅和按 Route ID 导航 |
| `apps/ui-composition-fixtures/src/ui-action.tsx` | 无 Surface 的 Restricted Action 入口，仅在验收构建使用 |

## Console Core

`console-core` 是 Distribution 明确保证存在的 Core root，依赖七个 Platform Capability。activate 只注册声明、Action handler 与本地 Capability，不等待页面业务数据。它拥有 `root` Surface，经受管理的 Router 树内 adapter 挂载；Layout 使用 `RouteOutlet`，正常态插件管理通过 `plugins.query/manage`。

它发布 `routes`、`primary-navigation`、`home.cards`、`settings.sections`、`plugin-details.actions`。后者绑定通用 `detail.actions@1` Profile 与 `console-core.plugin-ref@1`；“Check plugin status”通过授权的 `plugins.query` 执行。Core 不导入 Cluster 实现或 Host 私有 Context。

## Cluster Builtin

Cluster 同时承担 Provider 与 Feature 角色，提供 `kubesphere.cluster@2`。它通过 Console API 构造器贡献 `/clusters/current` Route、导航和首页卡片，并拥有节点子 Route/Navigation、`node.actions` 和 `node.tabs` Point。

节点操作 Point 使用同一个 `detail.actions@1` Profile，绑定 `cluster.resource-ref@1`。节点 Tab 初始不挂载，选择后复用 Surface 执行；切走卸载，重新选择产生新 Scope。Builtin Node Layout 的状态在子路由切换后保留。

## Extension Demo Builtin

`extension-demo` 是用于走读规范的 Host-side feature。Host 通过 Console Core 和 Cluster API 发布固定的 V1 Point 集合：`route`、`navigation`、`surface`、`action`、`tab`。Demo 不声明或注册新的 Extension Point，也不改变 Kind；它只使用公开 Point ref 和构造器注册六个贡献：`/extensions` 页面、侧边栏导航、Overview 卡片、Settings Section、Node Action 和 Node Tab。

打开侧边栏的 **Extension points** 可以看到 Host 合同目录及每条 Contribution 的归属。这个页面中的“固定 Point”不是运行时自由注入的容器：Point owner 决定 Context/Profile，Host policy 决定跨 owner 接纳，插件只提交符合规范的声明。

## KubeEye Restricted

KubeEye 声明 Cluster read 与 Route query/navigate 依赖及权限，始终 manifest-first。Runtime 标记 ACTIVE 仅表示声明接纳，Wujie 制品仍在 Surface 挂载时加载。首页卡片与 Route 可以同时执行同一个 Surface Definition，它们持有独立 Attempt 和 BridgeSession。

“Read current cluster”执行 unary 请求；“Watch current cluster”打开带快照的订阅；“Open example node”只提交 `node-detail` Route ID 和 `{ cluster, node }`，URL 由 Runtime/Host 解析并留审计。

## Action-only 与 Tab 验收插件

测试构建安装 `ui-action`，Manifest 的 `surfaces` 是空数组。`connectActionHost` 接收每次调用的冻结 Context、invocationId 和授权 client，执行普通或可取消的延迟检查。终态结束后卸载 Wujie 并关闭 Bridge。

`ui-c` 为节点贡献 Tab Surface。`e2e/action-tab.spec.ts` 验证惰性挂载、键盘选择、切走卸载、重入新建、Action 成功/取消、Builtin PluginRef Action 和 Restricted 导航。`e2e/console-core.spec.ts` 验证父 Layout 连续性和根呈现失败后的独立恢复路径。

## 运行与验证

```bash
pnpm install
pnpm dev:plugin
pnpm dev:host
```

在两个终端启动插件与 Console，再打开 `http://localhost:3000`。测试 fixtures 由 `NEXUS_TEST_FIXTURES=true` 显式启用，正常构建不开放测试页面或 Action owner。

```bash
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build:routing-validation
pnpm test:e2e:preview
```

cooperative isolation 的安全边界保持不变：同源 Wujie 不能被当作敌对代码沙箱。Builtin/来源标签不产生隐式权限；Point grant 和 Capability permission 是两套独立检查。

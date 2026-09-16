# 宿主集成指南

本文是业务插件系统的组装参考。先阅读[从零构建业务插件系统](./build-plugin-system.md)，再用 `apps/console/src/distribution.ts` 核对具体配置。Console Core 是本仓库的根呈现参考实现，可替换为自己的平台插件。

## 最小集成路径

1. 注册自己的根呈现插件（参考实现为 Console Core），并设置该系统的根路由和导航扩展点。
2. 将业务插件加入 `builtins`；外部 Restricted 插件通过安装配置接入。
3. 注册插件使用的 `profiles` 和 `refContracts`。
4. 在 `policyBundle` 中为跨插件贡献授予目标扩展点权限；能力调用另由 `capabilityGrants` 管理。
5. 通过 `BrowserHost` 启动，检查页面、导航和贡献是否被接纳。

## 用 Deployment 案例理解职责

`deployment` 插件注册列表与详情路由、侧边导航和三个扩展点。HPA、VPA、监控、网络插件各自注册贡献。Distribution 注册相应授权，页面无需导入这些插件的组件。

案例增加了 `deployment.cards@1` 内容区域 Profile，并绑定 `cluster.resource-ref@1`。Tab 和操作分别复用 `detail.tabs@1`、`detail.actions@1`。详见[完整案例](./deployment-example.md)。

示例中的共享 mock 数据模块只负责模拟后端数据。接入真实服务时，应替换数据访问层，并由服务端完成鉴权。

## 配置生效与故障排查

插件集合在一次 Runtime 中保持不变。安装配置变更需要重新加载；Builtin 插件集合的修改需要更新 Distribution 并重新构建。此案例中的四个扩展插件是 Builtin，不提供运行中安装开关。

接纳失败先检查扩展点 owner、id、major 与授权，再检查 Profile、RefContract 和 Context。渲染失败查看对应扩展的重试入口。参考[故障排查](./troubleshooting.md)和[安全模型](./sandbox-security-model.md)。

# Deployment：完整的插件案例

这个案例展示如何把资源管理页面拆成可组合的插件：侧边菜单 → Deployment 列表 → 资源详情 → HPA/VPA 卡片与操作 → 监控和网络 Tab。

## 运行与体验

在仓库根目录运行：

```bash
pnpm install
pnpm dev:host
```

打开 `http://localhost:3000/deployments`。此案例不需要 Kubernetes 集群，也不需要启动 Restricted 插件开发服务器。

1. 在列表中筛选 `production` 命名空间，搜索 `checkout`，点击资源名称。
2. 查看就绪副本、CPU 和内存概览。监控 Tab 默认显示模拟趋势。
3. 将 HPA 的副本范围改为 4–10，保存后查看配置反馈和最近事件。
4. 点击「应用 VPA 建议」，观察资源请求变为 500m CPU / 768 MiB，以及新事件。
5. 切换「网络」，查看与当前资源对应的 Service 和端点信息。
6. 刷新：网络 Tab 由 URL 中的 `view=network` 恢复，mock 配置恢复初始值。
7. 返回列表打开 `payments`，观察不同的监控数据、Service 和未启用的 HPA。

所有数据均为 **mock**。配置变更只保存在当前页面会话，刷新后重置；监控是固定采样，VPA 建议是固定示例值，不执行真实伸缩或网络请求。`staging/catalog` 提供一个副本尚未全部就绪的状态。

## 扩展点与职责

| 拥有者 / 贡献者 | 职责 | 扩展点 |
| --- | --- | --- |
| `deployment` | 列表、详情、导航、基础指标与事件 | 声明下列三个扩展点 |
| `deployment-hpa` | HPA 配置卡片 | `deployment.cards@1` |
| `deployment-vpa` | VPA 建议卡片、应用建议操作 | `deployment.cards@1`、`deployment.actions@1` |
| `deployment-monitoring` | 监控 Tab | `deployment.tabs@1` |
| `deployment-network` | 网络 Tab | `deployment.tabs@1` |

表中扩展点的 owner 均为 `deployment`。页面通过 `Slot` 和 `ActionMenu` 渲染已接纳的贡献，不导入贡献者的 UI 组件。Tab 的候选项来自 Runtime，选择状态由 URL 保存，Surface 按选择挂载。

三个位置传递同一种上下文：

```json
{
  "itemRef": {
    "clusterId": "demo-cluster",
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "namespace": "production",
    "name": "checkout",
    "uid": "mock-checkout"
  }
}
```

它引用资源身份，不传递整页状态。每个插件通过共享 mock 数据适配器读取该资源；将来接真实服务时可替换适配器。

## 增加一个 Tab

Builtin 插件在 `activate` 中注册 Surface 和贡献，例如网络插件：

```tsx
contributions.registerSurface({
  id: 'network',
  target: { kind: 'builtin', render: NetworkTab },
});
contributions.registerExtension({
  id: 'network-tab',
  kind: 'tab',
  tabId: 'network',
  label: '网络',
  surfaceId: 'network',
  point: DEPLOYMENT_TABS_POINT,
  order: 20,
});
```

组件通过 `useSurfaceContext()` 获取 `itemRef`。Distribution 还需要将插件加入 `builtins`，并为贡献者授予 `deployment/deployment.tabs@1` 的 `tab` 权限。仅注册组件不会自动获得授权。

这是可信 Builtin 插件案例；外部插件应遵循[Restricted 插件开发指南](./plugin-author-guide.md)。

## 代码阅读顺序

所有路径相对仓库根目录：

1. `apps/console/src/plugins/deployment.tsx`：列表、详情和扩展容器。
2. `packages/cluster-api/src/index.ts`：Deployment 扩展点与 Profile。
3. `apps/console/src/plugins/deployment-extensions.tsx`：四个独立 PluginDefinition。
4. `apps/console/src/plugins/deployment-mock.ts`：模拟数据与更新订阅。
5. `apps/console/src/routing/contribution-policy.ts`：贡献授权。
6. `apps/console/src/distribution.ts`：插件与契约装配。
7. `e2e/deployment-example.spec.ts`：完整业务路径的浏览器验证。

四个扩展目前随 Distribution 构建。要试验去掉一个扩展，可从 `builtins` 中移除对应定义并重新构建；页面仍由同一组扩展容器组成。当前案例没有列表列扩展，也没有连接真实 HPA/VPA 控制器。

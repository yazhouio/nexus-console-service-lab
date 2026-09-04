# Example Plugins

## 1. 示例组成

| 路径 | 作用 |
| --- | --- |
| `apps/host/src/plugins/console-shell.ts` | Core Builtin，提供 Console Capability |
| `apps/host/src/plugins/cluster.tsx` | Non-core Builtin，提供 Cluster Capability 和 Host UI |
| `apps/host/src/plugins/kubeeye-installation.ts` | Restricted Manifest、Config 和 Bridge Contract |
| `apps/example-restricted-plugin/src/App.tsx` | Restricted Surface UI |
| `apps/example-restricted-plugin/src/host-bridge.ts` | Fixture-local Bridge client |
| `e2e/restricted-surface.spec.ts` | Browser lifecycle / security regression tests |

## 2. Core Builtin：Console Shell

`console-shell` 没有依赖，是 Host 的 Core Root：

```ts
export const consoleShell: PluginDefinition = {
  id: 'console-shell',
  version: '1.0.0',
  requires: [],
  provides: ['kubesphere.console-shell@1'],
  activate(context) {
    context.capabilities.register('kubesphere.console-shell@1', {
      name: 'Nexus Console',
    });
  },
};
```

它演示了 owner-bound `PluginContext` 与声明的 `provides` 必须一致。

## 3. Non-core Builtin：Cluster

`cluster` 依赖 Console Shell：

```ts
requires: ['kubesphere.console-shell@1']
provides: ['kubesphere.cluster@2']
```

它同时注册：

- `ClusterCapability`；
- `/clusters/current` Route；
- `Cluster Overview` Navigation；
- 指向 `console-shell / home.cards@1` 的 Surface Contribution。

它的 `watchCurrentCluster` 返回当前 Snapshot 和 disposer，正好符合 Subscription Contract 的 Host 侧模型。

## 4. Restricted Manifest：KubeEye

KubeEye 只消费 `kubesphere.cluster@2`，不提供 Capability：

```ts
manifest: {
  id: 'kubeeye',
  version: '1.0.0',
  entry: '/plugins/kubeeye/1.0.0/',
  hostApi: 'kubesphere.console@1',
  requires: ['kubesphere.cluster@2'],
  provides: [],
  permissions: ['cluster.read'],
  surfaces: [{ id: 'overview' }],
  contributions: { routes, navigation, extensions },
}
```

Host 先调用 `validateRestrictedInstallRecord`，再将合法记录交给 `bootstrapPluginRuntime`。因此 KubeEye 被标记 `ACTIVE` 时，代码仍可能尚未加载。

## 5. Restricted Surface：KubeEye UI

Surface 启动时：

1. 读取 Wujie 提供的 Bootstrap Descriptor。
2. 向 Host 发起 `nexus:bridge:connect`。
3. 校验 Host 返回的 Protocol、Surface Instance 和 MessagePort。
4. 使用专用 Port 调用 `getCurrentCluster` 或打开 `watchCurrentCluster`。
5. 在 React unmount 时执行 Subscription disposer。

Fixture 的两个操作对应两个 Action：

```ts
await getCurrentCluster();
await watchCurrentCluster(onValue);
```

`watchCurrentCluster` 的取消函数最终发送当前 Session 的 Unsubscribe 消息。

## 6. 运行示例

```bash
pnpm install
pnpm dev:plugin
pnpm dev:host
```

打开 `http://localhost:3000` 后：

1. Runtime 应显示 `READY`。
2. KubeEye Plugin 应显示 `ACTIVE`。
3. 首次打开 Route 或 Home Card 才会创建 Wujie 实例。
4. Route 和 Card 同时打开时应有两个独立 Surface Instance。
5. 切换 Host Cluster 时，两个订阅都会收到更新。
6. 关闭一个实例不会影响另一个实例。

## 7. 对应测试

```bash
pnpm test:e2e
```

E2E 覆盖 Lazy Mount、Unary Bridge、Subscription、Route / Extension 独立实例、Failure Isolation、Cleanup / Remount、Configuration Reload、Runtime Inspector 以及 Backend Authorization。

## 8. 最小递归验收示例

`apps/ui-composition-fixtures` 将 A 页面、B Card、C Chart 构建成三个独立入口。A/B 各自使用声明的 Slot，B/C 分别贡献自有 Surface；还包含一个走本地 adapter 的 Builtin Card。测试开关开启后访问 `/__fixtures__/ui-composition`。

`pnpm test:e2e` 自动启动所有 fixture 服务，包含递归、Context、hidden / unmount、A → B → A、Scope / Attempt 和 Overlay 浏览器验收。详细命令与边界见 [UI 组合实现](./cross-plugin-ui-composition-implementation.md)。

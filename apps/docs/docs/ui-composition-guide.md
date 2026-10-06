# 组合插件 UI

页面插件定义扩展点，贡献插件注册 Surface 或 Action，宿主负责授权和执行。完整业务示例见 [Deployment 案例](./deployment-example.md)。

## 声明资源扩展点

Builtin 页面插件在 `activate` 中注册：

```ts
contributions.registerExtensionPoint({
  id: 'deployment.tabs',
  kind: 'tab',
  contractMajor: 1,
  profile: 'detail.tabs@1',
  bindings: { itemRefContract: 'cluster.resource-ref@1' },
});
```

Profile 和 RefContract 由宿主装配；贡献者使用包含 owner、id、contractMajor 的 Point 引用。对应例子分别位于 `packages/cluster-api/src/index.ts` 和 `apps/console/src/distribution.ts`。

## 呈现和读取上下文

页面通过 `Slot` 提供 `id`、`contextKey` 和 JSON `context`。内容卡片可省略 `selected` 以展示所有可用贡献；Tab 通过 `selected: [{ ownerPluginId, id }]` 选择贡献，未选中项不挂载。

贡献组件用 `useSurfaceContext()` 读取 `{ contextKey, revision, value } | null`，应处理首次观察尚未到达的情况。资源详情传递 `{ itemRef }`，资源变化时更新 `contextKey`。

同 key 合法更新保留执行；非法更新被拒绝并保留最后合法快照。新 key 不合法时不会继续展示旧资源。取消选择、卸载或切换 key 会结束原执行，重新选入创建新执行。

`Slot` 默认显示失败与重试入口。自定义 `feedback(state, retry, error)` 时应保留错误反馈，重试只使用该 occurrence 提供的 `retryTarget`。上下文错误需要修正输入。

操作贡献注册 Action handler，页面通过 `ActionMenu` 调用。不要将动作伪装成可渲染 Surface。

## Restricted 插件入口

使用 `connectUiHost()` 建立控制连接，再用 `UiProvider` 包装入口；从 `@feforgejs/plugin-runtime/client` 和 `@feforgejs/plugin-runtime/react` 导入公开 API。内容外层添加 `data-nexus-surface-content` 供尺寸测量。该标记不提供授权。Builtin 由宿主提供 UI 上下文。

## Schema 与资源限制

Schema 为 JSON Schema 2020-12 内联对象子集。支持单个 `type`（null、boolean、string、number、integer、object、array）、`properties`、`required`、布尔 `additionalProperties`、对象 `items`、`enum`、`const`、minimum / maximum / exclusiveMinimum / exclusiveMaximum、min/maxLength、min/maxItems、min/maxProperties，以及 `$schema`、title、description。未知关键字拒绝；不支持 `$ref`、组合 Schema、pattern、format、类型数组或远程解析。

JSON 输入上限为 65,536 UTF-8 bytes、深度 32、10,000 个值节点；控制 envelope 也计入消息大小。Schema 最多 512 个 Schema 节点、深度 16。只接受 JSON 数据，拒绝循环引用和非有限数字。

同 owner / point / contractMajor 的 Schema 在保留的安装版本间按规范化 JSON 比较；修改 Schema（包括可选字段）必须升 Major。安装存储保留的 Restricted 版本可执行自动检查；Builtin 随 Host 构建提供，同样遵守冻结规则。Builtin 发布、业务 semantic 变化与被外部删除的历史制品需要发布治理，机器不能从业务代码证明 semantic 未变。

当前 Host 默认同时最多 128 个 Scope，Scope 深度小于 8，每 Attempt 最多 32 个 occurrence，每 owner Scope 最多 32 个 Overlay 记录（含终态）。这些是实现资源预算，不是递归兼容性承诺。UI Control Plane 每 Session 每秒最多 200 个请求，单独于 Capability RPC 预算；准备就绪超时为 10 秒。


## Overlay

声明 `requires: ["nexus.ui-overlay@1"]` 和 `permissions: ["ui.overlay"]`，由 Host grant 后使用：

```ts
const handle = await client.overlay.open('own-dialog', { nodeId: 'node-42' }, 'modal');
const stop = await client.overlay.observe(snapshot => renderOverlayState(snapshot), handle);
// 省略 handle 枚举本 owner Scope 的记录，供替代 Attempt 恢复。
const stopOwned = await client.overlay.observe(snapshot => restoreHandles(snapshot));
await client.overlay.cancel(handle);
stop(); stopOwned();
```

Overlay Surface 从 `useUiObservation()?.overlayInput` 读取固定 JSON input，通过 `client.overlay.complete(result)` 完成自身。完成会结束自己的呈现连接，业务结果以 owner Scope 观察到的终态为准。open 只返回 handle；呈现失败保留 pending outcome，Host 提供 retry / Close / Escape。Host 接受的第一个合法 completed / cancelled 生效，终态记录保留到 owner Scope 结束，之后 handle 永久失效。

首期只挂载调用方 owner 自有已声明 Surface，不提供持续 input 更新、B → A 任意业务事件或跨 owner Overlay。Host 使用原生 dialog 管理 modal / drawer 容器、Escape 取消与关闭后的焦点恢复。


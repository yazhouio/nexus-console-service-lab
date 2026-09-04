# 跨插件 UI 组合：实现与作者 API

实现对应 [协议契约](./cross-plugin-ui-composition-contract.md) 与 Q1–Q34 的已确认决策。A 管理 placement，B 声明 contribution，Host 管理执行。首期验证独立 Restricted A → B → C 及 Builtin contribution；不承诺递归的长期兼容性、稳定深度、性能或多层布局行为。

## 作者接入

A 的 Manifest 静态声明 point：

```json
{
  "extensionPoints": [{
    "id": "details", "kind": "surface", "contractMajor": 1,
    "contextSchema": {
      "type": "object", "properties": { "nodeId": { "type": "string" } },
      "required": ["nodeId"], "additionalProperties": false
    }
  }]
}
```

B 声明自己的 Surface 与 contribution：

```json
{
  "surfaces": [{ "id": "metrics" }],
  "contributions": { "extensions": [{
    "id": "metrics-card", "kind": "surface", "surfaceId": "metrics", "order": 10,
    "point": { "ownerPluginId": "plugin-a", "id": "details", "contractMajor": 1 }
  }] }
}
```

两段是各自 Manifest 的片段，仍需补齐 id、version、entry、requires、permissions 等字段。Host 单独授权 `plugin-b → plugin-a/details@1`。A 无权扩大授权；默认展示全部可用且已授权贡献，按 order、owner、contribution ID 排序。

Restricted 入口连接一次 Host，使用通用 SDK：

```tsx
import { createRoot } from 'react-dom/client';
import { connectUiHost } from '@nexus/plugin-runtime/client';
import { UiProvider, Slot, useSurfaceContext } from '@nexus/plugin-runtime/react';

function Page({ nodeId }: { nodeId: string }) {
  return <Slot id="details" contextKey={nodeId} context={{ nodeId }}
    sizing={{ mode: 'content-sized', minHeight: 80, maxHeight: 500 }} />;
}

// B 的独立入口可渲染该普通业务 UI。
function Metrics() {
  const context = useSurfaceContext();
  return <article>{JSON.stringify(context?.value)}</article>;
}

const client = await connectUiHost();
createRoot(document.getElementById('root')!).render(
  <UiProvider client={client}>
    <div data-nexus-surface-content><Page nodeId="node-42" /></div>
  </UiProvider>,
);
```

`data-nexus-surface-content` 是当前 adapter 的业务内容测量标记，放在呈现入口的外层。它只参与测量，不提供身份或授权。B 的入口使用同样的连接和包装，渲染自己的 `Metrics`；A 不导入 B。SDK 适配独立入口，不要求插件使用 Wujie 的 `__WUJIE_MOUNT` / `__WUJIE_UNMOUNT` 生命周期模式。

Builtin 在 `activate` 中调用 `registerExtensionPoint`、`registerSurface`、`registerExtension`。Host 将注入的 `UiClient` 交给同样的 `UiProvider`。定义在 activation staging 中原子提交，Ready 后不能再注册。

`Slot` 的 `selected` 是 `{ ownerPluginId, id }[]`，省略表示全部可用已授权贡献。`hidden` 只保留同一 mounted occurrence 内的执行；React unmount、筛选移出、新 key 都结束对应 Contribution Scope，重新选入、remount 或 A → B → A 回访创建新 Scope。首期没有 keep-alive。

`feedback(state, retry, error)` 可接管反馈；state 包含独立的 input、visibility、availability、selection、execution 事实。retry 只接受 Host 发给该 occurrence 的失败目标。Context 错误由 A 修正，不走 retry。

## Context 与观察

`useSurfaceContext()` 返回 `{ contextKey, revision, value } | null`。框架无关消费者可用 `client.watchContext(listener)`；它在 retry 时先交付 Host 接受重试时捕获的初始合法快照，再交付更新的 same-key 快照。React 可以合并多次状态更新，因此不保证每个 revision 都完成一次绘制。

同 key 合法更新保留执行；同 key 非法更新保留最后合法快照并报告拒绝；新 key 非法立即结束旧 Scope，当前 effective Context 为空。历史 lastAccepted 仅用于反馈，不复活旧业务对象。

Host 为观察分配全局单调 progress，Scope / Attempt 标识包含本次 Host runtime 的随机 epoch。UI stream 绑定 Attempt，Overlay stream 绑定 owner Scope。客户端只接受相同 stream 的更高 progress；首次快照、订阅建立期间的更新和完整快照恢复使用同一规则。`client.refresh()` 获取完整快照与进度点。Context revision 独立于观察 progress。

SDK 接纳首份快照后发送控制就绪确认。Host 等待控制就绪与呈现初始化完成才报告 execution ready；Builtin 还等待 React commit。ready 不代表业务数据加载完成。

## Schema 与资源限制

Schema 为 JSON Schema 2020-12 内联对象子集。支持单个 `type`（null、boolean、string、number、integer、object、array）、`properties`、`required`、布尔 `additionalProperties`、对象 `items`、`enum`、`const`、minimum / maximum / exclusiveMinimum / exclusiveMaximum、min/maxLength、min/maxItems、min/maxProperties，以及 `$schema`、title、description。未知关键字拒绝；不支持 `$ref`、组合 Schema、pattern、format、类型数组或远程解析。

JSON 输入上限为 65,536 UTF-8 bytes、深度 32、10,000 个值节点；控制 envelope 也计入消息大小。Schema 最多 512 个 Schema 节点、深度 16。只接受 JSON 数据，拒绝循环引用和非有限数字。

同 owner / point / contractMajor 的 Schema 在保留的安装版本间按规范化 JSON 比较；修改 Schema（包括可选字段）必须升 Major。安装存储保留的 Restricted 版本可执行自动检查；Builtin 随 Host 构建提供，同样遵守冻结规则。Builtin 发布、业务 semantic 变化与被外部删除的历史制品需要发布治理，机器不能从业务代码证明 semantic 未变。

当前 Host 默认同时最多 128 个 Scope，Scope 深度小于 8，每 Attempt 最多 32 个 occurrence，每 owner Scope 最多 32 个 Overlay 记录（含终态）。这些是实现资源预算，不是递归兼容性承诺。UI Control Plane 每 Session 每秒最多 200 个请求，单独于 Capability RPC 预算；准备就绪超时为 10 秒。

## Host 执行与清理

`createUiHost` 组合纯逻辑 `createUiRuntime`、本地 Builtin adapter、Restricted Wujie adapter 和 Host policy。UI Control Plane 与 Capability RPC 分开 dispatch，共用一个 Session / MessagePort；插件不能提交 Scope 身份来选择资源归属。

逻辑 Scope tree 包含 root、Contribution Scope 和 Overlay execution Scope。Owner Execution Scope 是资源归属角色。Attempt 拥有 Session、presentation root、Anchor 和 occurrence；其失败使呈现子树失效，Scope 直接拥有的 Overlay 可继续。父 Attempt 的 occurrence 被撤销时，下属 Contribution Scope 及其 Overlay 一并结束。

Anchor 只在当前 presentation root 内解析。Restricted 使用实际 ShadowRoot，Builtin 使用 Host 指定 root；物理父子检查使用 Host 原生 Node getter，绕开 Wujie 的虚拟 parentNode。MutationObserver 撤销已移出 root 的 Anchor 绑定。随机 DOM 标记只是定位信息，不能授予身份、跨 root 权限或 point ownership。

执行失效先同步撤销身份、拒绝新操作，再异步回收呈现与订阅。Bridge 的 Host `settled()` 屏障包含迟到 subscription open 和异步 disposer；UI 的 `dispose()` 等待清理结束。Scope 结束后不能重试、重新观察旧 handle 或接受迟到加载。

Wujie 2.1.0 adapter 使用唯一实例名并每次显式 destroy。内部 `alive: true` 用于阻止视觉节点断连时抢先销毁尚在初始化的 iframe；Host 不复用 name 或保留 unmount 后的执行。adapter 还在 `beforeLoad` 捕获 Wujie 内部 `iframeReady`，避免 artifact 失败先于 iframe 初始化时提前 destroy。这是版本相关的实现依赖，升级 Wujie 时须重跑取消加载和嵌套卸载浏览器验收；协议不暴露此字段。

content-sized 测量显式内容 wrapper；bounded 使用容器预算，当前默认目标高度 320px 并受 A 的 min/max 约束。真实容器、ResizeObserver 与 CSS overflow 协调尺寸，不向业务 Context 注入 resize 或改变 revision。Host 使用独立 cell 和 CSS order 排序，避免移动存活 Wujie 元素触发断连。

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

## 可运行验收

```bash
pnpm test
pnpm typecheck
pnpm test:e2e
pnpm build:routing-validation
pnpm test:e2e:preview
```

`apps/ui-composition-fixtures` 独立构建三个 Restricted 入口，不互相导入实现；Host fixture 仅提供声明、授权、A 根挂载和诊断。`e2e/cross-plugin-ui-composition.spec.ts` 通过真实 Chromium 验证组合与生命周期；核心契约检查在 `packages/plugin-runtime/test/ui-*.test.ts`，原有路由与 Bridge 测试作为回归一起运行。生产验证使用本地 validation build，不代表部署或生产路由发布。

本次验证记录（2026-09-04）：

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 152 项 Runtime + 40 项 Host + 5 项脚本检查通过 |
| `pnpm typecheck` | 所有 workspace 通过 |
| `pnpm test:e2e` | 开发环境 24 项真实 Chromium 验收通过，包含 React StrictMode |
| `pnpm build:routing-validation` | Runtime、Restricted 示例、A/B/C 独立入口和 Host 生产验证构建通过 |
| `pnpm test:e2e:preview` | 24 项真实 Chromium 验收通过，其中 10 项为本次 UI 协议场景 |
| `pnpm build:docs` | 文档构建、页面渲染和链接检查通过 |

10 项新浏览器场景覆盖：A → B → C 与 same-key 更新；hidden / unmount / A → B → A；非法 Context；多 occurrence 与筛选；B retry 后 Overlay 恢复；父 Attempt 与 Scope 结束；真实尺寸与 revision 不变；Builtin render failure；Overlay 呈现失败 / retry / Escape；物理 Anchor 移除与迟到 artifact 清理。其余 14 项覆盖原有路由、Bridge、配置和后端授权回归。

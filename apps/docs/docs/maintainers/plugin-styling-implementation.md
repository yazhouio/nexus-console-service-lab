# 插件样式实施记录

本轮按[插件样式设计](./plugin-styling-design.md)实现平台 Token、Builtin CSS 构建资产和 Browser Runtime 生命周期。Builtin 仍在 Host realm 执行；Restricted 仍使用现有 Wujie ShadowRoot。没有新增样式服务、主题消息、Manifest 字段或隔离容器。

## 平台资产与样式归属

`@nexus/design-tokens` 独立于 Console Core。`theme.css` 是 Token 数值的唯一来源，`README.md` 说明契约版本与单位；`baseline.css` 只包含 document 高度、body margin 和 box-sizing。Console 的入口只静态加载这两个平台资产，业务 CSS 全部由 Runtime 加载。

公开 Token 覆盖颜色语义、间距、字体、字号、字重、行高、圆角与阴影。长度使用 px，行高与字重无单位，字体使用系统栈。目前发布完整的默认浅色主题；验收中的主题属性使用测试覆盖值，**没有将不完整的暗色主题当作产品功能发布**。新增完整主题时，在同一资产中以 `:root[data-nexus-theme='…']` 声明，Host 切换根属性即可更新普通 DOM、Shadow DOM 和 Overlay，不需要重挂 UI。

Core、cluster、extension-demo 分别使用 `core-*`、`cluster-*`、`extension-demo-*` 私有类名。原有裸元素 selector 和仅凭私有祖先约束的业务 selector 改为实际元素上的私有 class，避免影响 Anchor 下的其他插件。`RouteLink` 支持 `className`；`ActionMenu`、`Tabs` 支持 `classNames`，将调用方提供的类名直接应用到自身控件，不向嵌套 Surface 传播。

Deployment 主插件和四个扩展显式共享 `deployment-ui.css`。它是这一组业务模块的共同样式依赖，Distribution 为各定义关联同一生成 URL；其类名不属于 Core 或平台契约，也不要求主插件永久持有 CSS 引用。

## 构建接入

Console 的 Rsbuild 配置使用 `scripts/artifact-css-loader.cjs` 编译 `?artifact` CSS 模块。Distribution 导入同一次编译生成的数组，按已经选定的 PluginDefinition ID 关联：

```ts
import { css as billingCss } from './plugins/billing.css?artifact';

const distribution = {
  builtins: [billing],
  builtinCss: { [billing.id]: billingCss },
};
```

添加插件时，在 `rsbuild.config.ts` 的 `artifacts` 中配置其源文件与私有命名空间。CSS Modules 可从同一个 `*.module.css?artifact` 导入默认 class 映射，Distribution 则导入具名 `css` 数组。生成名包含命名空间和源内容信息；JS 映射与 CSS 由同一次编译产生。

构建流程会：

- 用 Lightning CSS 展开本地 `@import` 和 CSS Modules 依赖，产生完整静态 CSS；远程 import、缺失资源或未闭合语法会使构建失败。
- 根据实际内容产生 `static/plugin-css/<namespace>.<hash>.css`，本地 `url()` 资源另行带 hash 输出并重写为相对 CSS 资产的路径，保留 query/hash。
- 使用 bundler public path 和 Host origin 生成绝对 URL，不依赖当前页面 Route。Console 明确设置根 public path；CDN 可使用绝对 public path。
- 保留模块默认 class 映射，但不在 JS 求值时注入 CSS。
- 在编译结果上检查私有 class/变量、keyframes、font-family 注册、counter、layer、平台 Token 写入、全局 selector、`!important` 和越权定位。Core 仅保留其现有产品布局所需的 fixed/z-index；普通插件使用 Overlay 协议。
- 拒绝业务 CSS 的普通副作用 import，并通过 Rspack 模块图拒绝没有由 Distribution 直接纳入闭包的 `?artifact` 模块，包括异步 JS 引入的 CSS。

`builtin-css-inventory.json` 是从本次构建产物生成的发布清单，不供 Runtime 再次加载。Runtime 消费的是上述生成数组；Host HTML 不包含插件 CSS link。构建 lint 是工程约束，不是恶意 Builtin 的安全沙箱，也不承诺托管任意 CSS-in-JS 注入。

StyleX 和 Tailwind 保持各自编译责任。`scripts/validate-styling-compilers.mjs` 使用真实编译器生成 CSS，再经过同一资产 loader 和已构建的 Browser Adapter：StyleX 关闭 runtime injection，并给 class 和 layer 加私有命名；Tailwind 仅导入 utilities、使用 prefix 和 `@theme inline` 引用平台变量，不启用 Preflight。不会把这两个编译器加入 Runtime 依赖。

## UI Attempt 生命周期

`browser/artifact-assets.ts` 是 Browser Runtime 内部实现，不从 SDK 入口导出。每个 Runtime 独立拥有缓存，以实际 Document/ShadowRoot 对象和规范化绝对 URL 去重。同一 pending 项先登记再插入 link；列表内按顺序插入，所有调用方共享加载结果，但各自持有引用。

Builtin UI 首次执行先 acquire，所有 CSS 就绪才创建本地 UI Client 并调用 `renderBuiltin`。CSS 超时为 15 秒，后续 UI ready 握手使用独立的 10 秒计时。activate、Runtime Ready 和纯 Action 不等待 UI CSS。

实际样式位置沿 Host 保存的原生 `Node.parentNode` getter 读取，并验证连接状态和现有 Attempt。遇到已存在的 Restricted presentation ShadowRoot 即停止，否则必须到达 Host Document。CSS 等待前后比较完整物理祖先链，断连、迁移或非受管 ShadowRoot 会失败，不回退到 document.head。

404、link error、超时和部分成功均回滚本次引用；失败缓存项移除，显式重试会创建新一代加载。普通失败局限于对应 Attempt；Core 根失败进入独立 Break-glass，Runtime 保持 READY。`UiError.stage` 经通用 mount catch 保留为 `artifact`；Host 的 `presentationErrors` 记录 owner、version、attemptId、URL 和原因，随诊断导出。

隐藏但仍挂载的 UI 持续持有引用。等待中的 abort 只取消当前等待者；已完成 acquire 的 abort 不抢先删除样式。正常清理先结束执行和卸载 DOM/本地资源，再在 finally 中释放 CSS。React 树内呈现通过卸载提交确认完成清理；异步卸载或卸载抛错也会释放资源。

Runtime dispose 先关闭 acquire，再结束执行并等待清理，最后释放剩余内部资源。不会移除平台主题、Host 自带样式或其他 Runtime 的节点，也不清除浏览器 HTTP 缓存。

## Restricted 与兼容性

Restricted 示例从入口 HTML 正常加载自己的 `main.css`，其中只消费平台变量，不定义平台默认值。Wujie 继续独立负责加载、`loadError`、实例销毁和附加字体节点；Builtin loader 不重复注入其 CSS。本轮没有增加 Wujie 缓存兼容层。

独立预览运行 `pnpm --filter @nexus/example-restricted-plugin dev:preview`，使用 3004 端口并由平台包提供默认主题；正常集成开发继续使用 3001。预览模式禁止生产构建，以免默认主题进入集成产物。

实施前已核对现有 `manifest.ts` 的 Route 白名单：它已支持 `parentRouteId`。本轮没有改变 Restricted schema、声明代际、路由解析或业务 Point/Profile 语义，CSS 依赖仍由 Restricted HTML 描述。

## 验收与复现

运行环境为仓库锁定依赖、Node 24 和 Chromium 生产预览。检查包括：

| 检查 | 覆盖内容 |
| --- | --- |
| `pnpm typecheck` | 架构依赖边界和各包类型检查 |
| `pnpm test` | 构建闭包/资源/命名检查与 Runtime 单元测试；共享 pending、按 root/URL 去重、部分失败回滚、取消、超时、迟到回调和 dispose |
| `pnpm build:routing-validation && pnpm test:e2e:preview` | 全部 43 个生产预览用例，包含 9 个样式专项用例及现有 Route、Tab、Overlay、恢复和组合回归 |
| `pnpm test:styling-compilers` | 真实 StyleX/Tailwind 编译、反转加载顺序、主题重算、Host 控件不变、Attempt 不变、异步且抛错的 DOM 清理、Runtime dispose |
| `pnpm test:styling` | 重建生产验证产物并运行样式浏览器与编译器专项检查 |

样式浏览器用例验证了 Host Document 和现有 Wujie ShadowRoot 对同 URL 分别挂载、最后一个消费者结束后清理、无 FOUC 的 ready gate、Core CSS 超时恢复，以及伪造 getRootNode 后迁移容器仍被拒绝。Restricted CSS 首次 404 后按同一 URL 重试恢复；私有 `:root` patch 与字体附加节点的销毁也单独验证。

页面视觉检查覆盖 Deployment 列表/详情、Overview 和 Settings；这些检查针对生产产物，未以 dev 注入或 HMR 替代生命周期验收。编译器详细观察写入 `test-results/styling-compilers.json`。

生产 CDN 的不可覆盖发布和长期缓存策略仍归发布环境验证，本地预览不替代该检查。V1 也不提供完整暗色主题、任意 portal/多文档挂载、字体下载管理或动态 CSS chunk 调度。

相关编译器依据：[Lightning CSS bundling](https://lightningcss.dev/bundling.html)、[StyleX 编译说明](https://stylexjs.com/docs/learn/installation/)、[Tailwind theme](https://tailwindcss.com/docs/theme)、[Rsbuild 配置扩展](https://rsbuild.dev/guide/configuration/rspack)。

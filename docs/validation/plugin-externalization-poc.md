# Externalization 三个技术 Gate：最小 PoC 报告

日期：2026-09-11。结论：**三个 gate 均通过，七个实验用例通过。** 当前可继续采用“Host pure Federation Runtime + Rspack Remote”的方向；这个结论仅覆盖下述技术链路，不代表完整 Externalization 已验收。

实验代码位于 [plugin-externalization-poc](./plugin-externalization-poc/run.mjs)，原始结果为 [plugin-externalization-poc-results.json](./plugin-externalization-poc-results.json)。正式 Runtime、BrowserHost、Console 构建配置、根 package.json 和 lockfile 均未修改。实验代码只在 `docs/validation`，安装及构建发生在系统临时目录。

## 实验装置与版本

| 项目 | 实际使用值 |
| --- | --- |
| Node | 24.14.1 |
| Chromium | 151.0.7922.34，Playwright 驱动 |
| Rsbuild / Rspack | 2.2.2 / **2.2.2** |
| Federation | Host `@module-federation/enhanced/runtime`；enhanced、runtime、runtime-core、runtime-tools 为 **2.9.0** |
| React / React DOM | 19.2.8 / 19.2.8 |
| SDK | 当前 `@nexus/plugin-runtime` 0.1.0 源码的临时构建及 npm tarball |
| 构建模式 | 两侧均为 production；Remote 是 script/var `remoteEntry.js`，固定 `./plugin` expose |
| 网络 | 两个 `127.0.0.1` 不同端口的 HTTP origin；Host 从 `/nested/console/path` 打开 |

SDK 从当前源文件编译到临时 `outDir`，未修改仓库的源码或 `dist`。为供实验独立安装，仅在临时 package metadata 中把 workspace/catalog 依赖替换为明确版本；没有实施正式 npm 发布改造。Host 和 Remote 分别 npm install，各有 node_modules 与 lockfile，通过 tarball 消费 SDK，无源码 alias、workspace link 或 Host-to-Remote 源码导入。

Remote 使用当前 CSS loader、lint 和 ArtifactCssClosure 的**原样副本**，闭包检查入口设为 Remote 的暴露模块。这些副本的来源 SHA-256 记录在结果中；没有改写 CSS 编译或管理算法。Host 通过 SDK 公共入口使用真实 `bootstrapPluginRuntime` 和 `createUiHost`，只写了最小 React renderer 夹具来提供当前 UiProvider 与 Route Providers，没有修改或复制 BrowserHost 的启动实现。

初次安装曾因 Rsbuild 的依赖范围解析到 Rspack 2.2.3；正式记录的通过实验已用直接依赖及 npm override 固定回 2.2.2。故本报告没有把 2.2.3 的结果当成 2.2.2 的验证。

## Gate 1：Host 能提供真实共享实例

**PASS。** Host 保持普通 Rsbuild 构建，没有启用 Host Federation build plugin。通过 `createInstance` 的 `shared.lib` 登记自身实际导入值，Remote 使用 `import: false` 消费这些值。

入口加载后，六项引用比较全部为 true：

| 检查对象 | 结果 |
| --- | --- |
| `React.useState` | Host === Remote |
| `react/jsx-runtime.jsx` | Host === Remote |
| SDK `UiProvider` | Host === Remote |
| SDK `useUiClient` | Host === Remote |
| SDK `RoutePresentationProvider` | Host === Remote |
| SDK `RouteLinkProvider` | Host === Remote |

惰性 chunk 中 `react-dom.createPortal` 与 Host 引用也相同。本实验只比较该导出引用，没有测试 Portal 布局或任意 Design System Provider 传播。

不仅比较对象：Remote 的同一插件定义经真实 bootstrap 注册后，Host 同时创建两个 UI Root。两个实例都成功取得 UiClient、读出 Host 的 `host-context` 路由参数、呈现 Host outlet；RouteLink 的 href 为 Host 生成的 `/from-host/linked`，点击远程组件按钮将 hooks 状态从 0 更新为 1。

**负例具有检出能力：**只移除 Remote 的 SDK React shared 配置，继续共享 React。此时 React 引用仍相同，UiProvider 引用不同，实际呈现失败并得到 `A Host-bound UiProvider is required.`。构建 stats 也显示：正确产物没有私有 React/SDK React 实现，负例包含自己的 `@nexus/plugin-runtime/dist/ui-react.js`。

这证明当前问题确实包含 SDK Context 的模块身份，不能只依赖 React singleton。

## Gate 2：共享冲突能明确拒绝

**PASS，拒绝发生在实际消费对应 shared 模块时。** Remote 必需依赖使用 `import: false + singleton: true + requiredVersion + strictVersion: true`；Host 使用 `loaded-first` 供应已加载实例。

| 用例 | 实际结果 |
| --- | --- |
| Remote 要求 React `^18.0.0`，Host 为 19.2.8 | `loadRemote` reject，错误指出 react 版本不满足要求；没有进入 bootstrap。 |
| Remote 要求 SDK `^9.0.0`，Host 为 0.1.0 | `loadRemote` reject，错误指出 SDK React 入口版本不满足要求。 |
| Host 未供应 SDK React 入口，Remote 禁止 fallback | `loadRemote` reject，得到 `RUNTIME-012`，提示 Host 未提供对应 lib。 |
| 同样要求 React `^18.0.0`，但关闭 `strictVersion` | **负例：加载成功，仅 warning。** 证明 singleton 本身不是拒绝机制。 |
| 仅惰性 chunk 消费不兼容的 `react-dom` | 入口 `loadRemote` 成功，随后 `loadLazy` reject；未注入 CSS。 |

入口冲突和缺依赖的三个拒绝用例均保持本地 Host 控件可用，且没有插件样式残留。这里验证的是加载 Promise 可捕获的失败，尚未实现正式 Host 的错误呈现、Core/non-Core 降级或恢复流程。

两个需要保留的限制：

- 不能把 `loadRemote` 成功当作对全部惰性代码路径的提前兼容证明；本实验已观察到延后拒绝。
- 原始版本错误中的 consumer 字段出现 `undefined`。正式接线应附带 Distribution 已知的预期插件 ID/version、entry 等诊断上下文，而不是只展示原始错误字符串；本 PoC 没有增加错误归一化框架。

## Gate 3：Remote CSS 没有第二个加载所有者

**PASS，在 Host Document 与现有 createUiHost 路径内成立。** Remote 的主组件与惰性组件各有一个 CSS Module，同次构建产生 class map 与两条绝对 CSS URL，暴露入口纳入完整 CSS 闭包。

| 观测时刻 | 样式节点与行为 |
| --- | --- |
| Host 启动 | 0 个 stylesheet link/style。 |
| `remoteEntry` 和 expose 加载完成 | 仍为 0；没有 CSS 请求。 |
| 惰性 JS chunk 加载完成 | 仍为 0；没有 CSS 请求。 |
| 同时挂载两个 Remote UI 实例，CSS 响应人为延迟 500 ms | 仅 2 个受管 CSS link；CSS 未就绪时没有业务 DOM，renderer 尚未执行。 |
| CSS 就绪 | 两个实例进入 ready；主组件实际颜色 `rgb(12, 34, 56)`、padding `7px`。 |
| 再挂载惰性组件 | 仍只有 2 个 link；惰性 CSS Module 生效，padding `9px`。 |
| 依次卸载前两个实例 | link 保留，最后一个实例仍持有引用。 |
| 卸载最后一个实例 | link 降为 0，业务 DOM 也清理完成。 |

正确用例中两份 CSS 各请求一次，URL 均来自 Remote origin 的 `/good/static/plugin-css/`，未解析到 Host 嵌套路由下。JS entry/expose/lazy chunk 都没有自动插入插件样式。实验未使用 Federation preload API，也未启用其他样式注入机制。

因此现有 `builtinCss → createUiHost → artifact-assets` 链路可以直接接收此次独立 Remote 构建的产物，不需要新 CSS Runtime。本 gate 没有覆盖 Wujie ShadowRoot、CSS 404/超时/重试、字体图片闭包或 CDN 缓存；不能从 Document 中的结果外推这些行为均已通过。

## 实验中发现的额外限制

最初直接将 `React.lazy(...)` 返回的对象登记为 Surface `render`，出现：`Cannot assign to read only property '_status'`。当前 [frozenCopy](../../packages/plugin-runtime/src/immutable.ts) 会复制并冻结 plain object；本地无 Federation 的检查也确认原 lazy payload 未冻结，而经过该函数复制的 payload 被冻结。

实验最终采用现有 Builtin 使用的普通函数 target：

```tsx
const LazyView = React.lazy(loadView);
function LazySurface() { return <LazyView />; }
// registerSurface 的 render 指向 LazySurface。
```

这样 React 的可变 lazy 对象留在函数内部引用中，惰性 chunk 与 CSS 的 gate 可继续验证。正式 Runtime 没有为此修改。此次发现不能被表述为“任意 React render target 都支持”；其原始失败记录保留在本地 [lazy-object-observation.json](/Users/yazhou/code/nexus-service/test-results/plugin-externalization-poc/lazy-object-observation.json)。

## 复现与证据

在仓库根目录执行：

```sh
node docs/validation/plugin-externalization-poc/run.mjs
```

脚本自动创建独立临时目录、编译并 pack SDK、分别安装依赖、构建六种 Remote 变体和普通 Host、启动不同 origin 的静态服务、执行七个浏览器用例，最后关闭浏览器与服务器。终端输出 gate 结果；临时目录保留用于检查，不加入 workspace。需要仓库现有工具依赖、可用的 Playwright Chromium 和 npm 网络访问。

证据分为：

- 可随实验保留的 [结果 JSON](./plugin-externalization-poc-results.json)：实际版本、七个用例、原始错误、模块引用结果、构建模块审计、网络记录及正式输入哈希。
- [实验脚本](./plugin-externalization-poc/run.mjs)、[Host 夹具](./plugin-externalization-poc/host/main.tsx)、[Remote 夹具](./plugin-externalization-poc/remote/plugin.tsx) 和两侧构建配置。
- 本地 [Host lockfile](/Users/yazhou/code/nexus-service/test-results/plugin-externalization-poc/host.package-lock.json)、[Remote lockfile](/Users/yazhou/code/nexus-service/test-results/plugin-externalization-poc/remote.package-lock.json) 及同目录构建/安装日志。新目录重跑会重新解析传递依赖，应以每次记录的实际版本为准。

本报告支持继续推进此加载方案的下一步集成，但尚未验证公共 BrowserHost 完整发布、真实跨 Git 仓库 CI、Wujie、路由树集成、Core 降级、热更新或生产 CDN 缓存。当前结论足以通过这三个技术门槛，无需因此修改 Plugin ABI、增加通用 Loader 或替换已有样式生命周期。

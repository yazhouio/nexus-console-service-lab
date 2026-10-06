# Plugin Externalization 最小设计

状态：设计提案，2026-09-11。最终核对基线为 `6c52a9b`，包含已落地的插件样式实现；本轮只新增设计与调研文档，没有修改实现或运行跨仓库 PoC。技术资料核验见 Loader 调研记录（`docs/validation/plugin-externalization-loader-research.md`）。

**推荐：可信 Builtin 使用 Federation Runtime 从 HTTP/CDN 加载，Remote 使用当前 Rspack 的 Federation 构建能力；Host 通过 pure runtime 登记自己已经使用的共享模块。加载结果仍是现有 `PluginDefinition` 与 `builtinCss`。Restricted 保持现有 Manifest + Wujie。**

选择 Federation 的依据是当前 Host 已经把 React 和 SDK React 入口打进自己的 bundle，而外部 Builtin 必须使用这些入口的同一实例。它解决实际的模块连接问题；不承担插件依赖解析、权限、生命周期、Contract 发现或业务状态共享。Native ESM 是可行备选，当前需要对 Host 的依赖供应方式做更多调整。

本阶段承诺独立仓库构建、独立发布制品、浏览器启动时动态取回已选择的 Builtin，以及外部项目通过 npm 包使用 Host。插件版本仍由 Distribution 固定，一次 Runtime 的 Plugin Set 不变。发布新制品与将其纳入 Console 发行版是两个动作；首次方案允许 pins 继续位于现有 Distribution 代码中，切换选择仍需更新 Distribution 并 reload，不默认增加远程发行配置服务或保证切版无需重建 Distribution。

> 实施进展（2026-09-12）：已按本设计接入异步 Builtin 准备、Federation 发行示例、公共包发布和独立 Restricted Manifest。使用方式见 [Externalization 实现指南](./plugin-externalization.md)，验证入口为 `pnpm test:externalization`。本文的基线描述保留为设计时依据。

## 1. 已有实现决定的约束

| 事实 | 源码证据 | 对设计的影响 |
| --- | --- | --- |
| `PluginDefinition` 只有 descriptor 与 `activate(context)` | plugin.ts（`packages/plugin-runtime/src/plugin.ts:6`） | 不新增 `load/init/mount/unload` Plugin ABI，也不把 Federation 方法映射成插件生命周期。 |
| Bootstrap 输入是已取得的 Builtin definitions；resolver 一次运行，注册事务提交 | bootstrap.ts（`packages/plugin-runtime/src/bootstrap.ts:69`）、启动实现（`packages/plugin-runtime/src/bootstrap.ts:419`） | 远程定义在 bootstrap 前取得，继续复用 Core Closure、能力依赖和 Admission。 |
| BrowserHost 已只依赖 Runtime，Distribution 注入具体插件和恢复能力 | Host exports（`packages/browser-host/src/index.ts:1`）、BrowserDistribution（`packages/browser-host/src/distribution.ts:9`） | Host 公共化优先完成现有包发布，无需新增 Console Host Facade。 |
| Builtin 都由 Console 静态 import | distribution.ts（`apps/console/src/distribution.ts:6`） | 新接入点是异步取得定义，不是重新实现注册机制。 |
| Host 和插件共同使用 SDK React Context | ui-react.tsx（`packages/plugin-runtime/src/ui-react.tsx:3`）、ManagedBuiltin（`packages/browser-host/src/ManagedBuiltin.tsx:84`） | 必须共享 `@feforgejs/plugin-runtime/react` 的模块身份；仅共享 React 不够。 |
| 根呈现/Route Layout 在 Host Router 树内，独立 Slot 由 Host 创建 React Root | ManagedBuiltin（`packages/browser-host/src/ManagedBuiltin.tsx:43`）、render-builtin-ui（`packages/browser-host/src/render-builtin-ui.tsx:10`） | Remote 导出定义及组件引用，由原有 Host renderer 执行；不能远程自行 mount 整个应用代替此语义。 |
| CSS URL 数组、就绪门禁、按真实样式根去重和引用回收已经实现 | builtinCss（`packages/browser-host/src/distribution.ts:10`）、ui-host（`packages/plugin-runtime/src/browser/ui-host.ts:155`）、artifact-assets（`packages/plugin-runtime/src/browser/artifact-assets.ts:46`） | 只改变这些 URL 的构建来源，不增加 AssetManager。 |
| Restricted 是独立 HTML 应用，但 adapter 强制入口同源 | Manifest（`packages/plugin-runtime/src/manifest.ts:23`）、Wujie origin 检查（`packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts:280`） | 最小 CDN 接入是同源 URL 代理/CDN 路由；允许域名或 CORS 配置本身不能解除此限制。 |
| Store 变更要求 reload，UI Runtime 在创建时取声明快照 | installation-store（`packages/plugin-runtime/src/installation-store.ts:24`）、ui/runtime（`packages/plugin-runtime/src/ui/runtime.ts:33`） | 动态取模块不代表运行中热安装、替换或卸载 JS。 |

设计优先服从当前实现及 ADR 0017（`docs/adr/0017-console-composition-runtime-boundaries.md`）。早期《技术调研》中的通用 Loader 图不是本阶段必须恢复的设计；V1 明确推迟的远程 Direct 需求现在出现，只需实现这条实际路径。Builtin 在本阶段表示可信代码采用现有 Direct 执行路径；它可以来自本地或远程。沿用 `kind: 'builtin'`，不新增 `external` kind，也不把来源自动等同于权限。

## 2. 加载方案比较

| 方案 | 在当前代码上能解决什么 | 额外成本与限制 | 结论 |
| --- | --- | --- | --- |
| Native ESM + `import(url)`，插件全量打包依赖 | 独立构建、HTTP 加载最直接 | 内置第二份 React/SDK Context 会破坏 Host 渲染；同版本也不保证同实例 | 不满足当前 Builtin 要求。 |
| Native ESM + import map + external dependencies | 把 Host/Remote 的相同 import 映射到同一模块 URL，可保持实例身份 | Host 也须消费同一 ESM 图；当前 bundle 内的 React 不会被 import map 自动替换。需改 Host externals，或构建导出 Host 已有实例的 ESM facade；还需预构建 React 依赖、处理子路径和发布版本一致性 | 可行备选；当平台已有浏览器 ESM 依赖发行链时可能更小。 |
| Federation Runtime + Rspack Remote | 向 Remote 提供 Host 已加载的模块实例；支持动态注册远程地址及加载 expose | 有 container/runtime、共享配置和构建版本兼容成本；需验证子路径、严格版本拒绝和 CSS 副作用 | **当前推荐，先验证最小子集。** |
| Host/Remote 都接 Federation build plugin | 自动生成两侧 shared 接线，适合双方都通过 share scope 获取依赖 | Host 启动和 shared 消费方式也会变化；当前 Host 不需要被改造成 Remote 或依赖 Remote 供给 React | pure runtime 接线不可用时再比较，不作为第一步。 |
| SystemJS + `System.register` | 支持远程模块、import maps 和独立 registry | 当前原生/打包模块与 SystemJS registry 不自动成为同一实例；仍需 externals/宿主实例登记、格式转换，另外引入 loader | 没有遗留 SystemJS 产物或旧浏览器约束，暂不选。 |
| npm 包静态安装 Builtin | 独立仓库开发和发布，工程改动最少 | 实现仍编进 Host；插件代码更新需重建 Host | 作为包发布第一步和基线，不能单独满足 HTTP 动态加载。 |
| UMD/IIFE + 全局依赖，或 ESM factory 接收整组依赖 | 可手工连接宿主对象 | 需自己维护依赖对象、全局命名、chunk 注册、版本检查；factory 若要求改组件 import，容易形成另一套 SDK 入口 | 一个无依赖脚本可用；当前模块图上节省的依赖不足以抵消自建接线。 |

Native ESM 的模块映射能力见 [HTML import maps 规范](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)。React 明确要求 Provider 和 consumer 使用完全相同的 Context 对象，见 [useContext caveats](https://react.dev/reference/react/useContext#caveats)。因此此处的 ESM 取舍来自当前 Host 的打包方式，并非浏览器 ESM 不支持共享。

SystemJS 的注册格式、registry 和原生模块互操作限制见 [SystemJS 官方仓库](https://github.com/systemjs/systemjs)。Rsbuild 区分内置 MF 1.5 与附加功能更多的 MF 2.0，见 [官方集成文档](https://rsbuild.rs/guide/advanced/module-federation)。本阶段不需要动态类型下载、preload 系统、DevTools 集成或远程 manifest 聚合。

## 3. 推荐的构建与加载路径

Remote 沿用 Rsbuild/Rspack。第一轮 PoC 使用 Rspack 内置 Federation 能力生成传统 script/var `remoteEntry.js`，Host 使用 `@module-federation/enhanced/runtime` 的 `createInstance`、动态 remote 注册和 `loadRemote`。Host 保持普通构建，通过 runtime `shared.lib` 返回已经导入的 React/SDK 模块实例。这是官方支持的 pure runtime 模式，Remote 仍须经 Federation 构建。[Runtime Access](https://module-federation.io/guide/runtime/index.html)、[Runtime API](https://module-federation.io/guide/runtime/runtime-api.html)

这是一项具体技术选择，不建设支持 ESM、SystemJS、Federation 互换的公共 Loader 接口。加载接线先放在 Distribution 的一个具体实现文件中，Host 只接受完成启动所需的异步准备函数。

Rsbuild 当前明确列出 MF 与 `output.module: true` 的兼容限制，因此不能把“Native ESM 可行”直接等同于“当前 Rspack MF 的 ESM output 可直接用”。Rspack 2 还需安装匹配的 `@module-federation/runtime-tools` 可选 peer；“内置 MF”不等于没有 runtime 依赖。必须锁定并实测 Rspack 2.2.2、Remote runtime-tools 和 Host Federation Runtime 的版本组合；本设计不把官方支持说明冒充已经验证的组合。[Rsbuild 文档](https://rsbuild.rs/guide/advanced/module-federation)、[Rspack ModuleFederationPlugin](https://v2.rspack.rs/plugins/module-federation-plugin)

Remote 只暴露一个约定模块，例如 `./plugin`。该模块示意如下，具体导出名只是发行格式约定：

```ts
export { extensionDemo as plugin } from './plugin';
export { css } from './styles.css?artifact';
// plugin: 现有 PluginDefinition
// css: 同次构建生成的 readonly string[]；无样式时显式为空数组
```

`activate`、Capability、Contribution、Point、Profile 和 Ref Contract 都不增加加载字段。`remoteEntry`、container name、expose、shared 配置只存在于构建和 Distribution 接线；以后更换加载实现时，可以改变发行包装，不要求改写插件定义和注册逻辑。

第一轮一个远程 expose 对应一个插件，避免同时设计发布组协议。现有 Deployment 及其四个扩展先保留原有组装，因为它们共享一个 mock 数据模块；这不阻碍先让独立的 extension-demo 出仓。

Distribution 保留固定的远程选择：预期 plugin ID/version、不可变 entry URL，以及加载该 container 必需的 name。name 由 Remote 构建提供，必须与真实全局 container 名匹配；不能假定任意本地别名都可用。构建同时保证 container name、`output.uniqueName` 及 chunk 注册名在同页各产物间不冲突；它们从发行身份生成，不复用示例工程的默认名称。固定 expose 无需在每个选择项重复配置。ID/version pins 是发行选择，模块内 descriptor 是实际身份，加载后必须核对两者，不另抄 `requires/provides/contributions`。

起步直接消费 `remoteEntry.js` 即可，不同时引入 `mf-manifest.json`、`plugin-artifact.json` 和第二份资源清单。若具体构建插件产生附加 inventory，它只用于发布检查，Runtime 不依赖它。制品目录包含 remote entry、JS chunks、CSS、字体/图片等同次构建资产，目录在发布后不可覆盖。

## 4. 接入现有 Host 启动

最小必要变化是 `BrowserDistribution` 增加一个可选的异步 Builtin 准备回调，示意名 `prepareBuiltins`。它补充远程 Builtins；现有 `builtins` 继续表示本地定义。返回成功取得的既有 `builtins`、既有 `builtinCss`，以及失败选择项的不可变诊断。没有远程插件的外部 Host 不需要提供此回调。

这不是通用 Loader：没有 loader kind、注册表、策略工厂、缓存服务或第二套插件状态。回调解决一个不可消除的问题——Host 必须在现有启动/恢复 UI 仍可用时，把异步网络结果转成 bootstrap 已接受的对象。其返回类型只在 Browser Host 的组装接口中定义，不放进 Plugin SDK。

执行顺序为：

```text
BrowserHost 进入现有 BOOTSTRAPPING
  → 在既有 effect 内调用 prepareBuiltins（有限等待，逐项收集成功/失败）
  → 检查已卸载标志，核对身份与选择冲突，合并 definitions / CSS
  → 创建 Store，防止未装载 Builtin 的身份被 Restricted 占用
  → 现有 bootstrap：验证 → resolve 一次 → activate / 原子提交
  → 现有 route/UI/action 组装
  → 既有 UI Attempt 按需取得 CSS 并渲染
```

接入位置是 App.tsx 的启动 effect（`packages/browser-host/src/App.tsx:18`），位于 bootstrap 调用之前。`applicationLabel`、`recovery`、本地 break-glass 和 Host 自身依赖保持同步可用。不要先在 App 外等待整个远程 Distribution 再挂载 Host，否则网络失败时还需重建一套外层恢复 UI。

Remote module 求值只能提供定义与构建资产数据，不自动 activate、不启动顶层网络业务或写入 Host DOM。下载可并行，提交顺序仍由现有 resolver 决定。选择的全部远程 definitions 在 bootstrap 前收集完毕；页面代码可由插件自身惰性 import，但本阶段不做访问页面时才接纳新插件。

复用现有 `disposed` 检查，新增 await 后立即检查；Federation instance 按当前应用的发行配置复用，不能按 Surface 创建。依赖模块系统已提供的成功加载缓存，不另造 PluginCache。StrictMode 重放、等待超时及迟到模块求值必须由 PoC 验证：可以停止等待并忽略结果，不能承诺已请求的 JS 能像 fetch 一样被取消、撤销求值或从模块缓存卸载。

### 准备失败与 Runtime 失败分开归因

不采用任意 Remote 404 就整批启动失败的默认策略，也不伪造一个 `activate` 必然抛错的 PluginDefinition。

| 失败 | 最小处理 |
| --- | --- |
| 单个 entry/chunk 加载失败、共享依赖拒绝、导出形态或身份不匹配 | 不把该定义交给 bootstrap；记录预期 ID/version、entry、阶段和原因。 |
| 失败项是 Core root，或其缺失使 Core 无法获得 `requires` | 既有 resolver 产生 Core 缺失/能力缺失错误，Host break-glass。 |
| 失败项是普通 feature/provider | 其他成功装载定义进入原 resolver；显式依赖缺失者按原规则跳过，其余可启动。 |
| 已装载后 activate 失败 | 原 activation 事务回滚与 Core/non-Core 规则。 |
| UI 执行时 CSS、异步页面 chunk 或 render 失败 | 进入对应的原有呈现失败机制；普通执行失败不反转 Runtime Ready，Core 根呈现失败进入 break-glass。 |

未装载插件没有成为 Runtime Candidate，不能在 `runtime.plugins` 中伪称为 `FAILED/SKIPPED`。Host 用一份只读启动失败记录显示“已选择、未装载”，与 Runtime inspection 一起导出；bootstrap 随后失败时也保留这份记录。inspection（`packages/plugin-runtime/src/inspection.ts:104`） 的错误投影有固定结构，仅把加载异常塞进 `BootstrapFailure.error` 会丢失这些细节。

这里没有重复 Runtime 状态：启动失败记录只描述进入 Runtime 前发生的网络/发行失败，之后不随 Scope、Attempt 或权限变化。它也意味着 resolver 只验证成功装载的集合，不能声称验证了失败模块原本可能造成的重复 provider 等完整发行冲突。最小方案接受这一限制，完整发行闭包由发布时的组合验证证明；未声明的业务依赖不能靠 Loader 推导。

**失败 Builtin 的 ID 仍由 Distribution 保留。** 当前 同名 Restricted 防覆盖逻辑（`packages/plugin-runtime/src/resolver.ts:484`） 只看实际 Builtin candidates。若过滤掉未装载 Builtin，就可能让同名 Restricted 进入集合。因此 Host 必须按本地定义、成功远程定义和失败选择项的预期 ID，排除同名 Restricted 输入并记冲突诊断；无须复制 descriptor 或创建占位插件。已知的重复 Builtin 选择直接视为 Distribution 配置错误。该 ID 集合从本次选择结果派生，不持久化成另一份安装状态。

## 5. 共享范围与兼容边界

| 模块 | 当前策略 | 原因 |
| --- | --- | --- |
| `react` | Host 提供同一实例，Remote 不内置 fallback | Hooks 必须连接 Host renderer 使用的 React。 |
| `react/jsx-runtime` | 明确共享；开发产物另处理 `react/jsx-dev-runtime` | 自动 JSX 是实际子路径导入，配置包根不等于覆盖所有子路径。 |
| `@feforgejs/plugin-runtime/react` | 必须作为确切入口共享同一实例 | 包含 `ClientContext`、`RoutePresentation`、`RouteLinks` 三个模块级 Context。 |
| `react-dom` | 当前由 Host 选择与 React 配对的版本；Remote 若实际使用 Portal 等入口，则共享该入口 | 当前 Builtin 没有直接 import ReactDOM。 |
| `react-dom/client` | 当前由 Host 持有 renderer；只有实际需要此 import 时才覆盖子路径 | Remote 不应另建根来绕开已有 Surface 执行。 |
| `@feforgejs/plugin-runtime` 根、API 包 | 类型和纯数据不要求 singleton；只按实际运行时导入评估 bundle | 共享 SDK React 入口不代表必须共享整个 Runtime 内核和 Wujie。 |
| `react-router` | 继续由 Host 实现路由；不作为插件公共共享前提 | 插件使用已有 RouteLink/RouteOutlet/RouteContext。 |
| `@feforgejs/design-tokens` | Host 的公共 CSS 资产，插件消费变量 | 目前是 CSS-only，没有 JS Provider 或组件库实例。 |
| 将来引入的 Design System JS | 出现实际共享 Context/缓存/运行时身份需求时再加入 | 不因名称是 Design System 就预先整包 singleton。 |

Host pure runtime 的 `lib` 必须返回 Host 自己实际使用的导入值；不能指向另一份从 CDN 新加载的 React。发布 Host 时也须 externalize 对应 React/SDK 入口，避免公共包内部私有打包一份，再在应用层登记另一份。版本字符串由实际安装包/构建信息生成，Remote 的兼容范围来自自身依赖声明，不能另维护一张相互漂移的手工版本表。

Remote 对必要共享依赖采用 `import: false`、`singleton: true` 和显式 `requiredVersion`，并在选定的 Rspack/Federation 组合中启用及验证 `strictVersion`。只配置 singleton，版本不满足可能仅警告；禁止通过降级到自带 React/SDK 来“修复”不兼容。Host 已选定并加载共享实现，不让 Remote 发布更高版本改变 Host 的 React。构建 shared 的行为见 [官方 shared 配置](https://module-federation.io/configure/shared)，strictVersion 的确切支持与拒绝路径以 调研中的源码证据（`docs/validation/plugin-externalization-loader-research.md`） 和 PoC 为准。

采用 `loaded-first` 复用 Host 已登记的实现，不为收集可供选择的版本而提前访问其他 Remote；本方案仍会显式加载当前 Distribution 选定的全部远程 definitions。共享策略与严格版本校验解决不同问题。[shareStrategy](https://module-federation.io/configure/shareStrategy.html)

共享版本检查发生在实际消费模块时。入口依赖不兼容可在取得 definition 时失败；只有惰性 chunk 才消费的依赖可能在 UI 执行阶段失败，交给原有呈现失败机制。`loadRemote` 成功不代表验证了全部未来代码路径；本阶段不为提前证明这一点再增加运行时依赖清单或扫描器，改由跨仓库构建检查与集成测试覆盖。

PoC 初始固定仓库实际基线 React/DOM 19.2.8 与 SDK 0.1.0；之后是否放宽版本范围由兼容性测试决定。SDK 包当前处于 0.x，不能把 `@feforgejs/plugin-runtime/react` 同实例与“任意 SDK 版本兼容”混为一谈。

以下版本继续各自负责已有问题，不合成新的 `pluginAbiVersion`：npm SDK/React 的代码兼容；plugin version 的发行身份；Capability、Point、Profile/Ref 的既有 major；Restricted `hostApi`、Bridge protocolVersion 与 contribution contract version。Module Federation shared 协商只校验 JS 依赖供应，不替代这些 Contract 和业务权限。

共享模块也不意味着共享 React 树。独立 Slot 的 Root 不会自动继承外层应用任意新增的 Design System Provider；当前 UiProvider 是 Host 显式放入每个 Root 的。将来接入 DS 时需要同时验证模块同一性与 Provider 覆盖，本阶段不预先建设 Provider 转发框架。

## 6. CSS 和制品 URL 沿用现有机制

现有 artifact-css-loader（`scripts/artifact-css-loader.cjs:13`） 已展开 CSS imports、生成 CSS Modules 映射、发射字体/图片，并返回基于 `__webpack_public_path__` 的绝对 CSS URL 数组。ArtifactCssClosure（`apps/console/artifact-css-closure.ts:7`） 已接受一个闭包入口路径，只是当前传入 Console 的 `distribution.ts`。

独立构建需要的调整很小：Remote 的发行入口承担本插件完整 CSS 闭包；将同一个构建检查的入口参数指向它。Host 不扫描插件仓库源码。所有异步组件 CSS 仍提前进入这份完整闭包，JS class map 与 CSS 来自同次编译。无 CSS 时生成空数组，不能因为漏收集而默认为空。

Remote publicPath 必须指向自身不可变发布目录；首轮使用明确的绝对 HTTP/CDN base，避免依赖自动路径推断。当前 Console `assetPrefix: '/'` 与 loader 对 Host origin 的兜底不能直接照搬给 CDN Remote。嵌套 Console Route、entry、异步 JS、CSS 及 CSS 内部资源都要验证实际请求 URL。

准备阶段只读取 `css` 数组，合并进已有 `BrowserDistribution.builtinCss`。UI 挂载时仍由已有机制完成：CSS 就绪后 render，按真实 Document/ShadowRoot + URL 去重，最后一个消费者释放后清理。Builtin 虽在 Host realm 执行，也可能呈现在现有 Wujie ShadowRoot 内，这一行为不能被“共享 DOM”简化掉。

**Remote entry/expose 求值时不得自动插入插件 `link/style`。** Federation/bundler 的 CSS preload 或常规 CSS chunk 注入若仍存在，就会与已有资源寿命管理冲突。继续使用现有 `?artifact` 路径及普通业务 CSS import 检查；不再增加一套 CSS Runtime，也不让 `mf-manifest` 再加载相同资源。CSS `load` 成功不代表字体/图片都已完成，维持已有资源保证范围。

JS 模块缓存寿命可持续整页；Scope/Attempt 的 DOM、订阅、Action 与 CSS 仍按原机制释放。两种寿命不同，不要求 dispose UI 同时删除 Federation container。

## 7. 将现有包变成外部项目可用的发布物

当前包都有 `private: true`。只有 plugin-runtime 已有 `dist` JS/类型输出；browser-host、console-core、两个 API 包仍导出 `src`。workspace/catalog、根 tsconfig 与源码 paths 让当前构建成功掩盖了发布缺口。包配置（`packages/browser-host/package.json:1`）、源码 paths（`tsconfig.base.json:15`）

| 现有模块 | 必要发布工作 |
| --- | --- |
| `@feforgejs/plugin-runtime` 的 `. /browser /client /react` | 保留入口与类型，核验 tarball 文件完整、依赖版本可解析；React 继续 peer。不新建等价 SDK 包。 |
| `@feforgejs/browser-host` | 构建 JS + `.d.ts`，导出已有 BrowserHost/Distribution；React、ReactDOM 及有身份要求的 SDK 依赖采用 peer/external 方式由应用供应，保证一个实际实例。 |
| `@feforgejs/console-core` | 外部 Console 需要默认核心业务时发布其定义、JS/类型与 CSS；它仍是 Distribution 选择的插件，不并回 Host。 |
| `@feforgejs/console-core-api`、按需 `@feforgejs/cluster-api` | 输出独立 JS/类型，继续承载现有 Point/Profile/Ref 和 helper；不通过 Host 私有源码消费。 |
| `@feforgejs/design-tokens` | 发布现有 CSS 并补 files 白名单；不需要 JS runtime。 |
| 已有 CSS loader、lint、闭包检查 | 提取为一个仅构建期使用的小包（名称待实施确定），带齐 Lightning CSS/PostCSS 等依赖；Host 与插件都复用同一实现。 |

最后一项是本阶段唯一有明确理由的新物理包：外部构建无法使用 `../../scripts`，把这些工具放进 Runtime 主入口会混入 Node/bundler 依赖，复制到每个仓库又会使样式规则漂移。只搬现有能力和必要发行入口配置，不建设多 bundler Adapter、插件脚手架平台或通用 compiler。

包内不打包 React/SDK 的私有副本，发布 metadata 不保留无法由外部安装解析的 workspace/catalog 引用；是否由包管理器自动转换，必须检查最终 tarball。独立项目自带 tsconfig，消费实际 exports，不继续引用本仓根配置。当前 tsc ESM 输出还存在 extensionless 相对 import 和 bare imports，因此可供 bundler 消费的 npm ESM 与可直接 HTTP import 的浏览器制品是两种产物，不能混用。

本地 `console-core` CSS 在外部 Host 构建中继续经过相同 artifact 工具，Remote CSS 在插件仓库构建中完成。Host 主包不导入 Console 的主题、策略、恢复 Store、catalog 或具体 Core；外部应用继续通过现有 Distribution 提供这些选择。

Contract 文档生成器仍是仓库工具：sources.ts（`scripts/plugin-contract/sources.ts:1`） 直接导入选定源码，generate.ts（`scripts/plugin-contract/generate.ts:1`） 使用内部 compiler，输出 Markdown。它不成为远程加载前置条件。本阶段发布真实所需的 API 包和 Restricted Manifest；需要外部文档聚合时再消费这些同源数据，不引入另一个 Contract Registry 或重写 Compiler。

## 8. Restricted 独立发布

现有 Restricted 已自行构建 HTML/JS/CSS，并在自己的 realm 使用 React 与 SDK client。它继续 Wujie + Bridge，不加入 Builtin Federation share scope，也不试图跨 realm 共享 React 对象。

将 kubeeye-manifest.ts（`apps/console/src/plugins/kubeeye-manifest.ts:1`） 中插件所有的现有 Manifest 声明移到插件仓库，由插件构建发布 `manifest.json`；发布目录/entry 与 bundler publicPath 由同一发布输入产生。Host 消费这份 Manifest 并继续单独提供 `enabled/grantedPermissions`。Host 的 Bridge contract 和 grants 不由插件发布物自动授予。

第一阶段可由 Distribution 的发行组装读取固定版本 Manifest 并交给已有 catalog/InstallationStore，沿用 `validateRestrictedInstallRecord`；无需先新增运行时 Manifest Fetcher。需要启动时取 Manifest 的产品需求以后也应只是组装入口，不重建 Admission 模型。

生产最小部署形态是浏览器继续访问 Console 同源的 `/plugins/<id>/<immutable-version>/`，由网关/CDN 路由映射到插件独立发布的静态目录。UI 仍由 Runtime 在访问 Surface/Action 时交给 Wujie 加载。这样保留当前 adapter、握手、来源校验及 CSS 链路，不依赖 monorepo 的开发服务器 proxy。

**直接以另一个 CDN origin 作为 Wujie entry 不在当前最小承诺内。** adapter 明确同源检查，Host Store 也有 `/plugins/` 允许策略；仅修改一处 allowlist 不够。若必须跨源 entry，需要单独验证 Wujie 执行 origin、Bridge 握手及 fetch 行为，不能在 Externalization 顺手改成通配来源。Builtin 直接 CDN 加载与 Restricted 同源入口背后的 CDN 分发应分开验收。

## 9. 跨仓库 PoC 与通过条件

PoC 必须使用真正独立的目录/仓库：平台发布包、外部 Host 应用、外部插件项目。外部项目只安装 tarball 或 registry 固定版本，不使用 workspace links、根 paths、源码 symlink 或本仓 `scripts` 路径。使用生产构建与静态 HTTP 服务；HMR 成功不算通过。

首个 Builtin 选 extension-demo，并覆盖 Route/Slot/Action 与 SDK hooks；必要的测试变体只用于验证上下文和资源寿命。Restricted 使用现有 KubeEye。Deployment 主插件和四个扩展保持当前组装作为回归样本：deployment-mock（`apps/console/src/plugins/deployment-mock.ts:14`） 的 `records/listeners` 是它们共享的业务状态，不能拆成五份再用平台 shared 暗中补救。以后独立发布它们时，数据共享应经现有 Capability 或真实 backend 明确表达。

| 风险 | 必须看到的结果 |
| --- | --- |
| npm 出仓只是表面成功 | 全新外部项目可安装、typecheck、生产构建并启动 BrowserHost；没有源码路径逃逸、缺失 exports 或未解析的 workspace/catalog。 |
| Host 和 Remote 实例不一致 | Remote 导入的 React/JSX/SDK React 关键导出与 Host 供应值一致；Route Context、RouteLink、RouteOutlet、独立 Root 中的 UiProvider 都真实工作。故意内置第二份 SDK 的负例必须暴露问题。 |
| singleton 只警告、不拒绝版本 | 入口消费的共享项缺失或不兼容时，在接受定义前失败；惰性 chunk 的失败进入对应 UI 执行。两者均无 fallback React、无悄悄选用 Remote 版本。记录实际 Rspack/runtime-tools/Federation Runtime 组合。 |
| CSS 被 Federation 提前注入 | loadRemote 后尚未执行 UI 时无插件 link/style；挂载前 CSS gate 生效，多消费者去重，最后释放后清理。Document 与 Wujie ShadowRoot 分别验证。 |
| CDN base、chunks 和相对资源错误 | 跨 origin Builtin、嵌套 Host Route、懒加载 JS、CSS Modules、字体/图片请求均命中插件制品目录；无请求意外落在 Host route 下。按资源实际请求方式检查 CORS、MIME、CSP 与缓存响应。 |
| 发布目录混版 | 独立发布 v2 不需要重建插件以外的代码；更新 Distribution pin 后只取选中版本，回退 pin + reload 可恢复。旧 HTML/entry 仍可取得其引用 chunks；禁止覆盖同一版本目录。 |
| 下载失败扩大为全站故障 | 普通 Remote 404/超时产生启动诊断，其余可启动；Core root/provider 缺失走原 break-glass；错误导出和 ID/version 错配拒绝。 |
| 未装载 Builtin 被同名 Restricted 接管 | 注入同名安装记录后仍无法替换 Distribution 选择的 Builtin；冲突可诊断。 |
| 迟到任务或重复启动留下资源 | StrictMode、启动中卸载 Host、网络超时后迟到、CSS 部分失败与重试均无晚到 UI、残留 CSS 或失效桥会话；不把 JS 缓存常驻误判为 UI 泄漏。 |
| Restricted 的 CDN 分发绕过同源约束 | 经生产同源路径路由到独立发布目录，Surface/Action、Bridge、取消和样式销毁可用；另域 entry 保持当前明确拒绝。 |
| 模块加载掩盖业务依赖 | 远程插件不 import Host 私有 Context/Store/组件；Capability、Point 授权与版本不匹配仍由原 Runtime 拒绝。 |

同时记录新增启动请求、压缩后 JS 体积、冷/热加载到 Runtime Ready 的时间；这些是比较 pure runtime Federation 与 Native ESM 成本的证据，不先建设监控平台或任意性能门槛。

**推荐方案的落地门槛是：纯 runtime 能提供现有 Host 实例、版本冲突能明确拒绝、Remote CSS 不产生第二个加载所有者。** 若失败，先判断是否只是锁定版本/配置问题；若必须侵入 Host 启动或重写样式生命周期才能成立，则对同一 PoC 比较 Native ESM + 单一宿主 ESM 依赖图，替换具体加载实现。不要同时实现两套 Loader 或为比较预建分发框架。

## 10. 新增内容的必要性与明确不做的事项

| 新增/调整 | 删除后不可消除的问题会出现在哪里 | 最小形态 |
| --- | --- | --- |
| 一个具体 Federation 接线模块 | 独立模块无法取得 Host 已在使用的 React/SDK 实例 | Distribution 实现中的共享登记、加载、导出检查；无公共 Loader 基类。 |
| Host 的异步 Builtin 准备回调 | 要么 bootstrap 得不到定义，要么应用重复实现启动/恢复 UI | 一个可选回调，产出已有 definitions/CSS 与只读失败证据。 |
| 启动失败诊断 | 未装载选择项没有 Runtime state，故障来源丢失 | 不可变记录，展示于既有 Host 诊断；无新 Plugin 状态机。 |
| Remote 暴露入口与发行 pins | 独立构建后无法连接确定的定义、CSS 与发布位置 | 使用既有 descriptor/数组；固定 expose，不另造业务 Manifest。 |
| 构建工具小包 | 每个外部仓库只能复制规则或反向引用 monorepo scripts | 搬出现有 CSS loader/lint/closure 及其依赖。 |
| 现有包的发布构建 | 外部项目不能仅靠 exports 使用 Host/Contract | 补构建、类型、依赖声明与 tarball 验证，沿用已有包。 |

不增加通用 PluginLoader/Adapter Registry、统一 Artifact Manifest、动态 Contract Registry、SDK 的 `remoteEntry/shared/exposes` 字段、插件级 suspend/unload、热插拔、跨版本自动依赖调解、统一 Design System 组件库或 Marketplace。MF 和 Wujie 均不提供新增的安全承诺；被 Distribution 选择为 Builtin 的远程代码沿用当前 full-trust 执行条件。

# Plugin Externalization：模块加载方案核验

调研日期：2026-09-11。范围：当前仓库源码、已安装依赖源码、浏览器标准及各工具官方文档/源码。本文只记录设计研究，不表示跨仓库 PoC 已通过。下文明确区分现状事实、外部机制事实、设计判断和待验证项。

## 推荐判断

**建议先验证“Host 使用 Federation pure runtime，Builtin Remote 使用 Rspack 内置 MF 编译，加载固定 `remoteEntry.js` 中一个固定 expose”这条最小路线。** Host 通过 `shared.lib` 提供它实际使用的 React 和 Context 模块实例；Remote 返回现有 `PluginDefinition` 与现有 CSS URL 闭包，随后仍交给当前 Runtime。Restricted 保持 Wujie 的 HTML 应用装载路径。

选择理由是现有 Host 已把 React 和 SDK 编进自己的构建，外部 Builtin 又直接返回由 Host 渲染的 React UI，并使用 SDK 模块内定义的 Context。Federation 的直接价值是**让独立编译的 Remote 使用现有 Host 的模块实例**。这里没有要求双方协商谁来提供 React，没有需要第二套应用挂载生命周期，也没有要求 MF manifest、类型自动下载、预加载或多 loader 框架。

这是基于当前代码的倾向，不是“MF 必然正确”。如果 Host 已经采用统一 URL 的原生 ESM 依赖，原生 ESM + import map 会更小；当前需要先迁移 Host 依赖输出，或维护宿主实例到 ESM 的桥接模块，所以尚不占优。具体 Rspack / Federation 包组合、失败时机及 CSS 无副作用必须通过独立仓库验证。

## 1. 当前代码给出的约束

| 已核验事实 | 对选型的直接影响 |
| --- | --- |
| `pnpm-workspace.yaml` 和 lockfile 固定 `@rsbuild/core` / `@rspack/core` 2.2.2、React / React DOM 19.2.8、Wujie 2.1.0。 | 不能套用旧版 Rsbuild “打开配置无需 runtime 依赖”的教程。见 [workspace 配置](../../pnpm-workspace.yaml)。 |
| Host 使用 Rsbuild；入口直接导入 React DOM `createRoot` 和 `BrowserHost`，没有 import map，也没有 MF 配置。 | Host 当前只有 bundler 模块图，浏览器原生模块图不能自动复用其中的 React。见 [入口](../../apps/console/src/main.tsx)、[构建配置](../../apps/console/rsbuild.config.ts)。 |
| `@nexus/plugin-runtime/react` 的 `ui-react.tsx` 含模块级 `ClientContext`、`RoutePresentation`、`RouteLinks`。Builtin 直接使用 `useUiClient` / `Slot` / `RouteLink` / `useRouteContext` 等。 | 单共享 React 不够：此 SDK 子路径的 Provider 与 Hook 必须使用同一模块实例。见 [SDK React 入口](../../packages/plugin-runtime/src/ui-react.tsx)、[Cluster 插件](../../apps/console/src/plugins/cluster.tsx)。 |
| 当前 Builtin 没有自行 `createRoot`；Host renderer 负责渲染，当前 Builtin 也没有直接导入 React DOM。 | 不应为了外部加载改成 Remote 自挂载应用，或预先要求所有插件导入 `react-dom/client`。 |
| `@nexus/design-tokens` 仅发布两个 CSS 入口；当前没有独立 JS Design System 包。 | CSS tokens 的共享是既有主题/样式策略问题，不是当前新增 MF singleton 的依据。见 [包定义](../../packages/design-tokens/package.json)。 |
| `PluginDefinition` 是 descriptor + `activate(context)`。 | Remote expose 应返回此现有定义，不应把 MF `get/init`、SystemJS 或 ESM 传进 Plugin ABI。见 [PluginDefinition](../../packages/plugin-runtime/src/plugin.ts)。 |
| CSS 的 `?artifact` loader 发射 CSS/资源文件并导出 URL 数组及类名；`builtinCss` 已送给 UI Host。 | 模块加载器不能另行注入或管理插件样式。见 [artifact loader](../../scripts/artifact-css-loader.cjs)、[Host 组装](../../packages/browser-host/src/App.tsx)。 |
| `ArtifactCssClosure` 用当前 `distribution.ts` 作为 CSS 闭包检查的固定源文件，且 loader/config 引用主仓脚本。 | 独立构建需复用这套闭包语义，把检查根换成 Remote 暴露入口；不能要求 Host 构建读取远程仓源文件。见 [闭包检查](../../apps/console/artifact-css-closure.ts)。 |
| Restricted 构建已经输出 HTML/JS/CSS，不过 `publicPath` 是主仓约定的 `/plugins/kubeeye/1.0.0/`，adapter 还强制 entry 与 Host 同源。 | 最小独立发布沿用同源路径，由生产网关/CDN 路由到外部静态目录；另域 entry 不是仅补 CORS 即可支持，不需要把 Restricted 改成 MF。见 [Restricted 构建](../../apps/example-restricted-plugin/rspack.config.mjs)、[adapter](../../packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts)。 |

React 官方分别要求 renderer 和组件使用同一个 React 模块，以及 Context Provider/consumer 使用 `===` 相同的 Context 对象。因此“版本相同”不能替代“实例相同”，也不能由 monorepo 的 dedupe 推导跨仓库运行正确。[React Hooks 诊断](https://react.dev/warnings/invalid-hook-call-warning)、[React useContext](https://react.dev/reference/react/useContext)

## 2. 方案比较

| 路线 | 能处理什么 | 本仓额外代价 | 判断 |
| --- | --- | --- | --- |
| Native ESM + import map | URL 动态导入；把多个 bare specifier 映射到同一个模块 URL。 | Host 和 Remote 的共享依赖都须保留为浏览器可解析 imports，或额外维护宿主实例 facade；npm 包须先构建为浏览器可用 ESM。 | 技术上可行；当前 Host 迁移面比 pure runtime 大，保留为对照 PoC。 |
| Host pure Federation runtime + Remote MF build | Host 显式提供已存在模块实例；异步取得 Remote expose。 | 一个 Host 内部加载函数、固定 shared 清单、Remote MF 构建配置及版本组合验证。 | 当前推荐。 |
| Host 与 Remote 都启用 MF build plugin | 自动注入共享依赖规则；支持 build-time remote imports 与双向共享。 | Host 模块图、启动时机、共享依赖消费都进入 MF；需要理解异步入口/eager；外部 Host 消费项目也要配编译器。 | 当前收益不足，后置。 |
| SystemJS | `System.register` 产物、URL registry、import maps；可用 `System.set` 登记 Host exports。 | 额外产物格式和 loader；仍要管理 shared 入口/版本和 CSS；不自动复用 Host bundler 模块。 | 有能力但当前没有 legacy browser 或既有 SystemJS 生态需求。 |
| 完全打包的 ESM/IIFE | 单文件 HTTP/CDN 加载最简单。 | 把 React / SDK Context 各打包一份会破坏当前同树渲染语义。 | 不适合作为当前 Builtin 路线；Restricted 独立 React 已由 Wujie 承载。 |
| externals + 全局对象 / 自定义 factory | 可以直接注入 Host React/SDK 对象，且不一定需要大型 loader。 | 要自己维护全局安装顺序、模块 namespace/子路径映射、缺失和版本失败、资源 URL；若 factory 参数进入插件定义就改变 ABI。 | 可做极小对照，但暂没有证据它比标准 runtime 少维护。 |
| npm 预构建库 + Host 静态 import | 独立仓库构建发布与类型消费。 | 换插件版本要重新构建 Host，不满足本次 HTTP 动态装载目标。 | 是公共包发布方式，不能单独替代 Remote 加载。 |

原生 import map 的标准机制是 specifier→URL，并支持 scopes；它不处理 npm 包构建、semver 协商或注册任意已存在 JS 对象。当前标准允许后续 import map 合并，但冲突映射和已影响过解析结果的规则会被忽略，不能据此承诺已加载依赖可热替换。跨源模块 fetch 也受 CORS 约束。[HTML Standard：模块与 import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)

SystemJS 官方说明其生产工作流以 `System.register` 格式运行，支持动态导入等模块语义；`System.set` 可显式提供 exports，`System.delete` 只删除 registry entry，不是业务副作用清理协议。其 registry API 文档也不推荐把 registry 操作作为普通模块加载工作流。[SystemJS README](https://github.com/systemjs/systemjs)、[SystemJS API](https://github.com/systemjs/systemjs/blob/main/docs/api.md)

## 3. Federation：可确定的事实与最小用法

### 3.1 Host pure runtime 是正式支持的模式

官方将“运行时注册和加载”与“构建插件注册”明确分开：无 build plugin 时用 `createInstance`，显式提供 shared 的版本和 `lib/get`，通过实例 `loadRemote` 装载。它只能向外提供当前 Host 的 shared，不能改写已经打进 Host 的普通 imports 去消费别人的 shared。这个限制刚好符合“Host 选定 React，Builtin 使用 Host 实例”。[Federation Runtime Access](https://module-federation.io/guide/runtime/index.html)

设计上应在 Host 组装/加载边界创建一次实例，使用实例方法，避免把全局默认实例当作新 Plugin Registry。`createInstance` 每次调用都会创建新实例；不要在组件重渲染时重复调用。shared 版本从实际安装包/构建元信息读取，避免手写另一份版本表。[Federation Runtime API](https://module-federation.io/guide/runtime/runtime-api.html)

**设计判断：**Host 普通 import 得到 React/SDK namespace，再由 `lib` 返回这个对象；Host 本身无需成为 MF shared consumer，也无需为此加异步入口或 `eager:true`。Remote 仍须经过 MF build，使其共享 imports 变为对 share scope 的消费；“Host 纯 runtime”不等于“任意未处理 ESM 都可作为 MF Remote”。

### 3.2 只保留一个模块产物入口

Federation 支持以 `remoteEntry.js` 或 `mf-manifest.json` 为入口，后者增加预加载、动态类型提示与调试能力。本阶段没有这些需求，因此可只使用 JS remote entry 和固定 expose。MF 的入口是构建元信息，不是 Nexus Manifest、Contract 或 Admission 的替代品。[Federation remotes](https://module-federation.io/configure/remotes.html)

建议一个 Remote 版本暴露一个构建入口，例如固定 `./plugin`；其 JS 导出保留现有插件定义与 CSS URL 闭包。Remote container name、入口 URL、expose 名只在 Host 内部加载调用和构建产物定位处出现，插件 `activate` 看不到它们。不增加通用 Loader 接口，也不让每个插件选择 loader 类型。

### 3.3 Shared 清单必须按真实 module specifier 制定

- 当前 Builtin 的最低集合：`react`、自动 JSX 对应的 `react/jsx-runtime`、`@nexus/plugin-runtime/react`。开发产物另核验 `react/jsx-dev-runtime`。
- 当前 Builtin 未直接导入 `react-dom` / `react-dom/client`；后续实际使用 Portal 或组件库时，登记其真正使用的 React DOM 入口。`react-dom/client` 当前是 Host 责任，不因 externalization 自动开放另一个 Remote root。
- 不把所有 `@nexus/*` 或所有 dependencies 自动 shared。纯类型导入不形成运行时实例要求；静态 Contract JSON/常量也不天然需要 singleton。
- 如果引入带 Theme/Config Context 的 Design System，须验证它的 Context 模块也统一；只共享 React 仍然不够。当前 CSS tokens 继续按现有规则发布。

MF 的精确名称配置仅拦截对应 import，包名根不会自动涵盖 subpaths；前缀匹配虽可用，但会扩大共享面。PoC 优先显式列出当前实际入口，并检查构建输出中是否仍混入 SDK 或 React 副本。[Federation shared：request / subpaths](https://module-federation.io/configure/shared.html)

### 3.4 Singleton 不等于兼容性拒绝

Remote 对 Host 提供的必需共享模块应明确设置 `import:false`、`singleton:true`、`requiredVersion`、`strictVersion:true`，并以外部构建的 peer/runtime 依赖版本范围生成配置。`import:false` 的意义是不要打包本地 fallback；Host 缺失必需模块或版本不合时必须作为加载失败处理，不以第二个 React 继续。[Federation shared：import](https://module-federation.io/configure/shared.html)、[Rspack ModuleFederationPlugin](https://v2.rspack.rs/plugins/module-federation-plugin)

已核验的 Federation `runtime-core/src/utils/share.ts` 在 singleton 版本不满足范围时，`strictVersion` 为真进入 error，否则只 warn，默认 strict 为 false；`lib` 方式会把 shared 标为已加载。这证明 singleton 不是独立 admission gate。`strictVersion` 检查的是 `requiredVersion` 的语义范围，也不应把它解释为只有精确版本字符串相等才允许。[Federation sharing 源码](https://github.com/module-federation/core/blob/main/packages/runtime-core/src/utils/share.ts)

建议 `loaded-first`，因为设计不需要收集各 Remote 提供的 React。官方说明 `version-first` 初始化可能访问全部 remote entries，导致未使用但离线的 Remote 影响启动；`loaded-first` 按需访问。它不替代 `strictVersion`，也不替代现有 Contract compatibility 与 Runtime admission。[Federation shareStrategy](https://module-federation.io/configure/shareStrategy.html)

### 3.5 当前工具版本不能只看“MF 1.5/2.0”标签

Rsbuild 2 支持通过 `moduleFederation.options` 使用 Rspack 内置 MF 1.5；`@module-federation/rsbuild-plugin` 才是额外的 enhanced 集成路线。内置能力已覆盖 expose/load/share，本阶段无需为了 MF 2.0 的 manifest、类型服务、预加载而引入整套增强构建集成。[Rsbuild MF](https://v2.rsbuild.rs/guide/advanced/module-federation)、[Rsbuild moduleFederation.options](https://v2.rsbuild.rs/config/module-federation/options)

本地安装的 Rspack 2.2.2 `package.json` 把 `@module-federation/runtime-tools` 声明为可选 peer，范围为 `^0.24.1 || ^2.0.0`；内置 plugin 启用后会解析该包，缺失直接抛错。其本地编译器源码会把 `strictVersion` / `singleton` / `requiredVersion` 传给 federation runtime。可选 peer 只是“不开 MF 时不用装”，不是 MF 不需要 runtime。

**尚不能保证：**当前仓库没有安装并验证实际 Federation 版本，官方资料也不能替代对“Rspack 2.2.2 remote + 所选 runtime-tools + Host enhanced/runtime”的组合测试。PoC 必须锁定同一兼容包族并检查 peerDependencies；若内置构建组合未通过，再比较 enhanced Remote build 的必要性。不要同时启用内置和 enhanced 两个 MF build plugin。

Rsbuild 官方还列明 MF 与 `output.module:true` 当前不兼容。因此 PoC 的 MF Remote 采用常规 script container，不应把“MF 可动态装载模块”误读为可同时开启 Rsbuild 原生 ESM 输出。[Rsbuild MF 限制](https://v2.rsbuild.rs/guide/advanced/module-federation)

## 4. CSS、资源与生命周期边界

`remoteEntry.js` 加载成功只证明入口可到达，不能证明异步 JS chunk、CSS、字体、图片 URL 正确。Rsbuild `output.assetPrefix` / Rspack `publicPath` 影响这些资源；`auto` 可按产物位置计算，明确绝对 CDN 前缀也可用。PoC 要验证生产产物，而非仅验证 Host proxy 下的 dev server。[Rsbuild assetPrefix](https://v2.rsbuild.rs/config/output/asset-prefix)

当前 CSS loader 已把本地 `url()` 资源发射到 `static/plugin-assets/`，改写为 CSS 文件相对地址；导出的 CSS URL 由 `__webpack_public_path__` 生成。最小改动是让外部 Remote 使用正确产物前缀和现有 closure 检查，继续交给 `builtinCss`。不再添加 parallel CSS manifest、CSS registry 或 Remote 自注入样式逻辑。

**必须验收：**加载 remote entry 和 expose 的过程中不出现插件 `<link>` / `<style>` 自动注入；插件 CSS 仅在现有 UI Host 所定义的时机获取、应用和释放。包括异步组件与第三方依赖的隐含 CSS import，都必须进入原有 artifact URL 闭包或被构建拒绝。不使用 Federation preload API 来接管插件 CSS。MF 自带 CSS 能力存在，不代表可与当前样式生命周期并用。

Remote 模块求值只提供定义和资产数据，不能启动第二个 React root、全局监听器或插件服务。`activate` 继续做声明注册，也没有新增的插件级 disposer 可用于清理任意副作用；业务执行资源应进入已有 UI/Action 执行管理范围。模块缓存删除不等于插件停用或回滚，版本切换的最低承诺应是下一次 Host 启动加载所选不可变版本；不要从某 loader 有 cache API 推导可热卸载。

## 5. 跨仓库 PoC 的通过标准

| 风险 | 必须实际观察的结果 |
| --- | --- |
| monorepo 偶然 dedupe | 新目录/独立 lockfile，仅使用已发布或 pack 后的公共包；禁止 workspace 链接和源码 alias。Host 与 Remote 独立构建后仍能工作。 |
| React / SDK Context 副本 | Remote 中 Hooks、`Slot`、`RouteLink`、route/surface context 正常；省略 SDK React shared 的负例必须失败。审计实际产物，而不只看 package.json。 |
| namespace / CJS interop | `lib` 返回的真实 exports 可满足编译后的 named/default import，自动 JSX、开发 JSX、所选 React DOM 入口均可运行；namespace 包装未制造内部 React 副本。 |
| 不兼容版本被悄悄接受 | 给 Remote 不满足 Host 的 React/SDK 范围、缺失 shared、误打包 fallback 的负例；必须失败并保留 Host 可用，不自动启动第二套 runtime。分别验证 load expose 与首次 lazy chunk 的失败时机。 |
| Federation 版本组合 | 锁定 Host runtime / Remote runtime-tools / Rspack 版本，证明 native Remote 能被 pure runtime 加载，分享同一实例；不把协议标号当测试结论。 |
| CSS 被 MF 提前加载 | entry/expose/lazy chunk 阶段观察 DOM 与网络；没有 unmanaged 插件 CSS；现有 `builtinCss` 重试、引用计数/清理语义保持。 |
| CDN 路径 | 使用真实不同 origin、嵌套不可变版本目录、非根 Host route；验证 lazy JS、CSS、字体图片、重试时 URL，不依赖 Host proxy。 |
| 离线或错误插件影响 Host | 404、超时、expose 缺失、CSS 失败只沿既有失败路径报告；未请求 Remote 不因 share 初始化影响 Host；错误插件不能留下已提交的贡献。 |
| 缓存与版本 | 同页重复加载不会重复建立 Host runtime；同一插件版本的入口和 chunks 原子发布；升级后的新页面得到新版本，旧页面所引用 chunks 仍可取到。 |
| 公共 Host 的消费者自由度 | 独立消费项目以普通 npm 包使用 Host，不启用 Host MF build plugin，也能运行此 Remote；再选一个不同 bundler 作为集成边界对照。 |
| Restricted 发布路径 | 经生产同源路径加载独立发布的 HTML entry，确认 Wujie 资源 fetch、路由、bridge、主题和资源前缀；另域 entry 维持当前拒绝，不共享 Builtin React share scope。 |

## 6. 不需要新增的抽象

- 不增加 Plugin Loader SPI / loader registry：本次只有一个外部 Builtin 模块通道，Host 内部具体函数就足够。
- 不增加 Runtime 生命周期：加载产物之后依然使用现有 `PluginDefinition`、Contract / Manifest 与 Admission。
- 不把 MF manifest 当新插件 Manifest：JS 入口足够；静态契约继续复用现有产物。
- 不增加依赖协商服务：Host 已决定依赖实例；只检查 Remote 声明是否兼容。
- 不增加通用 CSS 管理：当前 `builtinCss` 已经解决样式获取/应用责任；独立构建补足其发布闭包。
- 不增加“远程应用 Bridge”：Builtin 保留同树 React 插件，Restricted 保留 Wujie；MF 的职责结束于取得模块 exports。

应允许的最小边界只有：**把外部产物定位并取得 exports 的 Host 内部加载函数**，以及**把已有 CSS/依赖构建约束带到独立仓库的发布配置/工具**。前者解决网络模块图和 Host 已有实例之间的不可消除连接问题，后者解决原来依赖主仓脚本与源码路径的构建耦合；两者都不进入 Plugin ABI。

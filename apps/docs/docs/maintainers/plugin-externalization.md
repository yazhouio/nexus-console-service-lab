# Plugin Externalization

按 [最小设计](./plugin-externalization-design.md) 实现。Builtin 可在 BrowserHost 启动期间从固定 HTTP 制品加载；Restricted 继续消费独立发布的 Manifest + HTML，由 Wujie 执行。插件仍使用 `PluginDefinition`、既有 Contribution/Capability 与 CSS 生命周期。

## 构建公共包

```sh
pnpm install --frozen-lockfile
pnpm build:public
pnpm --filter @feforgejs/plugin-runtime pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/browser-host pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/console-core pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/console-core-api pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/cluster-api pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/design-tokens pack --pack-destination /tmp/nexus-packages
pnpm --filter @feforgejs/plugin-build pack --pack-destination /tmp/nexus-packages
```

这些包已移除 `private`，JS/类型通过 `dist` 发布，CSS 包与构建工具有 `files` 白名单。使用 `pnpm pack/publish`，由 pnpm 将 `workspace:` / `catalog:` 转换为可安装版本。先 build 再 pack；不要把源码目录直接当发布物。外部项目同时安装需要的包及配对的 React/ReactDOM；BrowserHost 和 Core 的 React/SDK 是 peer，发布包不打包私有 React 或 SDK Context。

ESM 输出面向 bundler，不是直接 HTTP import 的浏览器制品。源码中 extensionless imports 由消费端 bundler 解析。`pnpm test:externalization` 会检查真实 tarball 的依赖版本，并在不使用 workspace links、根 tsconfig 或源码 paths 的临时项目中安装、typecheck、生产构建和启动。

## 独立 Builtin

`apps/example-builtin-plugin` 拥有 extension-demo 定义、数据与样式，构建仅使用 npm 公共入口和 `@feforgejs/plugin-build`。独立目录的依赖需替换为已发布版本或上一步的 tarball；验证脚本自动完成此转换。

```sh
NEXUS_REMOTE_BASE=https://cdn.example.com/plugins/extension-demo/1.0.0/ \
  pnpm --filter @feforgejs/example-builtin-plugin build
```

完整上传该项目 `dist/` 到这个不可变目录，包括 `remoteEntry.js`、JS chunks 和 `static/plugin-css` 等资产。不要只上传 entry，也不要覆盖已发布的版本目录。当前 1.0.0 的 container name 是 `nexus_extension_demo_1_0_0`；以构建配置中的实际 `name` 为准，并确保各制品的 name/uniqueName 不冲突。

Remote 固定 expose `./plugin`，导出 `plugin` 与显式 `css` 数组。所有异步组件的 CSS 也必须从这个入口直接导入，构成完整闭包；无样式时显式 `export const css = []`。使用 `?artifact`，普通业务 CSS import 会被构建拒绝。构建不会自动向 Host 注入样式；UI Attempt 仍负责 CSS 等待、去重与释放。

Host 登记自己实际导入的 React、JSX runtime 和 `@feforgejs/plugin-runtime/react`。版本从已安装的 package metadata 生成；Remote 使用同一安装基线，并启用 `import: false`、`singleton`、`strictVersion`。当前锁定 Rsbuild/Rspack 2.2.2 与 Federation enhanced/runtime-tools 2.9.0。独立 npm 项目同时设置 `overrides: { "@rspack/core": "2.2.2" }` 并提交 lockfile；仅固定 Rsbuild 版本仍可能使其传递依赖升级。验证脚本使用相同 override，并保存实际安装版本。Remote 若新增 `react-dom` 等运行时入口，必须同步补充 Host 供应和 Remote strict shared，并验证消费路径。

## Console 选择固定制品

```sh
NEXUS_BUILTIN_PINS='[{"id":"extension-demo","version":"1.0.0","name":"nexus_extension_demo_1_0_0","entry":"https://cdn.example.com/plugins/extension-demo/1.0.0/remoteEntry.js"}]' \
  pnpm --filter @feforgejs/console build
```

Pins 是本次 Distribution 的构建输入。选中远程 extension-demo 时，构建分支排除本地实现和 CSS，不扫描该插件源码；未配置 pins 时仍使用本地例子。Deployment 及其扩展保持现有本地组装。

发布新 Remote 与选择它是两个动作。更新 pin 后重建 Distribution 并 reload；回退也通过旧 pin + reload，旧目录必须保留。当前不支持运行中安装/替换 JS，不提供远程发行配置服务。

## 外部 BrowserHost

外部应用继续提供 `BrowserDistribution`，本地 `builtins`、policy、grants、Store 和 recovery 与之前相同。可选的 `prepareBuiltins()` 返回：

```ts
{
  builtins: [/* 成功取得的 PluginDefinition */],
  builtinCss: { /* plugin ID: 同次构建的绝对 CSS URL 数组 */ },
  failures: [/* id, version, entry, stage, reason */],
}
```

实际 Federation 接线位于 Console 的 `src/federation-builtins.ts`，属于 Distribution 实现，不是 SDK Loader API。外部 Distribution 可采用这个具体接线；BrowserHost 主包不依赖 Federation。回调必须有限等待：当前每项默认 15 秒，并行收集，超时只停止等待，不能撤销已请求的 JS 求值。每个发行配置复用一个 Federation instance，成功模块缓存交给模块系统。

BrowserHost 在原 BOOTSTRAPPING effect 内等待，随后合并定义/CSS，再创建 Store 和调用原 bootstrap。每次 await 后检查已卸载标志。失败项不伪装成 Runtime Candidate；普通 feature 失败允许 Core 继续启动，Core root/provider 缺失由原 resolver 进入 break-glass。

完整诊断的 `preparation.failures` 表示“已选择、未装载”，阶段为 `load`、`timeout`、`exports` 或 `identity`。`preparation.conflicts` 记录被排除的同名 Restricted。二者在正常 Runtime snapshot、诊断导出和 bootstrap 失败后的 break-glass 中保留，不影响 Runtime 自己的 ACTIVE/FAILED/SKIPPED 含义。所有已选择 Builtin ID，包括加载失败的 ID，都不能被 Restricted 接管；重复 Builtin 选择是发行配置错误。

## 独立 Restricted

Manifest 声明归 `apps/example-restricted-plugin/manifest.ts` 所有。构建生成 JSON；Console 的发行组装消费 JSON，再通过原 `validateRestrictedInstallRecord` 验证，grants 仍由 Host 提供。

```sh
pnpm --filter @feforgejs/example-restricted-plugin build
# 或构建现有 v2 声明对应的制品
NEXUS_PLUGIN_VERSION=2.0.0 pnpm --filter @feforgejs/example-restricted-plugin build
```

输出的 `dist/manifest.json` 与 bundler publicPath 使用同一个已选择版本。将整个目录独立发布，并将 Console 同源 `/plugins/kubeeye/1.0.0/`（或 `/2.0.0/`）路由到对应静态目录。生产依赖网关/CDN 路由，不依赖 monorepo dev proxy。直接把另一个 origin 的 URL 设为 Wujie entry 仍会被拒绝。

## 验证

```sh
pnpm typecheck
pnpm test
pnpm test:externalization
pnpm build:routing-validation
pnpm test:e2e:preview e2e/plugin-styling.spec.ts
```

`test:externalization` 保留临时目录、安装 lockfile、构建制品和 `test-results/externalization/results.json`。它验证真实 tarball 消费、跨域 Remote、失败隔离、CSS 回收、迟到结果，以及另一次开发构建下的 StrictMode effect 重放。生产 React 不重放 effects，因此不会把生产 `<StrictMode>` 当成这项证明。

原 技术门槛 PoC（仓库路径 `docs/validation/plugin-externalization-poc.md`） 继续可运行；移动 CSS 工具后，脚本改为复制新的唯一实现。可用 `NEXUS_POC_REPORT` 指定结果文件以保留原历史报告。生产 CDN 的缓存、CSP/CORS/MIME 和不可变目录保留策略仍需在真实部署环境验收。

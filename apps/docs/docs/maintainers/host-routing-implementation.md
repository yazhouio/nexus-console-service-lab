# Host 路由实施与启用

本轮实现基于 `host-routing-design.md`，代码已接入 Declarative React Router 8.3.1。开发和生产构建均默认启用路由；正常生产构建不包含测试 fixture。目标环境 smoke、fallback 和性能预算检查仍由专用发布流程执行。

## Contract 与模型

- Runtime 的 `RouteContribution` 和 Restricted Route 增加可选 `parentRouteId`、`acceptsChildren`；Navigation 增加可选 `acceptsChildren`。Builtin target 的 `routeLayout: true` 标明 Host realm 的 Layout，组件负责渲染 `<Outlet />`。Restricted target 始终作为叶 Surface。
- `RouteContext` 为 `{ routeId, pathname, params, search }`，通过独立的 Wujie `props.routeContext` 传入；不改变 `surface.initialParameters` 和 Bridge protocol。父 Layout 仅得到自己 ancestry 的参数；叶 Surface 得到完整祖先和自身参数。
- `packages/plugin-runtime/src/routing/route-model.ts` 集中解析 ancestry、授权、匹配空间、quarantine、URL 和导航。`path-space.ts` 对模板段及长度集合判断相交/包含/等价，冲突例证由结构构造，不用 URL 抽样或 Router score 决策。
- 正常 executor projection 仅含 AVAILABLE Route。呈现层另有诊断占位投影，保留仍合法的父 Layout，绝不执行不可用 target；冲突地址不会静默落到更宽的 Route。
- `AVAILABLE / QUARANTINED / UNREACHABLE`、`MATCHED / NOT_FOUND / CONFLICT`、`MOUNTING / MOUNTED / ERROR` 分属三层。启动失败保持单独状态；Runtime ACTIVE 不因 Host quarantine 改变。

### 路径和编码

顶层绝对路径，child 为非空相对路径；仅整段 `:name` 和末尾 `*`。参数名为 ASCII 字母或下划线起始的字母、数字、下划线，且 ancestry 内唯一。排除 `__proto__`：固定版本执行器无法正确返回该名称的参数。静态模板段使用 ASCII 字母、数字、`_ . ~ -`，排除独立 `.`/`..` 段。模板不接受百分号编码、Unicode 静态段、可选段或部分动态段。

静态模板匹配不区分大小写，尾斜线等价；URL 的无效百分号/UTF-8 编码返回 404，不参与 fallback。URL 参数可使用百分号编码、Unicode 和编码斜线。使用固定执行器的解码语义，包括其对 `%2F` 和 `%252F` 参数的处理；compatibility tests 明确锁定这些行为。query/hash 不参与 ownership；hash 不进入 Context，不触发 remount。

Route 离开后不保活。params、pathname、search 按值变化时，在旧实例完成清理后挂载新实例；普通 React render 和 hash 变化保留实例。Layout 不用完整 URL 作 key。加载提示在布局阶段更新，避免旧内容已清理而提示还没绘制。Wujie 的公开 `htmlLoader` 用于避开会保存旧实例 fetch/loadError 回调以及失败 HTML 的解析缓存，HTTP/脚本缓存仍可复用。

## 统一治理和迁移

示例 Host 的可信策略来源是 `routing/contribution-policy.ts`，版本为 `host-contributions-v1`。它是随 Host 构建发布的显式 allowlist，Route 和 Navigation 共用一个 policy request：contributor、owner、kind、targetId。浏览器 installation localStorage 只存安装声明，不能发放扩展授权；Bridge action grants 不参与该决策。

这提供了平台治理接入位置，但没有声称仓库原本存在统一平台策略服务。接入真实平台时，应从同一受信任的安装/治理配置载体提供该接口并随配置版本发布。v1 示例没有跨 owner Navigation parent 引用；新 KubeEye v2 对 `node-detail` 和 `node-navigation` 的扩展各有一条明确授权，不需要给旧声明默许全部 contributor。

兼容顺序：

1. 发布接受新旧字段的 contract/validator/normalization/inspection；`inspect(runtime)` 和仅传 Surface source 的旧调用仍可使用。未执行 Host 解析时没有 `host` 轴，不假报 AVAILABLE。
2. 发布 Host；生产构建默认启用 routing。当前实现的 contract version 为 2。
3. 插件发布前执行 `pnpm check:plugin-contract <manifest-or-installation.json> <target-contract-version>`。安装配置的 `contributionContractVersion` 明确标识目标支持版本；缺省为当前 contract 2，不存在自动协商。目标为 1 时，新字段在提交旧 validator 前被阻断。
4. KubeEye v1 声明保留；示例配置页安装 v2 后才出现授权的 `node-alert-messages` child 和 Alerts 导航。旧插件仍可与新 Host 使用。
5. 关闭 routing 时保留兼容 runtime。回退到旧 validator 前，必须移除持久化 snapshot 中所有含新字段的版本，包括未选中的版本；示例通过现有 uninstall/reinstall 旧版本入口完成。仅 selectVersion 不足以清除保存的新 schema。相关测试覆盖安装、读取、拒绝和回退路径。

## 验证和性能

命令：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm build:routing-validation
pnpm test:e2e:preview
```

最后两项使用生产优化构建和真实 Wujie，输出到 `apps/console/dist-validation`。`/__fixtures__/surfaces` 仅在显式测试构建启用，用于保留同 Surface Definition 的 Route/Extension 双实例、BridgeSession/Subscription 和故障隔离覆盖；正常构建不开放该页面。

本地性能原始记录在仓库 `docs/validation/host-routing-performance-2026-09-04.json`，包含每种场景 20 个样本、设备/浏览器/缓存条件、构建产物 hash、导航触发、mount、Bridge ready、旧实例清理和首个有效内容可见的时刻。p50/p95 是本次样本的经验统计，不能外推为生产稳定分位数。另保留修复 loading 间隙前的原始记录，便于审查差异。

```sh
# 先执行 build:routing-validation，再在独立终端运行
node scripts/preview-routing.mjs
pnpm routing:measure --local docs/validation/host-routing-performance-2026-09-04.json
```

本地测量使用新浏览器 context、冷场景禁用浏览器缓存，后续场景启用缓存并保留 Wujie 脚本缓存。采样以 rAF 判断有效内容进入视口，不将 adapter.mount resolve 等同于用户可见完成。未配置生产预算，因此报告 `accepted: false` 是预期结果。快速取消和 Layout 本地状态保留另由浏览器测试验证。

## Node 版本与生产验证

项目要求 `Node >=24.14.1 <25`。`.npmrc` 为 npm 开启 `engine-strict`；pnpm 12 使用 `pnpm-workspace.yaml` 中的 `nodeVersion: 24.14.1` 和 `engineStrict: true` 检查依赖兼容性。CI 在安装依赖前运行 `scripts/check-node-version.mjs`，并验证低版本及其他 major 会失败。React Router 在 catalog/lockfile 中精确锁定 8.3.1。

受控发布验证需要平台填写 `scripts/routing-release.config.example.json`：真实 HTTPS origin、构建 commit、部署配置 revision、真实嵌套深链接及期望参数、API/plugin/JS/CSS 成功和缺失响应，以及明确的体验预算。示例预算为 null，不能直接用来通过 gate。最低样本数为 20；这仅是执行下限，不代表统计置信度。

先在目标环境受控验证入口提供相同 commit 的 routing candidate；validation 构建与 release 输出分开，本仓库不配置或部署该基础设施。`pnpm routing:smoke <config> <evidence>` 执行真实页面打开和刷新，核对 Route/params/build marker，检查非页面响应状态/内容类型和 Host HTML rewrite，再测量真实 Surface。需要登录时，可由执行环境设置 `ROUTING_STORAGE_STATE` 指向 Playwright storage state 文件；不会将凭据写入报告。

只有完整通过才写入 passing evidence。构建 gate 要求配置 digest、origin/environment、buildVersion、configRevision 一致，证据在 24 小时内且性能预算通过。目标配置或版本变化会使旧证据失效。

```sh
NEXUS_BUILD_VERSION=<candidate-commit> \
NEXUS_ROUTING_CONFIG=<target.json> \
NEXUS_ROUTING_EVIDENCE=<evidence.json> \
pnpm build:routing-release
```

`.github/workflows/routing-release.yml` 从 GitHub 目标 environment 的 `ROUTING_RELEASE_CONFIG` 读取可信配置，要求候选版本等于 workflow commit，运行 smoke 后才生成并上传验证过的 release artifact。它不执行部署。普通 `pnpm build` 会生成启用路由的生产产物；`pnpm build:routing-release` 额外要求目标配置和真实证据。


2026-09-08：Route Model 已迁入 Runtime，所有根与子 Route/Navigation 都要求版本化 Point；`acceptsChildren` 不再授权。React Router/browser history 属于 Browser Host，Navigation UI 属于 Console Core。当前声明与迁移说明见 [Console Core 架构](console-core-architecture.md)。

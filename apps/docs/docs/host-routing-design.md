# Host 路由接入设计

状态：Q1–Q22 已完成针对性设计收口，尚未实施。本文描述目标设计与验收/rollout 要求，不表示依赖已安装、性能已达标或生产 release gate 已通过。

## 已确认范围

2026-09-04，第一轮讨论确认：

- 在 Host 接入精确锁定的 `react-router@8.3.1`，将 runtime 已注册的 Route 和 Navigation 接为页面与导航入口，同时覆盖 builtin 与 Restricted Plugin 的 Surface 目标；依赖升级作为显式升级动作。
- URL 匹配 Route，Navigation 通过 Route ID 关联页面；Route 声明与 Surface Instance 不等同，术语见仓库根目录 `CONTEXT.md`。
- 使用 History URL；直接打开页面链接、刷新以及浏览器前进后退都必须到达对应页面。部署环境需要保证页面请求回退到 Host 入口。
- 保留 Rsbuild 客户端应用以及现有 runtime、数据获取职责；本轮不让路由接管数据加载、提交、鉴权或服务端渲染。

第二轮讨论确认：

- **Q4：统一页面模型。** `/` 是 Host 内置的 Overview Route，配置、诊断和 Home cards 暂时继续放在该页面。Host Shell 常驻 Navigation，主内容区域根据当前 Route 渲染 Page/Surface；Overview 不作为 Router 之外的特殊页面。
- **Q5：路径语法。** 首期支持标准动态参数与尾部通配，覆盖生产页面、详情页和插件入口；顶层 Route 使用绝对路径，第三轮补充的 Child Route 使用相对父 Route 的路径。不支持可选参数、复杂自定义 matcher 或插件自定义匹配规则。`*` 表达 Host Route ownership，不代表插件内部 URL 双向同步。
- **Q6：导航边界。** 本轮不新增 Restricted Plugin 主动导航 Host 的 Bridge，不启用 Wujie URL 同步。
- **Q7：Surface 生命周期。** 路由命中后自动挂载；离开后取消未完成加载并销毁，不保活；返回时新建实例，不保留页面临时状态。Route 与 Extension 的实例独立。上下文变化与父 Layout 持续挂载的关系见后文生命周期约束。
- **Q8：检测依据。** Host 在受限 grammar 上结构化判断匹配空间是否相交、包含或等价，不只比较 path 字符串，也不复制 React Router ranking；覆盖与隔离规则见 Q12、Q16、Q21、Q22。
- **Q9：Navigation 呈现。** 按 parentId 构建层级并保留现有排序；无 routeId 的节点仅作分组；循环等异常条目隔离并报告，不使整个菜单失效。
- **Q10：状态呈现。** Runtime 启动中显示加载态；启动完成后无对应 Route 才显示 404；启动失败与 Surface 挂载失败明确区分，挂载失败支持重试，不自动跳回首页。
- **Q11：部署范围。** 首期按站点根路径部署，本轮不新增生产基础设施；目标环境的页面 fallback、非页面请求不被错误 rewrite 以及真实深链接刷新 smoke test 是生产启用的 release gate，不能以开发/预览通过或文档提醒代替。

第三轮讨论确认：

- **Q12：显式父子扩展。** 跨 owner 的匹配空间重叠默认拒绝，但允许显式授权的 parent/child contribution。Child Route 通过 `parentRouteId` 引用父 Route，并声明相对 path；例如 B 向 A 的 `node-detail`（`/clusters/:cluster/nodes/:node`）注册 `alert-messages`，属于合法扩展。授权机制见 Q17，同 owner 规则见 Q22。
- **Q13：组合后匹配。** Host 固定受支持 grammar 的大小写不敏感、尾斜线等价、整段动态参数及末尾 `/*` 语义，query/hash 不参与 ownership；相对 child path 先组合再规范化，保留 parent 归属。选择这些路径语义不等于复制 RR ranking；它们与固定版本执行器的兼容性由测试维护，而非随库内部实现自动改变。
- **Q14：上下文参数导航。** 本轮不扩展 Navigation 参数契约。Host 根据明确的 Route ancestry 复用可以满足目标的 ancestor params；仍缺少必填参数时，该 Navigation 当前不可导航并报告 diagnostic。详情子导航和 Tab 使用同一解析规则；Q19 补充允许复用 sibling 共同已匹配 ancestor 的参数。
- **Q15：Route Context。** 采用 `{ routeId, pathname, params, search }`；Child Route 的 params 包含父参数与自身参数，例如 `node-alert-messages` 可取得 `{ cluster, node }`。Restricted 叶 Surface 采用 context 变化即 remount，不新增实时同步协议；此规则不得导致持续匹配的父 Layout 随 child 切换被卸载。
- **Q16：隔离粒度。** Route Quarantine 的最小单位为冲突 Route Contribution，而非 parent namespace。两个插件向 `node-detail` 贡献同一个 `alert-messages` 时，隔离这两个 child contribution，不判废 A 的整个 `node-detail`；依赖失效与回退规则见 Q21。

第四轮讨论确认：

- **Q17：扩展点与授权。** 父 owner 显式开放 Child Route Extension Point 或 Navigation Extension Point，统一 Host Contribution Policy 决定具体 contributor 是否获准；不建立独立的 Route/Navigation 两套策略配置面。父引用不是授权凭据，平台 trust/installation 治理入口可复用，但不复用 Bridge action permission 语义，也不建立任意 UI 注入位置。
- **Q18：嵌套组合。** 命中 child 后父 Layout 保持挂载，child target 通过父 Layout 的 `<Outlet />` 渲染。本轮采用 Host realm 的 Builtin Layout，Restricted Surface 作为叶 target；不新增跨 realm 的子 UI 容器或额外 slot protocol。
- **Q19：sibling 参数继承。** 允许复用当前与目标 Route 共同已匹配 ancestor 声明的参数，禁止把当前 child 的专属参数仅因同名传给 sibling。例如 `node-alert-messages` 与 `node-events` 可以复用 `node-detail` 的 `{ cluster, node }`。
- **Q20：child path 约束。** child 使用非空相对路径，禁止绝对路径以及 `.`、`..` 路径段；带尾部通配的 Route 不再接 child；整条 ancestry 中参数名必须唯一，避免覆盖父参数。首期不引入空路径/index child contribution。
- **Q21：失效传播。** 父 Route 缺失、成环或不可用时，依赖它的后代标记为不可达并报告具体原因，不扩大为整个插件失败。冲突 child 的地址显示诊断，不回退到更宽的通配；合法父页面及不受影响的其他 child 继续工作。
- **Q22：同 owner 覆盖。** 同 owner 仅允许 Host 明确定义的 deterministic specialization：受支持 grammar 下存在严格包含关系，由更窄匹配空间承担对应 URL。等价或互不包含的交叉重叠仍 quarantine；不以 RR score、RR 能否选出 winner 或声明顺序定义合法性。不同 owner 即使都获准扩展同一 parent，也不自动获得覆盖彼此的权限。

## Ownership Policy 与执行器解耦

> Host ownership detector 对受支持的 Route grammar 定义稳定、独立的 overlap/inclusion policy；实际 Route 执行由 React Router 负责，并通过固定版本与自动化 compatibility tests 防止两者在支持范围内发生语义漂移。

Host Route Model 负责 grammar validation、ancestry、extension authorization、overlap/containment 与 quarantine，向执行器投影合法的 `RouteObject[]`。React Router 8.3.1 负责 actual matching、history 与 nested rendering；Host 不复制、导入或探测 `computeScore`、`rankRouteBranches` 作为业务规则。

- 对规范化模板使用结构化关系判定，不以有限 URL 抽样证明相交、不相交或包含；需要例证时由结构化结果构造 witness URL。
- `/clusters/current` 的匹配空间严格包含于 `/clusters/:id`，同 owner 可按 specialization 使用；`/:a/b` 与 `/a/:b` 交叉且互不包含，拒绝。
- 对一个 URL，合法 same-owner specialization 链应有唯一最窄目标；等价目标不能用注册顺序打破平局。授权 ancestry 表示同一 nested 匹配链，不作为相互竞争的叶目标。
- 支持整段 `:param`，不隐式放行 `:id.json` 等部分动态段、可选段或自定义 matcher。RR 接受某种语法，不代表 Host grammar 也接受。
- 固定路径规范化与编码契约，并以兼容性测试覆盖边界；库升级不能自行扩大 grammar 或变更 Host policy。

两类测试严格区分：

| 测试层 | 测试对象与依据 | 不承担的职责 |
| --- | --- | --- |
| Host ownership policy tests | 结构化 overlap/inclusion/equivalence、授权 ancestry、specialization 与隔离；允许比 RR 更严格 | 不以 RR 选出 winner 证明模型合法 |
| 合法 Route Model compatibility tests | 为 Host 已接受的模型生成 URL，交给真实固定版本 `matchRoutes()`，核对 winner、匹配链与 params 是否符合 Host 预期 | 不以生成样本代替冲突证明 |

补充 property tests，覆盖 owner/parent 组合、同形参数改名、包含与交叉、尾斜线/大小写/编码，以及 Route 注册顺序扰动。发现执行漂移时阻止该升级或实现交付，修复投影或支持范围；不能为迎合 RR 把跨 owner overlap 自动合法化。

## 统一 Extension Policy

- 同一平台治理入口接收 contributor identity、扩展点 owner、扩展类型与目标 identity，供 Route children 和 Navigation container 共用；类型区分不是两套配置来源。
- owner 开放扩展点与平台 policy 授权是两个条件；child/container 引用不能自授权，Bridge action grants 也不能代替扩展授权。
- 接入平台已有 trust/installation 治理入口时复用其配置载体；示例仓库目前没有该策略实现，实施时需要明确接入位置、可信配置来源和兼容迁移，不能宣称现成接口已经存在。
- Navigation 的结构层级、extension authorization、目标 Route 可用性与当前参数能否满足目标分别处理；当前缺参数导致不可导航，不应永久 quarantine 一条结构合法的 Navigation。
- 统一治理范围限 Route 与 Navigation Extension，不将原有 Overview UI Extension 或任意 UI Slot 纳入新的跨插件 UI 容器协议。

## 生命周期与上下文约束

- Route Context 与 `initialParameters` 分离，前者是 Host 对当前路由的只读快照，后者保留 Surface 原有静态配置语义。
- Restricted 叶 Surface 的 `routeId`、`pathname`、`params` 或 `search` 变化时，取消并清理旧实例，再以新快照挂载；query 变化会重置该 Surface 的临时状态，这是首期不引入更新协议的代价。
- hash 不进入 Route Context，不参与 ownership，也不单独触发 Surface remount。
- 上下文按值比较，不能因普通 React 重渲染产生了新对象就重挂载。
- 不将叶 Route Context 或当前完整 URL 用作整棵路由树、Host Shell 或父 Layout 的重挂载 key。父 Layout 保持正常匹配时持续挂载并响应新参数；其 child outlet 独立切换。
- 离开匹配分支时清理对应 Surface 的加载、BridgeSession 和 Subscription；迟到的异步 mount 不得复活已离开的页面。
- UI Extension 继续归属 Overview，与 Route Surface 独立；本轮不把 Extension 改造成 child Route，也不因路由接入引入新的通用 UI 容器协议。
- remount 的性能代价目前只是待验证假设；在真实 Wujie Surface 测量完成前，不能宣称该代价已被证明可接受。

## Host 解析与隔离规则

1. 读取结构合法的 Route/Navigation 声明及统一 Host Contribution Policy，保留原始 owner、Route ID、parentRouteId 和声明路径。
2. 解析显式 parent graph，检查父引用、环、扩展点、授权及 ancestry 参数约束。不能按贡献到达顺序或 URL 前缀猜测父子关系。
3. 组合相对路径并按 Host 固定 grammar 规范化，结构化分析 overlap/inclusion/equivalence；query/hash 不参与 ownership，RR ranking 不参与治理判断。
4. 在保留 parent 归属的前提下全局检查候选 Route 的匹配空间。授权的父子匹配链不算竞争分支；授权也不豁免 sibling 与其他分支之间的冲突。
5. 按 Q16/Q21/Q22 产生 contribution 级 quarantine、后代不可达原因及具体冲突诊断，再向渲染和导航暴露可用模型。冲突规则不能通过删除候选后让宽通配静默接管原冲突地址。

结构校验和既有全局 ID 唯一性仍属于 Runtime 的原有契约；新增的 Host 路径、授权、parent graph 和匹配空间错误不得直接转译为插件整体 Bootstrap 失败。Route Context、导航参数解析与 quarantine 都不改变合作式隔离的安全模型。

## 分层封闭状态与统一 Inspection

每层用自己的封闭结果模型，UI 消费结果，不在各页面重新拼条件推导状态；以下是目标模型，不是对现有 Runtime enum 的直接重命名：

| 层 | 状态模型 | 责任 |
| --- | --- | --- |
| Contribution 解析 | `AVAILABLE / QUARANTINED / UNREACHABLE` + diagnostic code | 结构化治理结果与祖先失效原因，覆盖 Route/Navigation |
| URL resolution | `MATCHED / NOT_FOUND / CONFLICT` | 当前 URL 的解析结果，不混入启动或挂载状态 |
| Surface 呈现 | `MOUNTING / MOUNTED / ERROR` | 挂载请求开始后的呈现；未挂载/清理仍由独立生命周期表达 |

Startup/loading 属于 Host 启动层；Runtime `ACTIVE/SKIPPED/FAILED` 继续表达插件 bootstrap 事实。Surface 既有 adapter 生命周期与错误细节保留，不为凑齐一个大枚举而抹平差异。

Inspection 保持两条独立轴，但 API 和 UI 提供同一插件下钻入口：

```text
plugin A: runtimeState = ACTIVE
  route node-alerts: contributionState = QUARANTINED
    code = ROUTE_CONFLICT
  route node-events: contributionState = UNREACHABLE
    code = PARENT_QUARANTINED
```

- 用 `ownerPluginId + contribution kind + contributionId` 关联 Runtime 声明、Host 解析状态、父引用、完整声明路径和诊断；保留被隔离的贡献，而非只列生效 RouteObject。
- diagnostic codes 封闭定义；至少区分冲突、父缺失/被隔离、环、扩展点未开放、平台拒绝和目标缺参数。相关贡献 identity、原因链和安全的冲突例证支持定位，不暴露函数、原始敏感 payload 或完整策略机密。
- inspection 增加可选的、与 React Router 无关的 Host contribution 事实来源；旧调用仍正常。Host 解析尚未运行时应表达“尚无该轴结果”，不能把缺数据当作 `AVAILABLE`。
- Navigation 与 Route 的诊断在同一 owner 视图关联；Context 缺参等瞬时导航诊断与结构/授权状态分开，避免误报插件失败。

## 当前事实

- Host 当前固定选取 KubeEye Route，并通过手动按钮挂载 Surface，没有根据 URL 选择页面，也没有渲染 Navigation。
- 已注册的页面包括 builtin 的 `/clusters/current` 与 Restricted Plugin 的 `/kubeeye`。
- Runtime 根据 Route ID 判重，并有测试明确保留重复 path；Host 的匹配空间歧义检测尚未实现。
- Runtime 对 Route path 仅要求非空字符串；未限定绝对路径、动态参数或通配符语义。Navigation 会校验引用 ID 存在，但没有父子环检测；返回值是按 order、owner、id 排序的平面列表。
- 当前 Route/Restricted Route 没有 `parentRouteId`，Navigation 的 `parentId` 不能替代它。Restricted Manifest 拒绝未知字段，因此需要明确扩展 Route 元数据契约，并在解析、normalize 和 inspection 投影中保留该字段；仅修改 Host 不足以接收示例声明。
- 现有权限模型用于 Bridge action，没有父 Route 扩展授权策略。Runtime 的贡献注册按插件原子提交；Host 的 contribution 级 quarantine 不能直接套用插件整体 SKIPPED 的失败机制。
- 当前 Host installation snapshot 只有 records/activeVersions，使用浏览器 localStorage 持久化；未发现统一平台 policy、policy revision 或迁移逻辑。它不是已经实现的统一信任决策面。
- inspection 的 contribution 数组已有 ownerPluginId，可按插件关联，但缺少 Host availability/diagnostic 轴；外部 source 当前仅提供 Surface instances，需要扩展并保持旧调用兼容。
- 仓库未发现 CI workflow、Node 版本硬检查或 `.npmrc`；目前仅有 `engines.node >=22.12.0` 声明。
- 当前没有独立 SDK 包或 feature negotiation。Host API 标识与 Bridge protocolVersion 均精确匹配；旧 Manifest validator 会拒绝新字段，不能假定新插件可直接交给旧 Host。
- Wujie 当前关闭 URL 同步和保活；现有 Bridge 未提供 Host 导航能力。
- Surface 初始参数只在挂载时注入，没有更新参数接口。现有挂载组件具有取消和清理逻辑，但路由命中后的自动挂载尚未实现。
- Restricted Surface 的现有 props 仅含 JSON 元数据与 Bridge 描述，没有承载 React children、Outlet 或跨 realm 子 UI 的契约；父子 Route 的渲染含义不能从 path ancestry 自动推定。
- 仓库内未发现生产部署配置，现有浏览器测试使用开发服务器，不能据此认定生产环境支持深链接刷新。

## 决策树状态

- 页面模型、Host Shell、Overview 与 Nested Layout：已收敛。
- 路径语法、父子关系、Route/Navigation Extension Point 与统一 Host Contribution Policy：已收敛。
- 参数继承、Navigation 解析、叶 Surface 生命周期：已收敛。
- 独立 Host ownership policy、最小 quarantine、分层状态与统一 inspection：已收敛。
- 加载/错误/404、History URL、根路径部署与生产 fallback gate：已收敛。
- 本轮不做 SSR、路由数据层、双向 URL 同步或任意 UI 容器协议：已收敛。
- 实施顺序、真实性能验证、Node CI gate 与兼容 rollout：纳入计划，尚未执行。具体环境性能预算在测量准备时记录，不虚构已达标结果。

仅将已确认且有长期架构影响的取舍记录为 ADR；不将待决问题或普通依赖安装单独记为架构决策。

已记录 ADR：仓库 `docs/adr/0001-host-route-ownership.md` 至 `0006-production-routing-release-gate.md`；本轮收口新增 0003–0006，分别记录独立 ownership policy、统一 Extension Policy、双轴统一 inspection 与生产 gate。

## 实施组织

按 codebase-design 的集中职责原则，将贡献解析、父子关系解析、授权判断、匹配空间检测、导航目标解析及 diagnostic 汇聚在 Host 的 Route Model Module 中，让 Shell、菜单/Tab 和 Surface 跨同一 Interface 使用结果。Runtime 保留与 React Router 无关的声明元数据；Quarantine 与 ancestry 无法满足等 Host 集成结果不直接复用插件 Bootstrap 失败状态。

技术落点是在 Rsbuild 下使用精确版本 React Router 8.3.1 的 Declarative Mode，保留既有数据职责；Nested Route/Outlet 不需要迁移 Framework Mode。Route/Navigation 的 schema、SDK 声明、normalization 与 inspection 是独立的跨包 contract 交付物，不归为单纯 Host implementation；具体字段命名与文件拆分在实施中保持最小必要变更。

### 真实性能验收

使用生产构建、真实 Restricted/Wujie Surface，分开记录首次 mount（标明资源冷缓存条件）、再次 mount、params 切换和 query 切换，不以 mock 或单次调用耗时推断体验。

- 记录导航/挂载触发、旧实例清理完成、Bridge ready、首个有效内容可见等时间点；`mount()` resolve 不直接等同于用户可见完成。
- 每种场景报告样本数、原始样本、p50/p95、失败/取消数，并标明设备、浏览器、网络、缓存和构建版本；小样本不得伪装成稳定分位数。
- 同时检查 loading 是否及时出现、持续多久、有无白屏/闪烁，以及快速切换取消是否正确。父 Layout 保持挂载的状态也纳入检查。
- 测量准备时记录目标环境与体验预算；本设计不臆造毫秒阈值。没有真实结果和验收依据时，不得把 remount 描述为性能已可接受。
- 不预先增加 Route Context update、keep-alive 或新同步协议。若实测不满足预算，再根据瓶颈证据决定优化 Wujie 初始化、引入 update 或保活，并单独评估语义变化。

### Node 与依赖 gate

- 将仓库 `engines.node` 提高到 `>=22.22.0`，CI 在依赖安装/构建前显式检查实际 Node 版本，不满足时以非零退出码阻断；仅声明 engines 或配置 setup-node 不算硬 gate。
- 增加该 gate 的正反例验证，并在受支持 Node 环境运行相关测试。仓库当前没有 CI，此检查必须进入实际 CI 流程，不能只添加一个无人调用的脚本。
- `engine-strict=true` 是可选的安装策略，不是 CI gate 的替代品；本轮不默认启用它，以免未经评估把整个依赖树的 engine 不兼容都升级为安装失败。
- catalog/Host 的 `react-router` 使用精确 `8.3.1`，不使用 caret/tilde；升级作为显式变更，重新核对 baseline、Host policy tests、真实 matchRoutes compatibility tests 和关键浏览器路径。

## 生产启用 Release Gate

代码构建完成不等于 routing capability 可在生产启用。目标环境（实际域名、路由前缀和部署配置）需要提供以下证据：

- 直接打开并刷新一个真实嵌套/参数化深链接，确认服务器返回 Host 页面入口、应用恢复到正确 Route；开发/preview 的结果不能替代该 smoke test。
- API、plugin artifact、JS/CSS 等静态资源返回预期响应、状态与内容类型；相应缺失资源也不能被错误 rewrite 成 Host HTML。
- 记录环境、应用/配置版本、测试路径、时间与结果；影响 fallback 的环境或部署配置改变时重新验证。
- 由发布流程检查 gate 结果，未通过或无目标环境证据时保持 capability 关闭，不以文档提醒替代 enforcement。

基础设施配置可由其他仓库或团队完成，本轮只交付可执行验证与接入发布 gate 的要求，不擅自修改生产基础设施。

## 跨包 Rollout 与兼容窗口

这里的 SDK 指插件作者使用的声明/类型契约；当前仓库尚无独立 SDK 包，不假定已有发布或协商机制。

1. **先交付兼容 contract。** 发布可接受旧声明的新 schema/SDK/runtime normalization 与 inspection；新增 parentRouteId、Route/Navigation Extension Point 等字段可选，省略新字段的旧声明仍可读取。旧 inspection 调用可继续使用，尚无 Host 轴结果不伪报 AVAILABLE。
2. **再交付 Host。** 发布 Route Model、统一 Contribution Policy、Router 与双轴 inspection UI。默认保持生产新能力关闭；完成本地/CI/compatibility/真实 Wujie 性能验收，接入平台现有治理配置。若既有跨 owner Navigation 引用需要迁移为显式扩展授权，先完成兼容盘点与经平台确认的迁移，不用默许所有 contributor 或静默全拒绝代替迁移。
3. **再升级插件声明。** 确认目标 Host/validator 支持新 contract 后，插件才升级 SDK 并声明 child contribution/extension points；不要求所有旧插件同时升级。旧 validator 是 closed schema，不允许把新字段直接投给旧 Host，也不假定未知字段会被忽略；契约支持检查进入安装/发布约束，不能依赖当前并不存在的自动 feature negotiation。
4. **最后按环境开启。** 目标环境完成生产 fallback gate、真实深链接 smoke 和非页面 rewrite 检查后，发布流程才允许开启 routing capability。

兼容矩阵至少覆盖：旧插件配旧 Host 不受影响、旧插件配新 contract/Host 继续正常、新插件配支持新 contract 的 Host 成功、旧 Host 对新字段的发布被前置阻止。关闭能力与回退 schema/runtime 不是同一动作：已安装新声明时应先保留可读这些声明的兼容运行时；如需退回旧 validator，先回退插件声明/安装版本，避免旧 validator 将新插件整组拒绝。

## 验收清单

- Overview、内置 `/clusters/current`、Restricted `/kubeeye` 均通过统一 Route 模型访问；Navigation、深链接、刷新、前进后退及 404 行为正确。
- Route/Navigation Extension 共用同一治理入口；跨 owner 的显式授权 child 可加载，未开放扩展点、policy 拒绝或无父引用的前缀模拟均不能绕过规则。
- 静态/动态/通配、大小写与尾斜线等价、参数改名后的等价模板、交叉模板，以及跨 parent 的完整路径冲突都有覆盖；不能仅以字符串判重或有限 URL 抽样代替匹配空间判定。
- Host policy tests 与合法模型的真实 `matchRoutes()` compatibility tests 分开；固定版本升级、property cases 与顺序扰动验证不会把 RR 内部 ranking 变成 Host policy。
- sibling Tab 可以复用共同 ancestor 的参数；缺少目标必填参数时不可导航，有 diagnostic，且不从无关 Route 或 sibling 专属参数中借值。
- child 切换时父 Layout 的实例/本地状态保持；叶 Surface 接收正确的祖先和自身参数，context 改变时安全重挂载。
- 两个冲突 child 被隔离，父页面和合法 sibling 继续可用；缺失父、环和不可用祖先产生可解释的不可达状态，不误改插件 ACTIVE。
- inspection API/UI 可从 ACTIVE 插件直接下钻到其 Route/Navigation 的 QUARANTINED/UNREACHABLE 与原因链；Startup、URL resolution 和 Surface 呈现分层测试。
- Surface 挂载失败、重试、导航离开时取消、迟到挂载清理，以及独立 BridgeSession/Subscription 的既有测试语义继续成立。
- 因 Home cards 留在 Overview、Route Surface 移到对应页面，现有依赖同屏手动挂载的 E2E 需要调整；以受控测试 fixture 保留 Route/Extension 同定义独立实例与失败隔离覆盖，不向正式页面额外加入通用 UI slot。
- 真实性能报告包含首次/再次 mount、params/query 切换的样本、p50/p95 与用户可感知 loading；不能仅凭“采用 remount”就标记性能验收完成。
- Node CI 硬 gate 与精确依赖锁定生效；跨包兼容窗口及安装/回退路径有测试。
- 开发服务器和构建预览分别验证深链接刷新；生产启用必须有目标环境 fallback/rewrite 排除检查与真实深链接 smoke 证据，gate 未过时能力保持关闭。本轮不创建生产基础设施。
- 执行相关单元测试、`pnpm typecheck`、`pnpm build`、浏览器 E2E 与文档构建，报告实际结果及未覆盖环境。

## 匹配空间讨论依据

以下是 React Router 8.3.1 的行为核查，不是已确认的 Host ambiguity 策略：

- `/clusters/current` 与 `/clusters/:id` 在 `/clusters/current` 上重叠，React Router 可通过分支评分选中静态路由。
- `/:a/b` 与 `/a/:b` 在 `/a/b` 上交叉重叠，同分的兄弟分支可依赖声明顺序决定赢家；参数名不同也不代表匹配空间不同。
- `/kubeeye/*` 包含 `/kubeeye`、`/kubeeye/` 以及后续子路径；不能把尾部通配理解为只匹配非空子路径。
- 默认匹配不区分大小写，尾斜线也不会天然分离匹配空间。Host 固定自己的支持范围与 policy，由真实执行器的兼容性测试防止该范围内的语义漂移，而非复制内部评分。
- `matchRoutes` 返回选中分支的匹配链，并非所有重叠 Route 的列表，不能用其返回数组长度判断 ambiguity。

参考：[8.3.1 分支匹配与评分源码](https://github.com/remix-run/react-router/blob/react-router%408.3.1/packages/react-router/lib/router/utils.ts)、[8.3.1 匹配测试](https://github.com/remix-run/react-router/blob/react-router%408.3.1/packages/react-router/__tests__/matchPath-test.tsx)、[matchPath 默认值](https://reactrouter.com/api/utils/matchPath#pattern)。

## 版本核查

2026-09-04 核查时，React Router 官方最新版本为 8.3.1；v8.0.0 于 2026-06-17 发布，基线要求包括 Node 22.22.0+、React 19.2.7+，并移除了 `react-router-dom` 包。现有 React 19.2.8 与本机 Node v24.14.1 满足要求，仓库 `engines.node` 声明仍为 `>=22.12.0`，实施时需要提高并新增 CI 硬 gate。

官方将“动态参数带静态扩展名后缀被错误计为静态段、导致排名错误”的修复 #15273 列于 **8.2.0（2026-07-08）**，不是讨论中提到的 8.3.0；这支持了不复制内部 ranking 的风险判断，但不改变本轮仅支持整段参数的 grammar 范围。

参考：[React Router 发布说明](https://reactrouter.com/changelog)、[接入模式说明](https://reactrouter.com/start/modes)。Framework Mode 的 Vite 集成不是本轮已经决定要采用的方案。

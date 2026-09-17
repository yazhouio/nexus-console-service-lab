# 插件契约与文档自动生成：基于实现的可行性评估

日期：2026-09-08。基线：`c4490fdc2e58db6cdabc216c32380866892486a7` 及当前工作区。评估对象：[设计文档](/Users/yazhou/code/nexus-service/spec/插件契约文档.md)。本次只新增研究报告，不修改代码或原设计文档；工作区原有的 lockfile 修改不属于本次研究。

## 结论

**自动生成契约参考文档、按发行集合聚合扩展点、检查契约变化的需求成立；不需要因此先实现新的统一 Plugin Declaration、独立 Contract Schema 或三个新工具包。**

仓库已有可复用的静态事实：`ExtensionPointDefinition`、`PointProfile`、`RefContract`、`RestrictedPluginManifest`，以及实际执行的 `createPointCompiler`。缺口主要是 Builtin 的 Contribution 元数据仍在 `activate()` 中、文档未连接这些声明、跨仓库发布和发行版本选择没有约定。

建议以“现有声明 → 只读投影 → 文档/发行索引”为第一阶段，针对 Builtin 小范围提取已有类型的数据常量。Restricted 直接复用 Manifest。`plugin-contract.json` 可以是将来的可选传输产物，但既不是当前必要前提，也不应采用设计示例中另一套字段语义。

## 一、当前事实模型与权威来源

必须区分：协议形状由 SDK/校验实现规定；具体协议值由所属 API 包或插件声明；发行集合由 Distribution 选择；当前可用性由接纳和执行状态决定。“唯一来源”适合约束同一事实的维护位置，不等于所有事实必须塞进一个对象。

| 实体 | 当前权威来源 | 已有结构与边界 |
| --- | --- | --- |
| Extension Kind | runtime 的 `ExtensionKind`、声明校验与对应执行实现 | 固定 `route/navigation/action/tab/surface`。不要与 `PluginKind = builtin/restricted` 混淆。不是 Core 插件可新增的 Kind registry；联合类型和校验中的枚举目前有重复文字。 |
| Profile 结构/语义 | `PointProfile` + `createPointCompiler` | 含 `contextSchema/payloadSchema/refParameters/allowedConstraints/allowedPolicyDimensions`。Profile 可选；无 Profile 的 Point 使用内联 Schema。 |
| 当前产品 Profile 值 | `CONSOLE_PROFILES`；Distribution 显式传入 | 共 7 个：4 个 `console-core.*@1`，以及 `list.actions@1`、`detail.actions@1`、`detail.tabs@1`。不是设计示例里的 `resource-detail-actions@1` 等。 |
| Ref Contract | 领域 API 包中的 `RefContract` 常量 | `PLUGIN_REF_CONTRACT`、`RESOURCE_REF_CONTRACT` 含 Schema、traits/predicates；Distribution 汇集，编译器拒绝同身份不同定义。不是插件 Manifest 可自行安装的目录。 |
| Point 声明 | Builtin API 包的 `CONSOLE_EXTENSION_POINTS`、`CLUSTER_EXTENSION_POINTS`；Restricted 的 `manifest.extensionPoints` | 当前两个正式 API 包共 9 个 Point。该数量描述声明目录，不代表某个运行实例全部可用，也不涵盖测试 fixture。 |
| Point owner | Builtin 激活事务的 plugin ID；Restricted manifest ID | Point 定义本身不含 owner；引用使用 `{ ownerPluginId, id, contractMajor }`。文档可从声明容器补上 owner，Runtime 仍从受控注册上下文确定 owner。 |
| Contribution | Builtin 的 `activate()` 注册参数；Restricted 的 `manifest.contributions` | 现有分组是 `routes/navigation/extensions`，后者只包含 action/tab/surface；不是统一的 `{ id, target }`。Action handler 和 surface 实现另有定义。 |
| Plugin Descriptor | `PluginDescriptor`；Builtin `PluginDefinition` 继承它，Restricted Manifest 也继承它 | `id/version/requires/provides/roles/provenance`。`requires/provides` 是 Capability ID 数组。 |
| Restricted Manifest | `RestrictedPluginManifest`、闭合字段解析器与实际发布/安装记录 | 已包含扩展点、贡献、surface/action ID。`provides` 必须为空，Restricted 不能提供 Capability；这不妨碍其声明 Extension Point。 |
| 运行期事实 | 激活事务提交的 ContributionRegistry、Host 的 route/UI/action 接纳结果、调用与挂载状态 | `listExtensionPoints()` 返回编译后的 Point；`inspect()` 提供只读投影。注册成功不等于所有 Contribution 已获授权或执行可用。 |

源码证据：

- [Kind、Point、Profile、Ref 与 Contribution 定义](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/definitions.ts:3)，[编译器](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/point-compiler.ts:6)。
- [Console 公共声明](/Users/yazhou/code/nexus-service/packages/console-core-api/src/index.ts:6)，[Cluster 公共声明](/Users/yazhou/code/nexus-service/packages/cluster-api/src/index.ts:16)，[Distribution 选择](/Users/yazhou/code/nexus-service/apps/console/src/distribution.ts:19)。
- [Descriptor 与 Builtin Definition](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/plugin.ts:6)，[Manifest](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/manifest.ts:29)，[贡献分组与注册接口](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/contribution.ts:82)。
- [Builtin 实际注册](/Users/yazhou/code/nexus-service/packages/console-core/src/plugin.ts:7)，[Restricted 注册](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/bootstrap.ts:626)，[inspection 投影](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/inspection.ts:158)。

### 是否已经有统一 Contract Source

**有共享协议类型和局部静态来源，没有统一、完整、可独立导出的插件声明。**

`PluginDefinition` 只有 Descriptor 加 `activate(context)`，没有 `extensionPoints/contributions` 数据字段；仓库未提供设计中的 `definePlugin/defineExtensionPoint/defineContribution`。`PointContracts` 只汇集 Profile 和 Ref Contract，不能代替完整插件声明。`ContributionRegistry` 是激活结果，包含编译 Point 与 builtin render 引用，也不适合直接作为发布声明。

最接近目标的现有入口是：

1. Restricted：Manifest 已能直接作为声明事实源，Host 由其注册贡献，已经不是“Manifest 与 Runtime 各写一份贡献”。
2. Builtin Point：API 包常量已经被 `activate()` 遍历注册，可直接为文档复用。
3. Builtin Contribution：仍需将现有注册参数中的纯数据部分提取为常量，由原注册路径和文档共同引用。不要为文档运行任意 `activate()`，例如 Cluster 激活内会创建带 Capability 闭包的组件和监听器。

当前示例 Manifest 的创作位置也需要明确：KubeEye 在 Host 的 [kubeeye-installation.ts](/Users/yazhou/code/nexus-service/apps/console/src/plugins/kubeeye-installation.ts:10) 中手写 TS 对象并调用安装记录校验；Restricted 应用的 [Rspack 构建](/Users/yazhou/code/nexus-service/apps/example-restricted-plugin/rspack.config.mjs:5) 只输出 UI/HTML，没有 Manifest 生成步骤。未发现已维护的 TS/JSON 两份 Manifest。实际分散的是 entry/publicPath 等发布参数，而不是一套已存在但待替换的 Plugin Declaration。

当前已经有少量真实重复：`*_EXTENSION_POINT_CATALOG` 再列一次 ref/kind，同时附加 title/description。它们供 Demo 页面展示，并不是完整权威 Contract Registry。应由 Point 声明投影 ref/kind，人工注释只保留文案。见 [Console catalog](/Users/yazhou/code/nexus-service/packages/console-core-api/src/index.ts:34)、[Demo 消费](/Users/yazhou/code/nexus-service/apps/console/src/plugins/extension-demo.tsx:21)、[Cluster 激活闭包](/Users/yazhou/code/nexus-service/apps/console/src/plugins/cluster.tsx:29)。

## 二、哪些能静态生成

| 信息 | 静态可获得程度 | Runtime 或其他输入的边界 |
| --- | --- | --- |
| Kind 名称、协议字段 | 已知、可生成 | Kind 行为由执行实现定义；不能仅从已有 Profiles 推导完整 Kind 集合，否则遗漏没有 Profile 的 Kind。 |
| Profile ID、kind、参数位、Schema 模板、约束、策略维度 | 已有数据可直接投影 | 不表示该 Profile 有实际 Point 或 Slot。 |
| Point ID、major、kind、profile、bindings、声明约束 | API 常量/Manifest 可直接读取 | Builtin 在激活中临时构造的声明不能普遍静态提取。 |
| 最终 Context/Payload Schema、有效约束、绑定的 Ref Contract | 给定 Point 与完整 `PointContracts` 后可调用现有纯编译器生成 | 当前编译发生在 activation 校验中，但计算本身不依赖浏览器、安装状态或实际 Context；无需重新写 Compiler。 |
| owner | 从插件声明容器/发行输入关联 | 不应接受另一份可覆盖 Runtime owner 的手写字段。 |
| Contribution 的 point、kind、ID、label、order、group、条件表达式 | Restricted 已具备；Builtin 提取数据后具备 | 不能只保留 id/target，否则丢失 actionId/surfaceId/tabId、父路由等协议。 |
| Capability requires/provides | Descriptor 可读 | Capability 条件不等于硬依赖；具体 provider 解析依赖发行集合，调用授权还依赖 grants、bridge contract 和执行上下文。 |
| 权限、entry、hostApi、安装版本 | 发布 Manifest 或部署输入可读 | 无法从贡献集合完整推断；enabled/grantedPermissions 属于安装配置，不应由插件声明派生。 |
| 引用关系图 | 可从 point、profile、bindings 和 requires 分别生成 | “引用 Point owner”不能自动变成现有 Resolver 的加载依赖；Resolver 当前只按 Capability 形成依赖边。 |
| Contribution 接纳、可见/禁用、执行成功 | 静态只能预检，不可声称实际结果 | Host policy、实际依赖激活结果、Context、权限和 surface/action 实现均参与。 |
| Slot occurrence、contextKey、selection、调用与挂载实例 | 不能静态生成真实值 | 保留 Runtime inspection。 |
| 完整语义兼容性 | 只能生成结构差异与保守诊断 | 行为变化、业务约束和授权变化不能靠 JSON 相同或 major 相同证明兼容。 |

编译器会替换 `$refContract` 参数、收窄约束，并将 selectedRefs 上限约束到 100，见 [编译过程](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/point-compiler.ts:59)。`ContextSchema` 是受限的内联 JSON Schema，不存在设计中独立 `context: '…@1'` 所需的 Context Contract ID 目录，见 [Schema 校验](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/schema.ts:3)。

现有 `createPointCompiler` 是内部模块，包入口只导出 `PointContracts` 类型。如果外部插件构建工具需要调用它，最小改动是增加受支持的纯编译导出或构建入口，不是复制实现到新包。见 [公开入口](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/index.ts:114)。

## 三、与设计文档逐项对照

“可直接实现”表示可以基于现有抽象增加薄工具，不表示功能已经存在。混合章节拆分标记。

| 设计位置 | 判断 | 根据当前实现应如何处理 |
| --- | --- | --- |
| §1 背景 | 需要调整 | 文档漂移风险成立；不能将所有插件描述为 Manifest/Runtime 双写，Restricted 已从 Manifest 注册。 |
| §2 目标 1、2 | 需要调整 | 将“唯一声明、完整机器解析”缩为每项事实单源与静态部分可解析，承认 Builtin 动态注册边界。 |
| §2 目标 3–7 | 可直接实现／后续能力 | 参考页、发行索引可增量落地；兼容性、IDE、Marketplace 不应成为统一新模型的理由。 |
| §3.1 Contract 是事实 | 可直接实现 | 沿用既有协议类型作为投影输入；区分声明、编译值、接纳结果。 |
| §3.2 唯一 Plugin Declaration | 需要调整 | 优先复用 Manifest/API 常量；无须以新 DSL 替换 PluginDefinition。 |
| §3.3 自动字段与人工说明 | 可直接实现／需要调整 | 静态表格生成成立；依赖、Capability、Context 要按上表细分，不能承诺全部推断。 |
| §4 Kind/Profile/Point/Slot | 当前仓库已经具备／需要调整 | 模型基本存在；Profile 可选，Contribution 是指向 Point 的关系，且可以来自 Point 自己的 owner。不要限定为“其他插件”。 |
| §5 definePlugin 示例 | 不建议实现（按原样） | 新 helper 无现成实现，字段与闭合校验器不兼容；更适合提取已有类型的常量。 |
| §6 plugin-contract.json | 需要调整 | 可选可重建传输投影；Restricted 直接消费 Manifest，Builtin 后续需要 JSON 才导出。不要用 `provides` 承载 Point。 |
| §7 Contract Compiler | 当前仓库已经具备（Point 部分）／需要调整 | 复用 createPointCompiler；缺少导出/收集入口，不是缺少整个契约编译架构。任意 TS AST 扫描确实不适合作为主入口。 |
| §8 Core Contract | 需要调整 | Kind 由 runtime 支持；Profile/Ref 来自 API 包，Distribution 决定可用目录。导出 JSON 可以有，不能只导出 kinds/profiles 而遗漏领域 Ref Contract。 |
| §9.1 Type/Profile Reference | 可直接实现 | 展示实际 7 个 Profile、模板与参数位；实例化 Ref/Context 放到 Point 页。Capability requirement 不能从 allowedPolicyDimensions 虚构。 |
| §9.2 Global Registry | 可直接实现（给定明确输入集合） | 对现有 9 个正式 Point 可先做；跨仓库发现、发行版本选择需要补协议。 |
| §10 插件 API 文档 | 可直接实现（已静态部分）／需要调整 | Builtin contributions 未提取前标注覆盖范围，不生成“完整”假象；依赖图分 Capability 依赖和扩展引用。 |
| §11 Collector 架构 | 需要调整 | 文档消费聚合数据合理，但缺少输入来源、版本锁定、发布与缺失处理。无需先要求所有插件统一新 Contract 文件。 |
| §12 extension-registry.json | 可直接实现 | 仅为派生索引；记录发行身份、插件版本、来源和完整性，禁止进入 Runtime 注册输入。 |
| §13 Point Validation | 当前仓库已经具备（主要规则）／需要调整 | 复用 assertPoint、createPointCompiler；Context ID 存在性无现有实体可检查。冲突要遵守现有 owner/ID 作用域。 |
| §13 Contribution Validation | 当前仓库已经具备（运行期规则）／需要调整 | 形状校验与 admitContribution 可复用；target 存在性需要完整目录，route/导航还依赖父子树及根 Point，实际授权仍由 Host 判断。 |
| §13 Cross Plugin Validation | 需要调整 | 当前 Capability 是显式 major 身份，没有通用插件 semver range 依赖模型。Point/Profile 是精确契约断言，不做结构兼容推断。 |
| §14 CI | 可直接实现／需要调整 | 添加确定性生成与验证；目前没有这些 generate/collect 命令。已有版本 gate 不足以充当完整验证。 |
| §15 Contract Diff | 部分当前仓库已经具备／需要调整 | 安装存储已比较相同 Point major 的原始声明；发行级历史 Diff 尚缺。比较原始声明及解析后依赖，不能只比较 profile 字符串。 |
| §16 Manifest 派生 | 部分当前仓库已经具备／需要调整 | Restricted Runtime 已从 Manifest 派生贡献；发布 JSON 可从共享 TS 数据加部署输入生成。Builtin 不需要被迫产生 Restricted Manifest。 |
| §17 Runtime 边界 | 原则可直接保留／时序需要调整 | Bootstrap 事务提交后 ready=true；Host 之后还构建 route/UI/action 接纳模型。不要画成一条涵盖全部接纳的严格直线。 |
| §18 动态安装与 Inspector | 当前仓库已经具备（Inspector/安装）／需要调整 | 当前安装变更 reloadRequired；不是 Ready 后热注册。RuntimeSnapshot 是诊断投影，有意省略字段，不能直接充当发布 Contract Schema。 |
| §19 三个新包 | 不建议当前实现 | 现有 runtime/API 包拥有协议；先脚本和文档入口，出现跨仓库实际复用后再决定工具包边界。 |
| §20 Explorer/依赖图 | 部分当前仓库已经具备／可直接实现 | Demo 已有手工 Point Gallery，Inspector 已存在；可用生成数据逐步替换展示。 |
| §20 Dead Point / Orphan | 需要调整 | 0 contribution 仅代表给定集合无人贡献，不证明 Point 无用；缺失 target 在开放插件集合中应标未解析，完整发行集合才能严格报错。 |
| §20 自动证明兼容、IDE、Marketplace | 不建议作为本轮前提 | 兼容性先保守 Diff；IDE 已有 typed Point ref 常量可复用，无需先改成字符串 target。 |
| §21 实施顺序 | 需要调整 | 先现有声明投影和 Builtin 缺口，再发行聚合，最后 Diff；不要先统一新 Metadata 模型。 |
| §22 最终模型 | 需要调整 | 多个已有声明入口共享原有类型和编译规则；统一投影，不强求统一插件创作 DSL。 |

### 设计示例存在的具体协议冲突

- Point 的 `version: 1` 应是 `contractMajor: 1`；插件 `version` 是另一个概念。
- `refContract` 应表达为 `bindings: { itemRefContract: '…@1' }`，Profile 可以有参数位，不应压平为一个固定 Ref 字段。
- profiled Point 不能再声明 `contextSchema/payloadSchema`，更没有 `context: '…@1'` 字段；Schema 从 Profile 与 bindings 编译出来。
- Contribution 使用结构化 `point`，不是字符串 `target`；现有 RouteContribution 的 `target` 已表示执行/渲染目标，重用该名字会冲突。
- action/tab/surface Contribution 必须保留 kind 和执行 ID 等字段；设计中的 `{ id, target, description }` 不足以注册或校验。
- Point/Contribution 顶层 `description` 当前会被闭合字段校验拒绝。文案可沿用 catalog/按身份关联的注释；Schema 内部已有 description 支持，不应混为同一权限。
- Descriptor 的 `provides` 已有 Capability 语义，不能换成 Point 数组；Manifest 不存在统一 `capabilities` 字段。

上述限制由 [assertPoint/assertExtensionContribution](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/definitions.ts:70)、[Manifest 闭合校验](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/manifest.ts:403) 和 [admitContribution](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/admission.ts:4) 实施。

## 四、风险与验证边界

1. **新增第二套权威模型。** Plugin Declaration、Manifest、contract JSON 若各允许独立改写，同一事实会多源。JSON 作为不可编辑产物不会自动产生权威冲突，但独立 schema、字段重命名和另一套验证器仍会增加同步成本。
2. **导出范围不足却声称完整。** Builtin activation 未静态化、测试开关和平台注入未计入、商店 catalog 被误当安装集合，都能生成看似完整但不真实的“全局”目录。应公开声明覆盖范围。
3. **编译声明不等于实际接纳。** Bootstrap 的 ContributionRegistry 还没有完成全部 Host 关系接纳；route、UI、action 后续分别判断 policy 与目标关系。见 [BrowserHost 组合过程](/Users/yazhou/code/nexus-service/packages/browser-host/src/App.tsx:22)、[UI 关系编译](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/ui/runtime.ts:146)、[route 接纳](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/routing/route-model.ts:47)。
4. **版本概念混淆。** 插件版本、Point contractMajor、Profile/Ref/Capability ID major、目标 contributionContractVersion、导出格式版本是不同轴。Resolver 依赖 Capability 精确身份，没有一般 semver range 求解。见 [Resolver](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/resolver.ts:131)。
5. **现有冻结不是完整发行兼容检查。** InstallationStore 比较同插件/Point/major 的整个原始 Point JSON，不会展开外部 Profile/Ref 内容，也不覆盖所有 Builtin 历史发布。更换同 ID 的目录内容仍需要 release baseline 比较。见 [冻结检查](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/installation-store.ts:85)。
6. **验证器重复或语义错用。** `admitContribution` 含授权，不能在静态工具传一个“允许全部”的 policy 后宣称实际可用。可复用其结构检查代码，但应明确结果是预检；必要时仅提取纯检查小函数。校验 Route/Nav 还必须复用现有父子关系、根 Point 与路径规则。
7. **身份作用域被新 Registry 改写。** Runtime 的 Point、UI extension、surface、action 按 owner+id 分库；route/navigation 各自是全局 ID 集合。Point registry 当前按 owner+id 存储，不支持同一个 owner/id 同时注册多个 major；发行历史可以索引 major，但不能因此宣称 Runtime 支持并存。见 [registry 与冲突检查](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/contribution.ts:250)。
8. **静态声明无法验证任意执行实现。** Handler 存在性、surface ID 对应关系可以做专门检查；动态行为、权限与运行输入仍需原有测试和运行期检查。发布系统不要在文档站进程直接执行第三方插件 activation。
9. **不能把严格文档检查悄悄变成安装新约束。** 当前 KubeEye 显式声明 `kubeeye-unused`，指向不存在的 `console-core/unavailable`，见 [示例声明](/Users/yazhou/code/nexus-service/apps/console/src/plugins/kubeeye-installation.ts:34)。安装形状校验可通过，运行时关系诊断处理不可用。发行检查可以报告孤立贡献，但应明确这是发行质量策略；若作为失败门禁，需显式决定如何处理这些演示或可选声明，而不是修改 Runtime 为一律拒绝整个插件。

现有 `check:plugin-contract` 只调用 `assertContributionContractCompatible`，检测旧目标是否支持某些新字段，不检查完整 Manifest、所有 target、契约历史或发行依赖。见 [脚本](/Users/yazhou/code/nexus-service/scripts/check-plugin-contract.mjs:1)、[版本 gate](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/contribution-compatibility.ts:6)。现有 CI 是 typecheck/test/build/e2e，不包含文档契约生成检查，见 [CI](/Users/yazhou/code/nexus-service/.github/workflows/ci.yml:17)。

## 五、推荐架构与最小改动方案

沿用现有包的职责：runtime 定义协议与校验；领域 API 包声明 Profiles/Refs/Points；插件定义自身贡献；Distribution 选择发布组合；Docs 只消费派生数据。

```text
runtime 原有类型、校验器、Point Compiler
                         ↑ 复用
API 包 Point/Profile/Ref 常量 ─┐
Restricted Manifest ──────────┼─ 只读导出/收集 ─ 发行索引 ─ 文档与 Diff
Builtin 提取的现有类型常量 ────┘
          │ 原注册流程继续引用
          ↓
Bootstrap 事务 → Host 关系接纳 → 执行/输入校验 → 现有 inspect()

发行版本选择与来源清单 ────────→ 收集输入
部署配置 ────────────────────→ Restricted 发布 Manifest
```

最小范围：

1. 先从现有 7 个 Profile、2 个 Ref Contract、9 个正式 API Point 生成参考页；不要求新 DSL 或修改 Runtime 注册语义。
2. 合并 Point 数据与现有 title/description 注释，消除 catalog 的 kind/ref 重复维护。人工文案只关联身份，不覆盖协议事实。
3. Restricted 文档直接读现有 Manifest。Builtin 只提取需要文档化的注册参数，以原有 `ExtensionPointDefinition/NavigationContribution/ExtensionContributionDefinition` 等类型约束；渲染组件和 handler 保留原执行代码。route 的 render 部分通过薄投影剔除，不能假装完整 RouteContribution 是 JSON。
4. 在现有 `scripts` 和 `apps/docs` 增加薄生成/校验入口；外部构建真正需要时公开现有纯 Point Compiler。暂不增加 `@console/plugin-contract*` 三个包。
5. Registry 只保留原协议字段与必要的 owner、插件版本、来源和生成格式版本。聚合索引可以扁平化以便搜索，但不得用扁平展示形状重新定义 Runtime 协议。

### plugin-contract.json 是否必要

**现在不必要；跨仓库需要的是稳定可取得的数据，不是这个文件名或另一套协议模型。**

- 同仓库：直接消费纯声明模块、Manifest 和 API 常量；无需先落一层中间 JSON。
- 跨仓库 Restricted：复用发布 Manifest，加对应版本 API 契约目录即可；不要再发布一份手工 provides/contributes 描述。
- 跨仓库 Builtin：如果不能直接导入受控的纯 API 包，可输出只含已有协议类型数据的 JSON。此时它是传输投影，注明源版本，禁止与注册参数分别维护。
- 编译后的 Point 可用于文档展示与有效契约 Diff，但也要保留原始 profile/bindings；不要把 CompiledExtensionPointDefinition 重新当作原始 Manifest Point 输入，profiled Point 的原始校验不接受重复 Schema 等编译字段。

### Manifest 能否派生

**可以部分派生；完整发布文件可以组装生成，但不能仅凭文档中的 Plugin Declaration 推断。**

可复用/派生：Descriptor 身份与 Capability 声明、extensionPoints、contributions，以及明确声明的 action/surface IDs。不能只从“被贡献引用的 ID”推断全部 action/surface——root/overlay 等入口可能不通过该贡献路径。

额外输入：entry/部署地址、hostApi 兼容目标、permissions 请求与分发信息。安装 config 的 enabled/grantedPermissions 由部署/管理员控制。不要从一次运行观察到的 Capability 调用推断完整权限。

对 Restricted，Manifest 本身已经可承担 Plugin Declaration 职责。当前没有构建 JSON 双份需要消除；将来要独立发布时，从现有 Manifest 形状的数据生成发布 JSON，Host 也消费这一数据来源，分环境仅组合 entry 等部署字段。对于 Builtin，保留 PluginDefinition，不强制添加仅适用于 Restricted 的 entry/hostApi/permissions/provides=[] 限制。

### Docs Generator 如何跨插件仓库聚合

当前 `BrowserDistribution` 是运行时组装对象，含 builtins、store factory、policy 等代码；不是可直接 JSON 序列化的发行锁定清单。`catalog` 含多个可安装版本，不能全部当成一个发行实例；BrowserHost 还注入 platform/overlay provider，应纳入 Capability 关系分析。见 [Distribution](/Users/yazhou/code/nexus-service/apps/console/src/distribution.ts:19)、[BrowserDistribution](/Users/yazhou/code/nexus-service/packages/browser-host/src/distribution.ts:9)、[Host 注入](/Users/yazhou/code/nexus-service/packages/browser-host/src/App.tsx:22)。

建议只补以下发布约定，而不改变扩展协议：

1. 每个插件发布精确版本的 Manifest 或纯声明导出；对应 API 包提供该版本 Profiles/Refs/Points。采用团队已有的包或构建 artifact 渠道，无需新 Marketplace。
2. 产品发布流程给出明确插件版本集合及来源引用/摘要；若未来已有 release lock，直接复用，不再维护第二份插件成员表。当前仓库尚缺独立的这类发布清单。
3. Collector 按精确版本拉取或接收构建产物。未知导出格式明确拒绝，不静默解释；不扫描所有 repo 主分支，也不读取“latest”拼发行文档。
4. 先校验单插件字段，再加载发行目录编译 Points、检查引用/身份冲突。完整发行集合中的未解析引用报错；单插件文档中的外部引用保留为 unresolved，并写清验证范围。
5. 聚合键包含发行上下文、plugin ID/version、Point owner/id/major；不同插件版本分别归档。相同发行集合中同 owner/id 的冲突必须报错，不能 last-write-wins。
6. 生成 reference、plugin API、point 页面及可删除重建的索引。缺失 artifact 时构建失败或明确发布不完整结果，不能悄悄少算插件。
7. 工具和 Runtime 使用同一版本的协议校验实现；编译器版本和依赖目录版本进入生成记录。需要 JSON 时只增加传输 envelope，不增加可手改契约事实。

这是一项构建/发布集成工作。当前 Rspress 仅构建本地 Markdown，尚无上述采集器，见 [Docs 配置](/Users/yazhou/code/nexus-service/apps/docs/rspress.config.ts:5)。

现有 [console-core-api](/Users/yazhou/code/nexus-service/packages/console-core-api/package.json:4) 与 [cluster-api](/Users/yazhou/code/nexus-service/packages/cluster-api/package.json:1) 均为 private 包、直接导出 TS 源文件，并使用 workspace 依赖。它们是可复用的数据来源，但不能据此声称已经具备独立版本的跨仓库发布。第一阶段不必先改变这些包的发布形态。

## 六、分阶段实施与验收

| 阶段 | 范围 | 验收与停止条件 |
| --- | --- | --- |
| 0：修正文档 | 将示例映射到现有类型；标明声明/编译/接纳/执行边界；确定首个文档发行集合 | 不要求落地新 helper、schema 或包。本次研究到此，不直接实现。 |
| 1：现有声明文档投影 | 先生成 API Points/Profiles/Refs 与已有 Restricted Manifest 参考；Builtin Contribution 按需提取纯数据 | 不启动应用即可生成；报告覆盖范围；原注册引用相同对象；生成稳定；Kind、bindings、Schema 与 Runtime 编译一致。满足需求即可停止，不以生成 contract JSON 为验收项。 |
| 2：版本化发布与跨仓库聚合 | 接入精确插件/API 版本产物，发行清单和来源；补结构/引用校验 | 同一输入可重建同一索引；缺失/冲突可诊断；catalog 多版本不混合；不改变 Runtime 安装接纳。 |
| 3：保守 Diff 与文档 CI | 对比发行基线、Point 原始与有效契约、Profile/Ref 内容；生成 added/removed/changed 与风险提示 | 相同 Point major 的协议变化必须显式评审；不能自动将所有 changed 判为 compatible。只在产物入库时使用 git diff 检查；不入库则验证生成与构建成功。 |
| 后续按需 | 搜索、关系图、IDE、Marketplace | 用已生成索引，不增加运行期权威。Inspector 复用已有实现，仅补必要展示字段。 |

验证规则分层：单声明形状 → 目录编译 → 给定发行集合的关系检查 → Host 接纳 → 运行输入/执行验证。层间复用原函数和测试，输出明确所属层级，避免“contract validate 通过”被理解为运行可用性承诺。

## 七、建议直接修改的设计文档内容

以下为修订建议，本次未修改原文。

1. **§2/§3 将“Plugin Declaration 是唯一来源”改为：**“每项结构化事实在所属协议包或插件声明中维护一次。文档消费现有 Manifest、API 声明和可静态导出的注册数据；统一投影不要求统一作者 DSL。”
2. **§4 增加可选 Profile 和自贡献说明。** Kind 由 Runtime 定义，Point 可使用 Profile 或内联 Schema；Contribution 引用 Point，可与 Point 同 owner。
3. **§5 替换示例。** 使用真实 `contractMajor/profile/bindings` 与结构化 `point`；保留 `kind/actionId/label` 等必需字段。改成已有类型的数据常量示例，不承诺新增 definePlugin。
4. **§6/§7 改名为“声明导出与可选传输格式”。** 明确先复用 RestrictedPluginManifest 和 PointContracts/createPointCompiler；如跨仓库需要 JSON，保留原字段，只增加来源/版本 envelope。
5. **§8/§9 区分 Runtime Kind、产品 Profile 与领域 Ref Contract。** Profile 页显示参数模板，Point 页显示绑定后的 Schema；不得发明 Context ID registry 或未声明的 Capability requirements。
6. **§10/§11/§12 补充完整性和发行输入规则。** 指定精确版本、来源、缺失处理、单插件开放引用与完整发行验证差异；插件商店 catalog 和当前激活集合分别展示。
7. **§13 将验证拆层。** 引用现有校验器与 scope；删除通用 semver 依赖检查承诺，除非另有需求和模型。静态预检不得替代 Host policy。
8. **§15 补充已有冻结检查与局限。** 既比较原始 Point，也比较相同 ID 的 Profile/Ref 内容与有效 Schema；行为兼容保留人工评审。
9. **§16 将 Manifest 关系改为双路径。** Restricted 的 Manifest 已是声明；Builtin 复用原定义和数据常量。部署输入单独组合，不自动生成安装 grants。
10. **§17/§18 修正时序与 Inspector。** Bootstrap ready 和 Host 可用状态分层；当前安装需要 reload。共享字段/身份/校验语义，不要求 RuntimeSnapshot 与发布声明使用完全相同的 schema。
11. **§19/§21 删除先建三包与先产 contract JSON 的硬前置。** 第一阶段验收是从现有事实生成正确且有覆盖范围的参考文档。
12. **§20 将 Dead Point 改成“给定发行集合中尚无贡献的 Point”。** 保留开放扩展点价值；Inspector 标记为现有能力，IDE 优先复用已有 typed refs。
13. **§22 替换最终图。** 表达多个既有事实源经共享投影汇集，而不是把 Runtime/Manifest/Docs 全部强制迁移到新声明入口。

## 八、验证记录与研究范围

执行了现有测试，未新增或修改测试：

```sh
pnpm --filter @feforgejs/plugin-runtime exec vitest run \
  test/point-profiles.test.ts test/manifest.test.ts \
  test/ui-admission.test.ts test/route-admission.test.ts test/contribution.test.ts
```

结果：**5 个测试文件、38 个测试全部通过**。包括绑定编译/冻结、非法约束回滚、安装版本 Point major 冻结、Context 输入上限和兼容断言不能重新选择目标 Point 等行为。见 [Profile 测试](/Users/yazhou/code/nexus-service/packages/plugin-runtime/test/point-profiles.test.ts:11)。未进行完整 build/e2e，也未验证不存在的跨仓库发布系统。

本报告以当前源码和现有测试为依据；跨仓库发布方式、导出 envelope 和实施阶段是建议，未声称仓库已经具备。分发与文档构建链的补充证据见 [专项调查](/Users/yazhou/code/nexus-service/docs/validation/plugin-contract-distribution-research.md)。

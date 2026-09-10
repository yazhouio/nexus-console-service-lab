# Console Core 插件化设计

状态：2026-09-08，Q1–Q60 目标设计已落到实现；具体入口和验收对应关系见第 8 节。术语见仓库 `CONTEXT.md`，架构取舍见 `docs/adr/0017-console-composition-runtime-boundaries.md` 和 `docs/adr/0018-parameterized-point-profiles.md`。

实现沿用两轮架构消融确认的统一声明真源、准入编译阶段和执行机制复用。整体分层及既有授权、版本与资源寿命约束保持成立。

## 1. 目标与边界（Q1–Q14、Q22–Q23）

Distribution 负责组装，Host 负责启动，Runtime 负责机制，`console-core` 负责 Console 业务。Host 零 Console 业务语义，业务插件通过同一公开协议接入。

| 层 | 职责 | 依赖边界 |
| --- | --- | --- |
| Console Distribution | 固定版本、声明 Core roots 与闭包要求、组装 grants 和 policy bundle、选择根 UI、启动 Host | 可依赖 Host、Builtin 实现与公开契约 |
| Browser Host | bootstrap、browser/history adapter、loading/fatal error、break-glass 诊断恢复 | 依赖 Runtime；不引用具体业务插件 |
| Plugin Runtime | resolver、registry、Route Model、冲突治理、Policy Engine、排序、执行与生命周期 | 不依赖 Console 业务实现或领域模型 |
| Console Core Plugin | Global Layout、Navigation UI、Home、Settings、正常态插件管理、业务 Point | 依赖公开 Runtime/Platform 契约；不导入 Host 私有 Context |
| Console Core API | 扩展点 ID、Profile、版本化类型、贡献构造器 | 不包含 React 页面、Store、Runtime 实现 |

目标物理结构为 `apps/console`、`packages/browser-host`、`packages/plugin-runtime`、`packages/console-core`、`packages/console-core-api`。Feature Plugin 仅依赖公开契约，包括其使用的领域 API；不能通过 `console-core` 实现或 Host 私有 import 接入。通过 workspace 依赖和 lint/依赖检查强制边界。

现有 `console-shell` 直接演进为 `console-core`，设计阶段一次性更改 plugin ID、引用和 grants，不长期并存、不保留双 ID。它是发行版固定版本并保证存在的 Required System Plugin，属于 Core Closure；V1 不承诺卸载、热替换或独立复用。它通过公开协议获得显式授权，不具有私有业务 API 或宽泛启动优先权。

插件分类使用三个独立维度：角色为 Provider / Feature（可重叠），执行边界为 Builtin / Restricted，来源为 First-party / Partner / Third-party。来源和 Builtin 身份均不能自动授予权限；本轮不扩展既有 cooperative isolation 的安全承诺。

## 2. 启动与故障（Q15、Q17、Q19–Q21、Q27–Q28、Q58）

Builtin 与 Restricted 统一声明、组合、治理、生命周期语义，保留不同加载与执行 Adapter。Builtin 继续静态导入、本地 activate，不强制生成 manifest 或进入 Wujie；Restricted 保留 manifest-first 与隔离执行。

Core activation 只做本地声明、依赖、Capability 和 UI 定义注册，并事务提交；网络和业务数据留到页面执行阶段。Runtime Ready 只表示核心声明和协议可用，不等待所有业务数据、惰性制品下载或 UI 挂载。

| 失败 | 处理 |
| --- | --- |
| Core Closure 成员激活失败 | 阻断 Ready，Host 呈现 break-glass |
| 非 Core 插件声明或激活失败 | 隔离该插件，其他条件满足时仍可 Ready |
| 普通 Surface 执行失败 | 限制在相应 occurrence/执行边界，不反转 Ready |
| console-core 根呈现失败 | Console Presentation Failure；Ready 保持单调，Host 切到 break-glass |

Distribution 显式提供 `rootPresentation: { ownerPluginId, surfaceId }`。Runtime 校验 Owner、Core Closure 成员身份和 Surface 声明；Host 经公开执行入口挂载。根声明缺失或执行失败进入 break-glass，Host 不通过硬编码插件名发现根页面。

根呈现与 Builtin Route Layout 通过 Browser Host 的 `ManagedBuiltin` 在 Router 树内承载。Runtime driver 仍创建和结束执行，React adapter 在 commit 后确认呈现，公开 `useRouteContext / RouteOutlet` 给插件使用。父 Layout 在子路由切换时保留状态；独立 Slot 容器仍用独立 `createRoot`。两种承载都使用相同 Scope / Attempt、UiClient 和清理语义，插件不导入 Host Context，也不手动补 owner。

Break-glass 使用独立的最小渲染路径，不依赖插件 Route、主题、Point、Core Capability 或 Runtime 成功启动。允许查看/导出诊断、回退或禁用最近变更的非 Core Restricted 安装配置、清理损坏本地安装状态和 reload；不允许修改 Core pins、grants、静态 policy。正常态插件管理和 Settings 属于 console-core，KubeEye 等插件专属设置由插件贡献。

## 3. 扩展模型与目录（Q18、Q24–Q25、Q30–Q31、Q38–Q39、Q45–Q49）

| 概念 | 职责 |
| --- | --- |
| Kind | Runtime 定义通用执行与生命周期机制 |
| Profile | API 包定义可复用业务语义、Context/Payload schema、允许的策略维度 |
| Point | Owner 实例化接纳声明、绑定契约并收窄约束 |
| Slot | Point 的一次运行时 Placement occurrence，不承载业务语义 |

V1 Kind 固定为 `route | navigation | action | tab | surface`。各 Kind 定义各自的验证、执行与生命周期语义，允许复用已有执行机制；新增 Kind 不意味着新增独立执行内核或 Session 状态机，统一元模型也不要求共用万能 Slot 执行器。Surface 只负责可挂载 UI 内容。优先通过 Profile 和具体 Point 扩展业务，只有新的执行语义才增加 Kind。

Contribution Registry 是贡献与 UI 定义的声明真源，声明通过所属插件的接纳事务提交。Adapter、查询和诊断所需目录只能从已接纳声明派生，不维护另一套注册事务或独立可变声明。当前 `runtime.surfaces.get/list` 已采用只读派生索引；Surface Instance、Scope 和 Attempt 等动态执行事实仍各自按寿命维护，不与声明合并。

公开 Point、Profile 与 Ref 的结构化清单由源码生成，见 [插件契约参考](../generated/plugin-contract/index.md)。

`list/detail` 不绑定 Kubernetes。console-core 只拥有自己的 Point；例如 Cluster 页面 Owner 可将 `list.actions@1` 实例化为自己的节点操作 Point。所有扩展必须明确命名并受治理，不开放任意 Header、Layout 注入或核心页面替换。

Profile 可显式定义 `itemRefContract` 等参数位。Point 绑定已注册 Ref Contract，不能任意修改 Context/Payload；仅允许在 Profile 许可范围内收窄 cardinality、group、排序、尺寸和呈现约束。

## 4. 引用契约、版本与输入（Q34、Q39、Q48–Q50、Q53–Q57）

领域 API 包定义带命名空间的 `contractId@major`、schema 与字段语义；Distribution 汇集，Runtime 验证并冻结。同一身份出现不同定义时拒绝接受，禁止按加载顺序覆盖。

目标是在声明接纳阶段完成 Profile / Ref Contract 的绑定、约束收窄校验和 Point 契约编译，冻结最终 Context/Payload schema 与允许的策略维度。执行阶段消费编译后的 Point 契约并校验每次输入，不在每次 Slot 更新或 Action 调用时重新解释绑定关系。保留原始契约身份、Major 和绑定元数据用于兼容断言、诊断与发布检查；无需为这些静态定义另建可变的运行期管理层。该编译机制由接纳事务中的 `createPointCompiler` 实现。

例如同一个 `list.actions@1` 可分别绑定 ResourceRef@1 和 PluginRef@1；还可使用 AuditRecordRef、UserRef 等领域契约。ResourceRef 包含 `clusterId / apiVersion / kind / namespace? / name / uid?`，clusterId 是稳定不透明集群身份。需要实例身份保证的 Action Owner 必须要求 uid 并经业务 Capability 校验；缺少 uid 时拒绝这类操作。

Point Major 冻结 Profile、Ref Contract 绑定及最终 Context schema；任一变化都升 Point Major，包括可选字段变化，延续 ADR 0012。不同 Point 绑定不同领域契约不要求通用 Profile 升级。

Contribution 只通过目标 `point@major` 选择 Point。Point 是 Profile 和 Ref Contract 绑定的唯一真源；可选 `expectedProfile / expectedRefContract` 仅作 fail-fast 兼容断言，不是第二套选择机制。V1 不推断结构兼容，不自动转换引用。

列表输入使用 `selectedRefs`，详情使用 `itemRef`；同一 Point 的引用服从其绑定契约。最多 100 个引用，并受现有 JSON 大小/节点数上限限制；超限明确拒绝，不静默截断。查询只提供 `filtered`、`matchedCount?` 摘要，V1 不支持“对所有匹配项执行”。Context 仅传版本化可序列化引用和必要摘要，不传 Store、完整对象、函数或 React 值；详细数据经授权 Capability 获取。

## 5. 授权、平台能力与导航（Q9–Q12、Q16、Q20、Q26、Q35–Q36、Q52）

Runtime 实现通用 Policy Engine，Point Owner 定义准入契约，Distribution 提供具体 grants。跨 Owner 默认拒绝，授权目标为 `contributor → point@major`；Major 变化须重新授权。同 Owner 放置仍需通过声明与契约验证。Builtin、First-party、Partner 身份均不代替授权。

V1 policy bundle 静态、版本化，在 Runtime 生命周期内冻结，修改后 reload。Contribution grants 与 Capability 调用权限保持独立语义，不能相互代替。

静态准入在声明接纳完成后编译，执行与观察消费冻结的关系事实；Context、selection、Action 可用条件和每次 Capability 调用权限仍在相应时点处理，不随静态准入一起缓存。当前 Surface UI runtime 创建时快照 Point、Surface 和 Contribution，对每个跨 Owner 关系求值一次无副作用的 policy。policy 求值异常只拒绝相应关系，并在 inspection 中报告 `POLICY_ERROR`，不泄露异常内容或阻断健康贡献；不能通过修改 callback 捕获值或追加声明改变已有 Runtime。Route / Navigation、Action 和 Surface / Tab 均消费相同版本化准入函数；没有旧版无 Point 授权分支。

Platform Capability 按小契约拆分：`routes.query@1`、`routes.navigate@1`、`plugins.query@1`、`plugins.manage@1`、`diagnostics.query@1`、`diagnostics.export@1`、`audit.query@1`。Builtin/Restricted 使用同一 ID、版本、schema 和语义，通过不同 Adapter 调用，权限由 Distribution 显式授予。

`plugins.query` 可查询全部插件；`plugins.manage` 在 V1 只管理可安装的非 Core Restricted 插件。Required System Plugin 和构建期 Builtin 只读，不能 disable、uninstall 或切版。

Route Model、参数校验、冲突与授权属于 Runtime，browser/history adapter 属于 Host，Navigation UI 属于 console-core。获 grant 的 Restricted 插件可按 Route ID 和校验参数导航到可达 Route，并留审计记录。Route Capability 暴露 `routeId / owner / typed params / ancestry`，不暴露原始 pathname、search、history 或任意 URL 跳转。该决定正式取代 ADR 0001 的旧导航限制；统一 Route ownership、ancestry 和插件内部 URL 独立性仍保留，不启用 Wujie URL 双向同步。

## 6. 嵌套菜单与排序（Q24、Q29、Q37）

Navigation 使用多个 Container 和 `id + parentId` 树结构。贡献者知道目标父容器及其公开契约，不必知道兄弟菜单。跨 Owner 的 parentId 必须指向明确发布且获 grant 的 Navigation Extension Point。

Runtime 对每个父节点的直接子项独立按 `group rank → order → ownerPluginId → contributionId` 排序，再递归构建树。Point Owner 定义允许的 group 及顺序、有限整数 order 范围；稳定 ID 兜底使结果不依赖加载顺序。删除 before/after 排序约束，保留父子关系环、缺失父级等结构校验与诊断。

## 7. Action、Tab 与 Session（Q32–Q33、Q40–Q44、Q51、Q59–Q60）

Action 公开声明仅含可序列化元数据和稳定 actionId，不接受函数、ReactNode 或 Host command。Action 不依赖 Surface：Runtime 创建短生命周期 Action Invocation，通过 Adapter 惰性连接 Owner，每次调用持有 invocationId 和不可变 Context snapshot。

Invocation 一次性完成为 `succeeded | failed | cancelled | timed-out`。Runtime 管 timeout/cancel，向 Owner 发尽力取消信号，不自动重试副作用；Owner 可利用 invocationId 实现幂等。取消、超时或连接失败不证明业务副作用未发生，也不承诺回滚；业务结果通过 Capability 查询。

V1 visible/disabled 条件仅支持 selection count、Capability 条件和 Ref Contract 显式公开的稳定 traits/predicates。Runtime 只做有限比较，禁止任意 schema path；复杂领域判断留给 Owner。可用条件不是执行授权。

Tab 声明稳定 tabId、元数据和 Owner 自有 Surface 引用，选中后惰性执行。Tab 默认不是 Route；映射到 URL 由页面 Owner 的 Route 模型决定。V1 切走结束 Tab Execution Scope 并卸载，重新进入创建新 Scope，不支持 keep-alive。

Tab 的执行职责复用现有 Slot selection 与 Surface Scope / Attempt：选中项映射为贡献引用，切走移出 selection，重入建立新执行。这里的 Tab Execution Scope 是所选 Surface 的执行寿命，不是新增 Scope 类型；不建立独立 Tab 执行内核或 Tab Session。Tab Kind 仍负责自己的声明验证和元数据，页面负责交互与可访问性。公开 `Tabs` 组件提供单选、键盘焦点操作和 tabpanel；Builtin 与 Restricted Surface 的真实浏览器测试验证切走卸载及重入新建。

Execution Session 是 Surface Execution Attempt / Action Invocation 的通信寿命上位概念；Restricted Adapter 以 BridgeSession 实现。每个 Session 只归属一次执行，不建立永久 plugin-wide session。既有 Scope / Attempt / occurrence / DOM Anchor 的身份和资源所有权区分继续成立。

## 8. 现状、迁移与验收

当前物理边界为 `apps/console`、`packages/browser-host`、`packages/plugin-runtime`、`packages/console-core`、`packages/console-core-api`，并以 `packages/cluster-api` 演示独立领域引用契约。旧 `apps/host` 已移除，运行时只使用 `console-core` ID。

| 实现入口 | 已实现行为 |
| --- | --- |
| `apps/console/src/distribution.ts` | 固定 Core roots、根 Surface、契约目录、grants、安装目录和恢复配置 |
| `packages/browser-host/src/ManagedBuiltin.tsx` | Router 树内受管理的根与 Layout 呈现，父布局连续性 |
| `packages/browser-host/src/BreakGlass.tsx` | 独立诊断导出、最近配置禁用/回退、清理和 reload |
| `packages/plugin-runtime/src/ui/point-compiler.ts` | 接纳期绑定 Profile/Ref Contract、收窄约束、冻结最终契约 |
| `packages/plugin-runtime/src/routing/route-model.ts` | Route/Navigation 版本化 Point 准入、结构冲突、参数校验和稳定排序 |
| `packages/plugin-runtime/src/platform.ts` | 七个小粒度 Platform Capability；Builtin/Restricted 使用相同权限入口 |
| `packages/plugin-runtime/src/action-runtime.ts` | 无 Surface 的单次 Invocation、不可变输入、取消/超时/终态与有限条件 |
| `packages/plugin-runtime/src/browser/action-driver.ts` | Builtin 本地 Bridge 与 Restricted 惰性 Wujie 的 Action 执行 |
| `packages/plugin-runtime/src/ui-react.tsx` | `RouteOutlet`、`RouteLink`、`ActionMenu`、`Tabs` 与受绑定 UiClient |
| `scripts/check-boundaries.mjs` | workspace 依赖、静态/动态 import、re-export 和私有路径检查；接入 typecheck/CI |

作者声明采用 contribution contract version 3；`check:plugin-contract` 拒绝将新 Kind、Profile 或 Point 路由发布到 1/2 目标。Bridge 的握手字段保持已有线协议，Session 的 `execution` 元数据区分 Surface 与 Action；Action 不声明、不分配 Surface Scope。`connectActionHost` 在插件本地复制并冻结启动数据后调用 handler。

新增验证覆盖 `root-presentation`、`point-profiles`、`route-admission`、`action-runtime`、`builtin-action`、`tab-runtime`、`platform`，真实浏览器入口为 `e2e/console-core.spec.ts` 和 `e2e/action-tab.spec.ts`。原有 Surface、路由冲突、订阅和安装配置回归保留。测试命令为 `pnpm test`、`pnpm test:e2e`、`pnpm typecheck`；生产优化构建使用 `pnpm build:routing-validation` 与 `pnpm test:e2e:preview`。

验收至少覆盖以下可观察结果：

- workspace/lint 拒绝 Host/Runtime 反向导入 Core、Feature 导入 Core 实现及 Host 私有 Context。
- Core 失败阻断 Ready；非 Core 隔离；普通 Surface 失败局部化；Core 根渲染失败走独立恢复路径。
- Builtin 根与 Route Layout 经公开接口进入受管理执行；子路由切换保留父 Layout 状态，Outlet 和 Route Context 正常工作，不依赖 Host 私有 Context 或手动补 owner 身份。
- Surface 声明只有一个提交真源，查询索引与接纳结果一致；失败插件不留下部分声明。
- Builtin 与 Restricted 的契约、授权和执行结果语义一致；两类 Adapter 均可执行根/局部 Surface 与授权 Action。
- 跨 Owner 未获 grant 即拒绝；Capability 权限不能替代 Point grant；expected 断言失败不能重新选择目标。
- 静态准入编译后不随追加声明或 policy 捕获值变化；新 Runtime 接纳变更。policy 求值异常仅隔离相应关系，诊断不包含异常原文。
- Profile 绑定、Major、Ref 输入在执行前校验；100 项/JSON 上限超限拒绝；变更同 Major 契约被拒绝。
- Profile / Ref Contract 在接纳阶段编译为冻结 Point 契约；每次执行仍校验输入，不重复解释静态绑定。
- 多层菜单在注册顺序扰动后输出稳定；父子环和无权挂接产生可归属诊断。
- Action 无 Surface 时可调用；timeout/cancel 后资源回收且不自动重试；Tab 切走卸载、重入新建。
- Restricted Route 导航仅接收 Route ID 和校验参数；根配置与 break-glass 不依赖私有业务接口。

实施细化：Action 默认超时 30 秒，可在 1–300,000 毫秒内指定；最多 128 个并发 Invocation，保留 200 条不含业务结果的终态诊断。输入遵守 64 KiB、32 层、10,000 节点与 100 个引用上限。条件比较操作为 `eq/ne/gt/gte/lt/lte/in/present`，字段只能来自 Ref Contract 发布的顶层 trait。尺寸约束和 Tab 单选在 Placement 输入阶段校验；无效输入不创建部分 occurrence。上述数值属于实现选择。

## 9. 与既有文档的关系

本文及 ADR 0017–0018 是本轮后续设计，对四层职责、Core 归属、受权 Route Capability、Profile/Ref Contract 和新增 Kind 的冲突规定优先。ADR 0001 已由 ADR 0017 正式 supersede；ADR 0008 的 Point/Slot 区分、ADR 0012 的同 Major 冻结、ADR 0013–0015 的资源寿命与 Adapter 语义继续适用，其中平台执行职责按本轮术语归 Plugin Runtime。

早期技术方案、路由设计和 UI 契约保留其历史与已实现状态。阅读其中 Host-owned 执行机制、仅 Surface Kind、Surface-only BridgeSession 或禁止 Restricted 主动导航等描述时，以本文区分目标变更；未被本轮改变的协议约束继续有效。


V1 约束适用范围：`group/order` 适用于各 Kind。`cardinality` 对 Surface/Tab 表示当前 Placement 选中的贡献数量，对 Action 表示一次调用的执行数量（固定为 1，范围不含 1 时贡献不可调用）；Route/Navigation 不接收该维度。`sizing/presentations` 仅适用于 Surface/Tab；Point Surface 支持 `inline`，Tab 支持 `tab`。Overlay 的 modal/drawer 是独立协议，不属于 Point 的呈现方式。尚无执行语义的维度或方式在声明接纳时明确拒绝，不作为无效限制静默保存。

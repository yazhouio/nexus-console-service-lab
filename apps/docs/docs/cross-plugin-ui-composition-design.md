# 跨插件 UI 组合协议设计

状态：设计已收敛；整体审阅后的六条补充已纳入实施基线，进入实现与浏览器验收。2026-09-04 已确认 Q1–Q25、Q27–Q34；Q26 已撤回，首个生产版本直接采用新的 owner-scoped 声明，不为原型 `slot: string` 设计 legacy mapping 或 rollback 兼容。完整契约、作者 API 草案及验收矩阵见[整体契约审阅稿](./cross-plugin-ui-composition-contract.md)，本文保留决策依据与演进记录。Q7 仅纳入 A → B Context，Q8 经整体审阅调整为首期验收最小 A → B → C 递归链路，Q18 的同 Major 冻结是首期规则；本文不表示代码已提供该能力。术语以 CONTEXT.md（仓库 `CONTEXT.md`） 为准，所有权与扩展点模型见 ADR-0007（仓库 `docs/adr/0007-extension-point-slot-surface-ownership.md`）、ADR-0008（仓库 `docs/adr/0008-plugin-owned-typed-extension-points.md`）。

## 已确认的设计边界

- **Q1：首个验收场景。** Restricted 插件 A 提供节点详情页，在自己的页面中使用 `<Slot id="..."/>`；独立发布的插件 B 向对应 Extension Point 贡献 Surface。A、B 无需导入对方的代码，Host 无需为这对插件编写专用页面逻辑。Surface 可以只是自由业务 Card、Panel、Chart，不要求完整页面。
- **Q2：所有权。** A owns placement，B owns contribution，Host owns execution。A 声明扩展点并表达展示意图，B 声明贡献，Host 沿用统一 Host Contribution Policy 的治理入口授权，并管理实际挂载与销毁；A 不直接创建、调用或销毁 B 的实例。
- **Q3：静态定义与动态运行。** Extension Point / Contribution Definition 静态声明，Runtime Ready 后不可新增；Slot occurrence、Session、Wujie instance 可在运行时创建与销毁。每次 Surface 挂载继续拥有独立会话，Restricted 继续采用现有 Wujie 协作隔离。
- **Slot 与 Surface 解耦。** Slot 是 Extension Point 的运行时 occurrence，既不是扩展点定义，也不等同于 Surface 容器。共享 Extension Point / Contribution 模型需要为未来 menu、page tab、resource action 等类型留出空间；这不表示这些类型已纳入首期交付，也不改变既有 Route / Navigation 的业务语义。
- **作者入口。** `<Slot id="..."/>` 是已认可的使用形式；`id` 按 Q5 引用 owner 本地扩展点，occurrence 身份按 Q16 由 Host 建立；其他参数的整体草案见契约审阅稿，底层定位方式留到实施时决定，不能把示意写法当作已经冻结的 SDK 签名。

第二轮确认：

- **Q4：扩展类型。** Host 定义 Extension Kind 及其执行语义；每个 Extension Point 固定一种类型，Contribution 必须匹配。首期实现 `surface`，具体业务 UI 由 B 自由提供；未来类型共用声明、寻址和授权模型，并保留各自的载荷与呈现契约。
- **Q5：归属与寻址。** Extension Point 定义归属插件，以 `ownerPluginId + localId` 寻址，A 的不同页面或 Surface 可以呈现其 Slot。`<Slot id="..."/>` 默认引用 A 的本地命名空间；首期仅允许 owner 放置自己的扩展点，跨 owner 放置需另行设计委托关系。
- **Q6：多重性。** 一个 Extension Point 可有多个同时存在的 Slot occurrence，一个 occurrence 可匹配多项贡献。不同 occurrence 的 Context 独立；实际展示同一 B Surface 时分别创建独立 Surface Instance。排序与展示选择见 Q12，执行寿命见 Q13。
- **Q7：首期数据方向。** 基础协议首期只确定 A → B 的结构化 Slot Context。B → A scoped events 作为后续扩展方向保留，暂不纳入基础协议，也不预设事件字段、事件 Schema 或交付时序；Context 更新和版本规则见 Q10、Q11、Q17–Q19。
- **Q8：协议允许递归。** B 的 Surface 可以作为 placement owner，放置 B 自有扩展点的 Slot 接受 C 的贡献，协议模型允许递归组合。整体审阅后调整为：首期验收包含最小 A → B → C 链路；v1 不承诺递归组合的长期兼容性、深度上限、性能稳定性或多层布局行为。
- **Q9：首期路由范围。** 首期完成普通 Slot + Surface，保留现有 Route 执行方式。将 B 的 Child Route 渲染进 Restricted A 的 Slot，以及 Restricted Route Layout / Outlet 的接入，作为后续独立设计范围。

第三轮确认：

- **Q10：独立的 Context Contract。** A 静态声明可序列化 Context Schema 与独立 `contractMajor`，B 显式匹配，由 Host 校验；扩展点契约版本与插件包版本分开。Schema 与同 Major 规则见 Q18。
- **Q11：Context 连续性。** A 提供 `contextKey` 控制实例连续性：same key update，new key recreate。结合 Q6，该规则只作用于同一 Slot occurrence 内，两个 occurrence 即使 key 相同也不共享实例；Host 不根据业务字段推测对象是否变化。采用带递增 revision 的完整 Context 快照，交付与竞态规则见 Q17、Q19、Q29、Q31。见 ADR-0009（仓库 `docs/adr/0009-slot-context-contract-and-continuity.md`）。
- **Q12：选择与排序。** 默认展示全部可用且获准的贡献，按 `order → ownerPluginId → contributionId` 确定性排序。A 只能筛选已授权 contribution，不参与授权；筛选不授予权限，也不隐含重新排序。
- **Q13：运行寿命。** hidden 保留，unmount 销毁，remount 重建；普通重渲染保留 occurrence 身份，首期不 keep-alive。Slot 挂载时按展示集合执行；移除后由 Host 撤销关联、取消未完成加载并清理执行子树。筛选移出的单项贡献按 Q16 处理，失效与清理顺序见 Q29。
- **Q14：分层失败。** Manifest 错误按插件拒绝；relation 错误按 contribution 隔离；runtime 错误按 session / occurrence 隔离。扩展点已声明但没有 occurrence 属于未使用；单个 Surface 失败在对应位置报告，并提供由 Host 执行的重试。具体影响范围已整理至整体契约的失败与恢复表。见 ADR-0010（仓库 `docs/adr/0010-ui-composition-failure-boundaries.md`）。
- **Q15：布局及跨区域 UI。** A owns outer layout，B owns inner UI。首期 Surface 同时支持 content-sized / bounded container；这些是同一 `surface` kind 的尺寸模式。Surface 不得自行突破 Slot 容器边界，Modal、Drawer 等跨区域 UI 通过 Host 提供的 Capability 发起并由 Host 执行。尺寸与生命周期见 Q20–Q22、Q29–Q30，具体 Capability 载荷仍待审阅；它们不使 B → A scoped events 自动进入基础协议，也不改变协作隔离的信任前提。见 ADR-0011（仓库 `docs/adr/0011-host-executed-cross-region-ui.md`）。

第四轮确认：

- **Q16：Definition identity 与 runtime identity 分离。** Contribution 使用 `ownerPluginId + contributionId`，contributionId 在所属插件内唯一；Host 为每次 Slot 挂载分配独立 occurrenceId，绑定创建者的呈现作用域。`contextKey` 只表达业务连续性，不替代运行身份；A 将贡献筛选移出时按 unmount 处理，重新选入时重建。
- **Q17：latest-snapshot channel。** Context 不保证逐 revision 交付，Host 分配递增 revision，可以合并尚未交付的中间快照。B 首次获得 Context 以最新已接受快照为基线，之后只向更新版本推进；首次快照与后续观察无缝衔接，过期执行不能处理迟到消息，具体同步算法留到实施时决定。
- **Q18：phase-1 完全冻结。** 首期同一 Major 完全冻结，任何 Schema / semantic 变化都升 Major，包括新增可选字段；每个扩展点只有一个当前 Major，后续再考虑兼容演进。Schema 采用 JSON Schema 2020-12 的明确内联子集，支持基本类型、对象、数组、枚举及基本范围约束；精确关键字白名单、资源限制和版本检查落点仍需细化。见 ADR-0012（仓库 `docs/adr/0012-phase-one-frozen-context-contracts.md`）。
- **Q19：非法 Context 与 runtime failure 分层。** 首次 Context 非法时不执行 B，显示 occurrence 输入错误；同 key 更新非法时拒绝更新、保留上个合法快照并向 A 报告。新 key 的 Context 非法时停止旧对象的执行并显示输入错误，不得继续展示旧对象；单个 B 会话失败只隔离 B，occurrence 失效时清理其执行子树。
- **Q20：真实容器协调尺寸。** A 声明 sizing policy + min/max constraints，实际宽高主要由真实 container 协调；resize 属于 runtime control，不进业务 Context。content-sized / bounded 两种模式均在首期范围内；布局约束、真实几何测量与控制消息应保持分离，不把 A 变成逐帧计算并推送宽高的控制器。
- **Q21：overlay 绑定 Owner Execution Scope。** Host overlay 挂载已声明 Surface，生命周期绑定 owner execution scope，而不只限定为 caller session；open 返回 handle，不长时间占用 unary RPC。scope 模型见 Q22，目标 owner 约束见 Q24。

第五轮确认：

- **Q22：Host 内部管理 Execution Scope。** Host 管理 scope 树，scope 表达一次逻辑 UI 执行，可拥有 Surface 执行尝试、Session 和 overlay。Session 失败可以结束当前尝试，scope 仍有效时 overlay 可以继续；贡献被移出或 contextKey 切换时，对应 scope 结束并回收资源，更长寿命的归属只能由 Host 明确授予。插件不直接创建或销毁 Execution Scope；Owner Execution Scope 表示某资源归属的 Execution Scope，不是另一种类型。见 ADR-0013（仓库 `docs/adr/0013-host-owned-ui-execution-scopes.md`）。
- **Q23：统一语义，仅 adapter 不同。** Builtin / Restricted 共用同一套 Extension Point、Slot、Context、scope、授权及诊断语义；Builtin 使用本地 render adapter，Restricted 使用 Wujie adapter。两类定义均在 Ready 前接纳并冻结。
- **Q24：精确授权。** 授权绑定 `contributor owner → point@major`，point 包含 owner 与本地 ID，Major 变化重新授权。同 owner 仍需通过声明、类型与版本校验；首期 overlay 仅允许调用方 owner 自有的已声明 Surface，并单独遵守 Capability 权限。见 ADR-0014（仓库 `docs/adr/0014-point-major-contribution-authorization.md`）。
- **Q25：标准化观察。** Host 提供 A 自身扩展点中已授权贡献的描述信息、relation 可用性和自身 occurrence 的标准化运行状态，包括输入拒绝和可重试错误。A 根据这些状态决定反馈 UI，重试与资源操作仍由 Host 执行；完整治理诊断保留在平台 Inspector，控制状态不变成 B → A 业务事件。

第六轮确认：

- **Q27：控制面与 RPC 语义隔离。** UI Control Plane 与 Capability RPC 语义隔离，但可复用同一 Session / MessagePort；Builtin 通过本地 adapter 进入同一控制核心。具体 dispatcher、限流和 resize 合并策略在实施时决定，不将候选实现当作已冻结协议。见 ADR-0015（仓库 `docs/adr/0015-ui-control-plane-and-anchor-boundaries.md`）。
- **Q28：声明、occurrence 与物理挂载分层。** 明确 `Declaration → Occurrence → DOM Anchor` 三层；Anchor 只负责物理挂载，不构成身份或授权依据，只能在当前 Presentation Root 内解析。Host 根据已绑定的运行身份与静态声明处理 placement / contribution 权限，不能根据 DOM 标记、位置或 `contextKey` 推断权限；具体 DOM 标记形式留到实施时决定。
- **Q29：Attempt 与 Scope 分别拥有资源。** Attempt 拥有呈现资源，Scope 拥有逻辑资源。Attempt 失效时，其 Presentation Root、Anchor 关联、Slot occurrence 及这些 Slot 的贡献执行子树随之撤销；直接归属仍有效 scope 的 overlay 可继续。销毁顺序固定为 `invalidate → reject new operations → cleanup`；异步清理完成前，旧身份也已不能执行新操作，迟到创建的资源必须回收，不能重新挂回已失效的执行。见 ADR-0013（仓库 `docs/adr/0013-host-owned-ui-execution-scopes.md`）。
- **Q30：Overlay handle 与一次性终态。** `open()` 只返回 handle，不等待业务结果，不长时间占用 unary RPC。Overlay 的业务结果为一次性的 `completed | cancelled` 终态；同一 Owner Execution Scope 的新 Attempt 可继续 observe，scope 结束后 handle 永久失效。即使之后出现相同 owner、Surface 或 `contextKey`，新 scope 也不能复活旧 handle；终态仲裁与数据边界见 Q33、Q34。

第七轮确认：

- **Q31：observe 分维度独立表达。** relation 可用性、Context 接纳 / 拒绝及最后合法快照、逐项 contribution 执行状态、visibility 等维度独立表达，不压成一个总状态。首次快照与后续更新必须无缝衔接；可以合并中间状态，但不能回退，观察仍有效且状态稳定后必须收敛到最新事实。输入被拒绝和某项贡献继续运行可以同时成立，观察不成为业务事件通道。
- **Q32：重试绑定失败执行。** 仅重试 Host 标记可重试的 runtime failure；retry 绑定具体失败执行，过期目标拒绝，同一失败的重复 retry 不得产生并发 Attempt。在同一有效 Scope 内创建新 Attempt，采用最新合法 Context；非法 Context 由 A 修正，不通过 retry 绕过输入校验。
- **Q33：Overlay 终态由 Host 仲裁。** Host 接受的第一个合法终态生效；当前 Overlay 执行可请求 complete，有权的 owner-scope 调用者或 Host 可请求 cancel，handle 本身不授予权限。呈现失败作为独立执行错误，由 Host 提供适用的 retry / cancel，不伪造业务结果；终态保留至 owner Scope 结束，Scope 结束时未完成项取消且 handle 失效，不保证向已销毁观察者送达通知。
- **Q34：首期 Overlay 使用同 owner 数据契约。** 每次 open 固定的 JSON input 和一次性 JSON result；Host 校验 JSON、操作权限与资源限制，业务数据形状由 owner 负责。它们独立于 Slot Context，不复用 point@major，不提供持续 input 更新或中间业务事件；跨 owner 或独立版本的 Overlay 数据契约另行设计。

设计基线是首个生产契约，现有原型实现不构成必须保留的生产 `slot: string` 契约。

## 协议不变量

以下是已确认决定的合并表述，不引入新的实现选择。

| 层次 | 负责的事实 | 边界 |
| --- | --- | --- |
| Declaration | owner-scoped Extension Point / Contribution、类型和契约版本 | 静态定义；Ready 后不可新增，不含运行身份或 DOM |
| Occurrence | Host 建立的一次扩展点呈现、Context 和展示集合 | 运行身份独立于 Definition、业务 `contextKey` 及物理元素 |
| DOM Anchor | 当前 Presentation Root 内的物理挂载位置 | 不产生身份或授权；视觉嵌套不合并不同执行的 root 与所有权 |
| Execution Scope | 逻辑执行连续性及其逻辑资源 | Host 内部管理；可跨 Attempt 保留，结束即永久失效 |
| Execution Attempt | 一次具体呈现及其呈现资源 | 新 Attempt 不继承旧 Attempt 的呈现身份；旧呈现中的 Slot 不能自动复活 |

上述两组分层分别描述定位与寿命，不将 DOM 树等同于 Scope 树。例如，A 的 Attempt 失败而 A 的 Scope 保留时：A 的旧 Slot 撤销，Slot 内 B 的执行 scope 及其下属资源结束；A 的 Scope 直接拥有的 overlay 可以继续。不能据此保留已结束的 B scope 的 overlay。

资源终止时先使本次终止范围内的身份与关联失效，再拒绝以旧执行发起的新操作，最后完成异步 cleanup；Scope 结束时其 overlay handle 永久失效，仅结束 Attempt 不使仍有效 owner scope 的 handle 失效。清理中的迟到消息、加载结果和重复回调不能使资源恢复有效；`contextKey` 相同只表达业务连续性，不允许绕过已经失效的 occurrence、Attempt、Scope 或 handle。

## 当前实现与目标的差距

设计访谈开始时，原型的 `UiExtensionContribution.slot` 是贡献查询用的字符串，未建模扩展点定义、owner 或 occurrence；Host Overview 硬编码读取 `console.home.cards`，由 Host 自己持有 DOM 并挂载 Surface。首个生产实现直接改用新的 owner-scoped Extension Point / Contribution 声明，并同步更新示例与作者文档。

当时统一 Contribution Policy 已覆盖 Route / Navigation，UI Extension 尚未接入。Restricted Surface 实例已有独立 BridgeSession，但没有父 Slot、子实例关系或跨插件容器定位协议；现有跨 owner Child Route 仍要求 Host realm 的 Builtin Layout，通过 `<Outlet />` 组合叶 Surface。为 Slot 复用治理入口不等于这些实现缺口已经解决。

当时 `RuntimeSchema<T>` 是 Host 本地的 `parse` 函数接口，Manifest 尚无可序列化 Context Schema，`initialParameters` 只校验是否为 JSON。旧 UI Extension 的局部结构错误会拒绝整个安装记录，跨插件 `(slot, id)` 冲突还会在 bootstrap 跳过整个 Restricted 插件；Q10、Q14 已决定新增契约和失效边界，但不能视为当前行为。依据：`packages/plugin-runtime/src/bridge-contract.ts`、`manifest.ts`、`bootstrap.ts`。

## 决策树与收尾

Q1–Q25、Q27–Q34 已确认，Q26 已撤回；本轮未产生新的协议语义分支。各分支均已整理到[整体契约审阅稿](./cross-plugin-ui-composition-contract.md)：

| 分支 | 决策依据 | 整体稿落点 |
| --- | --- | --- |
| 声明、类型、身份和授权 | Q1–Q6、Q10、Q12、Q16、Q18、Q23、Q24 | 静态声明与治理、身份表、作者入口 |
| Context 与状态观察 | Q7、Q11、Q17、Q19、Q25、Q31 | Context 转换表、独立观察维度、首次观察边界 |
| 呈现与资源寿命 | Q13–Q16、Q20、Q22、Q27–Q29、Q32 | 控制动作、Scope / Attempt 寿命、失败与重试 |
| Overlay | Q15、Q21、Q24、Q30、Q33、Q34 | 输入输出、操作权限、终态与恢复路径 |
| 交付范围 | Q1、Q8、Q9、Q23 及各项首期约束 | 验收矩阵、首期以外范围 |

整体审阅已完成：Scope tree 与 Contribution Scope、Host 唯一排序及观察进度 / reconnect、hidden 与 keep-alive 区别、key A → B → A 的新 Scope、retry 接受时点的初始 Context，以及最小递归验收均已纳入整体契约；不再新增设计前沿。字段命名和以下实施项不单独开启新一轮架构选择；本文和整体稿均不表示已实现或已验证。

实施时决定并验证的事项，不再作为本轮协议选择：

- UI dispatcher 组织方式、限流与资源预算数值、resize 测量和合并策略；必须满足控制面与 RPC 语义隔离以及真实容器布局约束。
- DOM 标记形式、anchor 解析与绑定机制、框架重渲染 / 元素变化的处理；必须满足 root 内解析、Anchor 非身份 / 非授权、普通重渲染保留 occurrence、真实 unmount 销毁的契约。首期未承诺额外的跨 root 迁移 API。
- 首次 Context 和观察流的具体同步算法、控制消息字段、异步取消及 cleanup 完成机制；必须维护最新合法快照、运行身份隔离和先失效再清理。
- JSON Schema 子集的精确关键字白名单、资源上限及同 Major 冻结检查落点；完成时在作者参考中明确列出，不将整个 JSON Schema 2020-12 都视为已支持。
- Host Overlay 的具体交互与可访问性实现，包括焦点、键盘关闭及取消原因枚举；需遵守最终确认的动作权限和终态语义。
- Wujie 浏览器可行性与资源回收验证，以及允许递归的运行防护；必须在真实浏览器验收最小 A → B → C 链路，不得把源码推断或首层验收说成递归已验证。

## 首个生产契约草案

声明字段、作者入口、Context 转换、observe 维度、失败与恢复、Overlay 动作及验收矩阵统一维护在[整体契约审阅稿](./cross-plugin-ui-composition-contract.md)，避免问答记录与完整契约各自演进出不同签名。定义不携带 occurrence、Scope、Session 或 DOM；这些属于 Host 管理的运行事实。

## 可行性前置调查

已检查安装的 `wujie@2.1.0` 源码及当前 adapter；具体定位与执行方案尚未决定，源码基础也不代表浏览器验证已经通过。

- Wujie 的 `el` 接受真实 `HTMLElement`，可见应用使用 open ShadowRoot；Host 若已定位 A 内部的专用元素，有把 B 挂入其中的源码基础。普通 selector 不会自动穿透 ShadowRoot，Wujie 还覆写部分节点的 `ownerDocument` / `getRootNode`，不能直接用这些属性推定归属。依据：Wujie `esm/index.d.ts`、`utils.js`、`shadow.js`、`iframe.js`。
- Wujie 有子应用启动子应用的分支，但本轮要求 Host 执行挂载；视觉 DOM 嵌套与 JS iframe 的创建归属需要分开验证。Wujie 会清空挂载元素的 children，该元素与 A 的页面内容管理必须有明确边界。依据：Wujie `esm/sandbox.js`、`iframe.js`、`shadow.js`。
- Wujie 元素断连时的自行清理不会自动完成 Nexus adapter 管理的 BridgeSession、请求、订阅和实例记录清理。JSON Bridge 也不能传递真实 DOM 对象；Slot 标识到元素的关联以及父子资源清理仍需新增协议。依据：`packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts`、`plugin-bridge.ts` 与 `packages/plugin-runtime/src/contribution.ts`。
- 当前浏览器测试只覆盖并列 Surface。后续最小可行性验证应覆盖 A 内 B 的渲染与握手、A 重渲染 / 移除 Slot、B 加载中 A 被销毁，以及 A / B 独立失败后的资源回收。

Q15 后续源码查证：

- 当前 adapter 没有两种尺寸模式，`layout` 只作为 JSON props 传给插件，未转换为容器样式；Wujie 也没有现成的自动测量 / 尺寸回传协议。部分 HTML 尺寸读取受 Wujie 补丁影响，不能直接把插件 `documentElement.getBoundingClientRect()` 或 `window.innerHeight` 当作内容或分配区域尺寸。依据：`packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts`、`apps/host/src/SurfaceMount.tsx`、Wujie `esm/shadow.js`、`iframe.js`。
- Host 尚无 Modal / Drawer Capability。现有 Bridge 可以提供绑定调用者的身份和权限检查，但 unary 完成后其资源不再由 pending request 自动跟踪；请求默认超时为 10 秒，不适合将打开请求直接延长到用户关闭界面。Subscription disposer 有清理基础，但当前异步 dispose 不被等待，也没有新契约要求的 Scope 所有权与先失效后清理机制；这些仍是实施缺口。依据：`apps/host/src/runtime.ts`、`packages/plugin-runtime/src/browser/plugin-bridge.ts`。

Q18 Schema 资料查证：JSON Schema 2020-12 定义了所需基本类型、对象 / 数组约束与数值 / 长度边界；项目仍需明确自己的关键字白名单和全内联约束，标准 meta-schema 校验不能代替这一白名单，因为标准允许未知关键字。依据：[Validation 规范](https://json-schema.org/draft/2020-12/json-schema-validation#section-6)、[Core 关键字规则](https://json-schema.org/draft/2020-12/json-schema-core#section-4.3.1)。

同 Major 冻结 Schema 与同 Major 增加可选字段是两种不同承诺。根据 `additionalProperties: false` 的语义，旧消费者仍会拒绝自己不认识的新字段，即使该字段在新 Schema 中是可选的；这是 Q18 已确认首期冻结的取舍依据。参考：[additionalProperties](https://json-schema.org/understanding-json-schema/reference/object#additionalproperties)。

Q21 后续源码查证：当前没有通用的呈现 execution scope。Builtin Overview / Route Layout 直接渲染 React 组件，不拥有 Surface Instance 或 BridgeSession；现有 activation scope 是 Ready 前的注册事务，Plugin ACTIVE 也不表达页面寿命。当前 Restricted Session dispose 为终态，retry 会创建新 Surface Instance，尚无原实例内的 session 重连。这些现状不能替代新的 Owner Execution Scope 契约。依据：`apps/host/src/HostContext.tsx`、`routing/RoutePage.tsx`、`SurfaceMount.tsx`、`packages/plugin-runtime/src/plugin.ts`、`browser/window-bridge-handshake.ts`。

Builtin 目前在 activate 中注册 render target，Restricted 在 manifest 静态声明后由 bootstrap 规范化，两者共用 Registry 落点但没有统一的静态定义入口。新模型需同步实现两种 adapter 的等价接入。依据：`apps/host/src/plugins/cluster.tsx`、`packages/plugin-runtime/src/bootstrap.ts`。

控制面源码查证：现有入站 envelope 只接受 `request` / `unsubscribe`，新增控制类型需要统一修改 dispatcher，不能另加 listener 而让旧入口同时拒绝消息。身份、MessagePort、JSON 校验、审计和取消机制可以复用，但当前没有 Slot / scope / anchor 绑定；异步 dispatch 的完成顺序也不等于端口接收顺序。现有请求 ID 累计限额、请求 / event 速率与 subscription 预算不应直接承受每次 resize；控制面的合并、预算和失效规则需要显式定义。真实 DOM anchor 由浏览器 adapter 持有，当前没有可直接复用的绑定表。依据：`packages/plugin-runtime/src/browser/plugin-bridge.ts`、`wujie-plugin-adapter.ts`。

## 实施进度

六条补充已落地为实施基线并开始实现。上文原型审计保留为决策背景；当前源码、验收结果和 adapter 限制以 [UI 组合实现](./cross-plugin-ui-composition-implementation.md) 为准，不再代表待实现清单。

# 插件系统架构消融实验

日期：2026-09-07。对象：当前工作区实现，以及尚未实现的 Console Core 拆分设计与 ADR 0017–0018。本文是分析建议，不修改既有 accepted 决策，也不把目标能力当作现有能力。

后续状态：第二轮替代方案已部分落实，见 [实施与验证记录](./architecture-substitution-implementation.md)。本文保留实验时分析；复现脚本使用固定的修改前源码基线。

结论：优先闭合声明、治理与执行之间的链路，再增加扩展模型。当前最值得削减的是重复真源、绕行入口和装配时序；Route ownership、Point admission、Scope / Attempt 的区别有实际职责，不能因为 React Router 或 Surface 已存在就删除。

## 实验方法与证据边界

“闭合”指：一个受支持场景可以从公开声明，经确定性接纳与授权，进入执行，并完成失败归属和资源回收，不要求调用方知道私有对象或补充隐藏时序。

对每个抽象问三个问题：移除后丢失什么可观察行为？复杂度消失还是转移到调用方？是否存在同一事实的另一份权威表示？区分以下证据：

- **实测**：临时源码副本中的单因素变异，运行已有契约测试。原生产源码未变更。
- **代码推断**：根据当前生产调用链判断，尚未实现替代方案，不声称删减后全部测试通过。
- **设计反事实**：分析未实现设计的删减方案；需要后续决策，不能称为实现缺陷。

复现：在仓库根目录执行 `node docs/validation/architecture-ablation.mjs`。依赖当前已安装 workspace 依赖。脚本创建临时源码副本，逐项变异、恢复和清理；Host 的已安装 workspace 依赖仍引用本地包，本次 Host 变异仅发生在其路由源码中。结果见 [JSON 记录](./architecture-ablation-results.json)。

| 实验 | 改动 | 结果 | 支持的判断 |
| --- | --- | --- | --- |
| UI 基线 | 无 | 9/9 通过 | 当前 UI 核心契约基线成立 |
| 路由基线 | 无 | 40/40 通过 | 路由、导航、执行器兼容性基线成立 |
| 删除 UI admission | 将 relation 的 authorized 固定为 true | 8 通过，1 失败 | selection / 引用不能替代授权 |
| 合并失败寿命 | Attempt 失败时直接结束其 Scope | 7 通过，2 失败 | retry 的 Context 连续性和 Overlay 恢复需要寿命区分 |
| 删除路由交集治理 | 跳过候选路由的 pairwise 冲突检查，保留 React Router 与其他检查 | 30 通过，10 失败 | Router 的匹配优先级不能替代跨 owner 冲突治理 |

第二项变异模拟“把两种寿命合一”的关键行为，不是完整删除 Scope 类型。失败数量衡量本次受影响测试，不代表架构价值评分。测试证明这些机制对**现有契约**有必要，不证明它们的每一处实现都最简。本轮没有重跑浏览器 E2E、性能测量或完成目标设计原型。

## 1. 最先闭合：Builtin Route 与 Surface 的执行接口

**证据：代码推断；优先级高。**

[RoutePage](../../apps/host/src/routing/RoutePage.tsx) 的 Builtin 分支直接执行 `<View routeContext={context} />`；Restricted 分支进入 SurfaceMount，再进入 UI core。[Overview](../../apps/host/src/Overview.tsx) 另用 `UiOwner` 手动补建 owner 执行身份。[UI core](../../packages/plugin-runtime/src/ui/runtime.ts) 的 `attachOwner` 直接建立 ready attempt，而 `mountRoot` 才运行 driver。作者因此必须知道页面走哪条入口，以及何时自己包装 UiOwner。

消融方向：删除业务侧“直接渲染 + 手动补身份”的特殊路径，让页面与局部 Surface 都获得 Runtime 管理的执行身份、失败上报和清理。

但这里存在一个尚未闭合的关键问题：不能把所有 Builtin Route 简单改成现有 `renderBuiltinUi`。它调用独立的 React `createRoot`，不会自动继承原树的 Router Context；[NodeLayout](../../apps/host/src/plugins/cluster.tsx) 依赖 `<Outlet />`、HostContext 和父布局状态。拆包不能解决这个问题。

建议先定义 React route adapter 如何在 Router 树内承载受管理的执行，以及向插件公开怎样的 Outlet / Route Context 接口。React 树内与独立容器可以是不同 adapter，但不能有两套生命周期语义。rootPresentation 对 Core Closure 和 Surface 声明的校验放在公开入口；低层 `mountRoot(owner, surfaceId, target, ...)` 接受调用方 target 的能力应收为内部实现，避免公开接口同时要求 ID 与实现真源。

验收：子路由切换时父布局状态保留；Builtin 页面抛错局部化；根呈现失败进入独立恢复 UI；插件无需导入 HostContext 或自行指定 owner 来补建身份。

## 2. 合并 Surface 声明真源，保留 adapter 的执行事实

**证据：代码推断；优先级高。**

当前有两份声明目录：

- [surface-definition.ts](../../packages/plugin-runtime/src/surface-definition.ts)：Restricted `SurfaceDefinitionRegistry`，保存 pluginVersion 与 `{ id }`。
- [contribution.ts](../../packages/plugin-runtime/src/contribution.ts)：统一 registry 的 `listUiSurfaces()`，保存 `{ id, target }`。

[bootstrap](../../packages/plugin-runtime/src/bootstrap.ts) 在 Restricted 接纳中双写、双 validate / apply；UI core 查后者，[Wujie adapter](../../packages/plugin-runtime/src/browser/wujie-plugin-adapter.ts) 查前者。Builtin 则只登记统一目录。

消融方向：一个 owner + surfaceId 声明目录；Restricted adapter 通过其只读查询或派生索引获得声明，并从已接纳插件记录取得版本与加载信息。消除独立注册事务与双写义务。

不能直接删除 Wujie 的声明存在性检查，也不能合并 Surface Instance 状态与声明：前者是执行准入，后者是动态事实。要删的是第二份**权威声明**，不是 adapter 验证。

验收：未声明 Surface 在任何入口都拒绝；Builtin / Restricted 对相同声明的可见性一致；接纳失败不留下部分目录记录。

## 3. Point 治理尚未覆盖 Route / Navigation 的版本与根接纳

**证据：现状与目标设计差距；优先级高。**

[definitions.ts](../../packages/plugin-runtime/src/ui/definitions.ts) 中只有 Surface policy request 携带 contractMajor。Route / Navigation 使用 `acceptsChildren` 和 parent ID，grants 不含 Major。[route-model](../../apps/host/src/routing/route-model.ts) 只在跨 owner 的父子挂接处检查开放声明与授权，顶层 route / navigation 无对应父 Point 接纳。

因此，目标中的“所有扩展受命名 Point 治理”和“contributor → point@major”还不能仅靠复用现有 policy 类型成立。这是目标迁移缺口，不是现有旧协议中已承诺版本授权的回归。

消融方向：在编译后的贡献模型里，以一种明确身份表达 Point、Owner、Major 与 admission；Route parent / Navigation parent 保留结构关系，不再额外成为第二份隐式接纳契约。迁移完成后删除旧 `acceptsChildren` 的权威地位，不能两份都要求作者同步维护。

保留 Kind 专用的路径冲突、父子环和导航目标检查；不要求把 Route 强制转换成 UI Slot。根路由和根导航容器也需显式接纳规则。

另一个需要明确的差异：当前 Route / Navigation ID 在 registry 中全局唯一，Surface / Point 按 owner + local ID 区分。统一身份模型时应选择一种明确规则，不能让通用 ContributionRef 暗示所有 Kind 都按同一方式寻址。

## 4. 平台 Capability 的激活后补绑定是未闭合的装配时序

**证据：代码推断；优先级高。**

[ui-overlay plugin](../../apps/host/src/plugins/ui-overlay.ts) 激活时注册代理，但目标 `service` 是模块全局变量；[App](../../apps/host/src/App.tsx) 创建 UI host 后才调用 `bindUiOverlay`。这要求装配方知道“provider 已注册，但服务尚不可调用”的额外状态；多个 Runtime 也没有各自独立的绑定容器。

消融方向：删除模块全局 setter，改为 Runtime 实例级装配。可先创建惰性的执行服务，再接纳声明，Ready 前绑定完整的服务实现；业务 UI 挂载仍然留到 Ready 后。必要的内部循环装配由工厂隐藏，不能把补绑定步骤放进插件作者 Interface。

Platform Capabilities 值得保留，因为它们替代 Host 私有对象访问。没必要为每项平台能力都新增一个只有转发功能的系统插件；应按是否存在可替换 provider 或独立部署/依赖职责决定。

验收：两个 Runtime 的 overlay 调用互不串联；Ready 后不会因忘记 bind 失败；dispose 后不保留可调用旧服务。

## 5. 已有退出条件的兼容路径，应作为删除任务而非长期抽象

**证据：代码推断；优先级中。**

`App` 中有 routingEnabled / LegacySurface 两条产品路径；[SurfaceMount](../../apps/host/src/SurfaceMount.tsx) 同时支持 UI host 与直接 Wujie adapter，并各自处理重试、清理与状态。

当前 App 正常 Ready 时始终提供 ui，因此直接 adapter 分支主要服务无 UI host 的调用方式；这仍是公开接口承诺，不能仅因当前主入口不走就断言所有消费者可删除。

消融方向：路由发布门槛满足后，把旧手动挂载能力移到明确的 adapter 验证 fixture，产品统一走受管理执行。组件不再同时要求 adapter、可选 ui、外部 failure 和内部 execution 状态。

这不建议绕过现有 routing release gate。退出条件是发布验收完成、明确不再支持旧产品路径；清理不应绑定在某个新 Profile 或新 Kind 的实现之后。

## 6. 标记 Capability 与重复排序，是更小且明确的删减候选

**证据：代码推断；优先级中。**

`kubesphere.console-shell@1` 的值只有 name；cluster 的 `require` 结果未使用。它目前仍有依赖解析和失败传播作用，不能说完全无行为。但 Distribution 已保证 Core 存在时，这份“存在性 Capability”是否仍需成为 Feature 的执行依赖应重新决定。

建议：若只有 Point 合约使用关系，就依赖公开合约包并让贡献接纳处理缺失 Point；若要求 Core 不存在时整个 Feature 不得激活，就保留明确的依赖语义。不要为了删除这个标记反而引入更大的 dependency DSL。

Navigation 排序在 `ContributionRegistry.listNavigation()` 和 Route Model 中各执行一次；默认 order 与稳定 tie-break 也在多处存在。建议只由一个位置解释呈现排序策略，registry 返回稳定声明视图。必须先检查直接使用 registry 排序结果的消费者；不能简单删除任一排序并假设行为不变。目标文档已决定删除 before/after，本轮不将其重复列为新发现。

## 7. Profile / Ref Contract 保留契约价值，消融运行期解释层

**证据：设计反事实；优先级中。**

目标设计要求 Profile + Ref Contract + Point 绑定后冻结最终 schema，且一个 Runtime 生命周期内不可变。由此可以把绑定与收窄校验做成**启动期编译**：输入完整的 Profile / Ref Contract / Point 声明，检查重复身份和冻结约束，输出每个 Point 的最终 schema、排序约束及诊断元数据。

执行阶段只消费编译后的 Point；无须每次 Slot 更新重新解析 Profile 图，也无须为三层契约分别建立可变的运行期管理服务。原始身份和版本仍保留用于审计、断言和发布检查。

若同一个 Profile 已服务 ResourceRef / PluginRef 等多个领域，复用价值成立；若仅为一个具体 Point 服务，先用 API 包内构造器实现复用即可，不必立即设计开放式 Profile 插件框架。

`expectedProfile / expectedRefContract` 已被目标设计明确限制为兼容断言，因此不是当前的第二选择器缺陷。消融建议只是默认由 typed constructor 生成断言、避免作者手工重复填写；跨版本制品混装时仍有 fail-fast 价值，不应无条件删除。

## 8. Action 有独立执行理由；Tab 无需再复制一套执行内核

**证据：设计反事实；优先级高（Action），中（Tab / Session）。**

Action 可以没有 Surface，而且涉及副作用、一次性结果、取消和超时。用隐藏 Surface 承载 Action 会把 UI 加载和 DOM 寿命强加给命令，因此 Action Invocation 的独立语义值得保留。

但当前 Restricted adapter 的入口仍是 Surface mount：需要 surfaceId、container，并经 Wujie / UI-ready 链路建立连接。仅增加 actionId 和 Execution Session 名词并不能完成“无 Surface Action”。实现前必须闭合：manifest 如何定位 handler、如何装载不声明 Surface 的 Owner、如何建立 invocation session、如何回收迟到连接。执行 adapter 的变化是实质工作，不能被统一 Kind 元模型掩盖。

Tab 在目标 V1 的行为是“元数据 + 选中时执行 Surface + 切走销毁”。可保留 `kind: tab` 的声明和验证，但复用 Surface Scope / Attempt，不再建立 Tab Session、Tab Execution Manager 等平行对象。URL 映射继续交给页面 Route 模型。

Execution Session 目前可以先作为寿命约束或判别类型。等 Action adapter 实际出现后再判断是否需要公共实现基类；避免在 Attempt / Invocation / BridgeSession 外再增加一份独立状态机。当前 Builtin 本地路径实际复用 MessageChannel 与 bridge dispatcher，这也不必为“本地”名义立刻改写，复用的验证与清理可能比省掉传输更有价值。

## 9. Host / Core 拆分应保留，但以删除私有依赖验收

**证据：设计反事实与代码推断。**

现有 Overview、NodeLayout 直接依赖 HostContext；App 知道具体 KubeEye 状态并持有 Console Layout。拆分确实能集中业务归属，独立 break-glass 也有真实故障职责，不属于只换目录名的诉求。

但物理拆成五个包不是闭合指标。Distribution 首先是一个装配入口，不需要额外的管理框架；console-core-api 应只含契约。应验证最小 Distribution 用另一个根 Surface 启动时，Host 源码无需修改；Core 根抛错时恢复路径不依赖 Core；Feature 不借用 Host 私有数据结构。

尤其应先完成第 1 项的 Router 树承载方案，否则拆包只是把 `HostContext` 改名为一个过宽 Platform Capability，再把私有耦合公开化。

## 应保留的区分

| 抽象 | 移除后的代价 | 建议 |
| --- | --- | --- |
| Route Model / path ownership 与 React Router | 实测冲突隔离、wildcard 阻断、导航诊断退化 | 保留治理；React Router 继续负责匹配和渲染投影 |
| Point 与 contribution grant | 实测未授权贡献进入可选集合 | 保留默认拒绝；统一版本化身份 |
| Scope 与 Attempt | 实测 retry / Overlay 连续性被破坏 | 保留两种寿命，收小外部 Interface |
| Point / occurrence / DOM Anchor | 同一 Point 多处挂载不能共享执行；DOM 位置不能代表授权 | 保留职责区分，不必全成为作者手工管理对象 |
| Ready / Plugin ACTIVE / execution ready | 声明成功与惰性 UI 成功发生在不同时间 | 保留事实，不增加聚合状态机 |
| Contribution grant / Capability permission | 放置 UI 与执行受权操作是不同授权目标 | 保留语义；复用策略基础设施即可 |

后三类判断来自现有契约与代码，本轮未分别进行删除变异。Surface / Action 的 adapter 差异同样不能因“统一插件协议”而抹平。

## 建议实施顺序与停止标准

1. **先闭合执行入口**：确定 Router 树内的受管理 Builtin 执行、根失败路径、实例级平台服务装配。先验证父布局状态与执行失败，再迁目录。
2. **再消除重复真源**：统一 Surface 声明；编译 Route / Navigation / Surface 的明确 Point 身份与 grants；保留各 Kind 的专用验证。清理旧 render / 接纳入口时同步作者文档与 manifest。
3. **落实物理依赖**：Distribution → Host / 插件实现；插件 → 公开契约。以替换根和禁止私有 import 验收，不以包数验收。
4. **按实际需求扩展**：先做真正不依赖 Surface 的 Action 纵向场景，再决定 Session 共用实现；Tab 复用 Surface 执行；Profile 在启动期编译。兼容路径在自身发布条件满足时独立退出。

停止增加抽象的标准：新增一个页面扩展时，作者只声明目标 Point、自己的内容或动作、必要的序列化 Context；不需要选择多个 registry、补 owner、补全局 bind，或理解一次挂载的所有内部身份。任何新层都应说明它让哪项调用方知识消失，而不只是让术语图更整齐。

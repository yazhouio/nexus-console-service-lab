# 第二轮：替代性架构消融

日期：2026-09-07。基于当前工作区实现及尚未实现的 Console Core 目标设计。

后续状态：S1–S3 已落实，见 [实施与验证记录](./architecture-substitution-implementation.md)。下文保留实验时结论；复现脚本已固定修改前基线，不对现行源码重复应用实验变异。

**本轮修正第一轮的推论：某职责不可删除，不代表承载它的现有抽象不可替代。** 实验采用“删除 X + 将最低必要职责迁到已有 Y”，比较契约、公开 Interface、权威状态和调用方知识是否减少。不以改名、搬文件或代码行数作为成功标准。

结论：Surface 的第二份注册事务可以消融；自写 URL 成员匹配可以消融；UI 准入的逐次计算可以消融。Scope 的连续寿命、路径集合的冲突治理仍需某种表示，但无需据此继续增加公开管理对象。目标 Tab 的执行职责已有实现可承接。

## 实测结果

| X：删除的部分 | Y：接收最低职责的已有实现 | 实测结果 | 架构判断 |
| --- | --- | --- | --- |
| Restricted Surface 独立可变 registry、activation、双写 | Contribution Registry 的 owner/local ID 校验、staging 和存储；已接纳插件记录提供 version | Runtime 155/155，Host 41/41；Runtime 类型检查通过 | 少一个权威目录和事务，值得迁移 |
| `matchSpace` 自写 URL 解码和成员匹配 | 已有 React Router `matchRoutes`；Route Model 保留非法编码拒绝 | Host 41/41，类型检查通过；2,688 个差分组合零差异 | 少一套匹配语义，值得迁移 |
| occurrence 更新与观察时反复 policy/schema-reference join | 现有 `createUiRuntime` 初始化一次性编译准入事实；既有 reconciliation 消费结果 | Runtime 155/155，类型检查通过；固定探针 policy 调用 38 → 2 | 少重复解释，适用于本项目静态生命周期 |
| 三项组合 | 上述已有实现 | Runtime 155/155、Host 41/41；两包类型检查通过 | 本次覆盖下无组合回归 |
| 目标中的独立 Tab 执行内核 | 现有 Slot selection + Surface Scope / Attempt | 新增探针通过：A 首次挂载、A→B 清理、B→A 新 Attempt、结束后无 Scope | 生命周期已有承接者；Tab 声明和 UI 仍需实现 |

155 项 Runtime 测试 = 原有 152 项 + 3 项新契约探针；41 项 Host 测试 = 原有 40 项 + 1 项差分探针。2,688 个组合在同一个差分测试中执行，不计作 2,688 个独立测试。新增测试也先在未修改基线上运行通过，再用同一预期检验替代实现。

复现命令：仓库根目录执行 `node docs/validation/architecture-substitution.mjs`。脚本创建临时源码副本，显式把 workspace imports 指向该副本，逐项恢复后进行下一项，最后组合三个补丁再验证并清理。生产源码及既有设计决策未修改。

- [可复现脚本](./architecture-substitution.mjs)
- [结构化结果](./architecture-substitution-results.json)
- [Runtime 探针](./substitution-probes.txt)、[路由差分探针](./substitution-route-probes.txt)
- [Surface 替代补丁](./architecture-substitution/surface-projection.patch)
- [Router 替代补丁](./architecture-substitution/router-membership.patch)
- [UI 准入替代补丁](./architecture-substitution/admission-at-initialization.patch)

本轮验证的是包级测试、固定差分输入和类型兼容；没有浏览器 E2E、性能基准或全输入等价证明。原 Wujie adapter 单元测试随 Runtime 全套执行，但不等于真实浏览器挂载验收。

## S1：删除 Surface 的第二份权威状态

原链路：Restricted manifest 的 Surface 同时写入 SurfaceDefinitionRegistry 与 Contribution Registry。前者有自己的 Map、activation、validate/apply/discard，后者已经支持同样的 owner-local ID 校验和原子声明接纳。

最低必要职责有四项：声明存在性、owner 隔离、有效版本、失败时不可见。前三项的来源本来就已经存在，第四项由 Contribution activation 和已接纳插件记录共同承接。

替代后保留 `runtime.surfaces.get/list` **只读投影**，由统一声明目录和已接纳 Restricted 记录生成；Builtin 不会意外出现在这份 Restricted 查询里。Wujie 的声明存在性校验和 inspection 消费方无需改变。

这不是“给第二个 registry 加同步器”：第二个可变 Map 和第二份写入事务均已删除。也不声称删除了 Surface 查询 Interface——它仍有现有消费者，保留查询并不要求保留另一份权威状态。

新增探针验证两个 owner 可有同名 Surface、版本保持、缺失查询返回 undefined、输出只读及统一目录可见性。原有 Restricted 接纳失败与 adapter 测试也通过。

代价：原型 `get` 通过列表查询，原有 Map 查询变成扫描；每次投影创建新的只读记录。本轮没有证明性能等价或对象引用身份等价。若实际规模需要，可以在 Ready 后建立不可变派生索引，仍只允许一个声明写入口；不应因此恢复第二套 activation。

**建议采用：先合并存储与事务，保留只读查询兼容面。**

## S2：删除自写匹配器，保留所有权分析

第一轮删除 Route Model 的交集治理导致失败，只能证明 Router 排名不能替代跨 owner 冲突规则。

第二轮找到更准确的可消融部分：`matchSpace`。其唯一生产调用方只使用“此 URL 是否属于这个已经被隔离的路径空间”的真假结果；并不使用它自己生成的 params。

替代方式：删除 `matchSpace`，在现有 Route Model 中直接用 `matchRoutes([{ path, caseSensitive: false }], pathname)` 判断。非法 URL 编码仍由 `resolve` 已有检查拒绝。路径语法约束、包含/交叉关系、授权、祖先失败传播和冲突诊断全部保留。

差分探针把原 Route Model 和原 PathSpace 留作只读参考，比较完整 resolve 输出。覆盖 8×8 路径对、2 种 owner 关系、21 个 URL，共 2,688 个组合，包括大小写、尾斜杠、重复斜杠、非法编码、编码斜杠、双重编码和冲突地址。

收益是明确减少两套实现之间的兼容义务。PathSpace 仍是有职责的纯路径集合模型；Route Model 的 Interface 不变。`matchRoutes` 每次创建匹配对象可能比手写函数更贵，尚未测量，不能把本轮说成性能优化。

**建议采用：删除重复 matcher，不删除所有权模型。** 此替代本身不使 Runtime 其他模块依赖 Router；Router 使用仍位于已有路由实现中。后续物理迁移时，再明确该实现属于哪个 adapter。

## S3：删除动态重复准入，迁到已有初始化阶段

原 `relations` 每次被 reconcile、snapshot、inspect 调用时，都重新查声明、检查 grant、Major、Kind 和 Surface 存在性。当前产品的插件集合、贡献集合与 policy bundle 在一个 Runtime 生命周期内不变。

最低必要职责是“执行只能选择已授权且契约可用的贡献，并能解释不可用原因”，不是“每次 UI 更新都重新调用 policy”。

替代实现让 `createUiRuntime` 对已声明 Point 一次性编译 relation 表，冻结条目；后续只查表。Context 校验、selection、Context Key、scope 生命周期仍然逐次处理，没有被静态化。

固定探针包含两个贡献、两个 occurrence、十次 Context 更新，以及选择未授权贡献。基线 policy 调用 38 次；替代后 2 次。两个版本均只执行获授权贡献，未授权选择不产生 Scope，诊断仍显示 POLICY_DENIED。38 → 2 只是这个输入下的调用次数，不是性能倍率。

需要明确三项条件：

1. 必须在声明接纳完成后创建 UI runtime；提前创建再补注册不属于此替代支持的用法。
2. policy 必须是静态且无副作用的求值。本项目当前 Distribution grants 满足这个条件；不能据此替代任意可动态变化的 policy callback。
3. 错误时机改变：原来某些 policy 异常会在 occurrence 创建时暴露，现在会在 UI 初始化时暴露。生产化时要明确配置错误是否阻断启动、可隔离的 contribution 错误是否变成不可用事实，避免扩大故障影响面。当前静态 `.some` policy 不涉及异常，但原型没有证明所有自定义 callback 的异常行为等价。

这项替代没有减少声明真源数量，增加的是可重建的派生事实表。它甚至净增加少量代码，但减少了运行期的解释次数和时序选择。

**建议条件采用：先把冻结时点和 policy 语义写进 Interface，再固定编译时机。** 不应为这张表另造一个可独立变更的 Policy Runtime。

## S4：消融目标中的 Tab 执行管理职责

Tab Kind 尚未实现，因此不能声称“删掉了现有 Tab Manager”。本轮用现有公开 core 方法构造目标 V1 的最小执行行为：

```text
Tab 元数据由页面展示
选择 tabId → 对应 contribution ref → Slot.selected
选中：Surface 挂载
切走：移出 selected，结束 Contribution Scope
重入：重新选择，创建新 Scope / Attempt
```

新增探针证明未选中的内容不会提前 mount，切换结束旧执行，回访不会复活旧 Attempt，最终资源释放。授权和 Context 机制直接复用现有协议。

因此可以保留 `kind: tab`、标题、排序和 Surface 引用等声明语义，把它们编译到已有 selection / Surface 执行；无需新建 Tab Session、Tab Execution Manager 或另一种 keep-alive 状态机。

未验证也未实现的部分：Tab schema、具体渲染 UI、键盘交互、可访问性、URL 映射，以及 Surface 指标在产品中的呈现。Tab 切走即卸载是此结论的前提；若以后要求保活，需要重新评估，而不是暗中扩展本轮结论。

## 继续尝试更大的替代：哪些只是把 X 换了名字

以下是职责迁移分析，未制作对应执行补丁；不能与 S1–S3 的实测结论混用。

| 尝试删除 X | 迁入已有 Y 的最低职责 | 判断 |
| --- | --- | --- |
| 整个 Scope | occurrence 或 Attempt 存 owner、有效性、Overlay、连续 Context、替代 Attempt | occurrence 本身随父 Attempt 失效；单个 Attempt 也需失败后保留逻辑 owner。为覆盖 root 和 retry，最终仍会重建一个跨 Attempt 的 owner 记录。可改表示，未看到减少的职责 |
| 整个 Route Model | React Router RouteObject 的 metadata 保存 owner、grant、冲突、tombstone 和诊断 | Router 本身不求所有权集合关系。把编译器塞进 metadata 工厂仍需要同样逻辑；可以少一个外观类型，不等于消融治理。S2 才是已证实的局部删减 |
| 显式 Point | Route / Navigation / Surface 元数据承载 owner、Major、schema 与 admission | 可减少独立存储目录；跨 owner 接纳契约仍需有唯一身份。适合编译成一个事实模型，不适合退回仅 parentId 或 DOM 标记 |
| Profile 运行期管理层 | API 包构造器 + 现有声明接纳时完成绑定、校验、冻结 | 静态设计下很有希望。保留契约身份和发布检查，运行时只用最终 Point schema；目前无 Profile 实现，属于目标设计收缩 |
| 新 Action 通用执行框架 | 已有 Bridge dispatcher 承接 schema、permission、timeout、AbortSignal、audit | 大量机制可复用，但现在 BridgeSession 依赖 Surface 执行身份和连接。无 Surface 的 handler 装载和 Invocation 身份仍要闭合；复用 dispatcher 不等于 headless Action 已实现 |
| Builtin 特殊 UI 执行路径 | Router 树内现有 React 承载 + UI core 执行身份和失败清理 | 有价值；应在原 Router 树内整合，不能简单换成另一个 `createRoot`。需要浏览器验证父 Outlet、布局连续性与错误隔离，本轮未做 |
| Overlay 全局补绑定 | 现有 Runtime 装配工厂持有实例级依赖 | 可移除全局共享状态；若只把 setter 藏进工厂，未删除“注册完成但服务不可调用”的阶段。必须进一步闭合 Ready 前装配，不能把隐藏 setter 当作消融成功 |
| Host / console-core 分离 | Distribution 直接静态组合业务与基础启动函数 | 可不引入新的 Distribution 管理器，但业务归属、独立恢复路径和禁止私有依赖的职责仍存在。包数不是必要条件，明确的单向 Interface 才是 |

对 Scope 的结论应精确表述为：**现有契约需要跨 Attempt 的逻辑资源寿命，但未证明现在每个 Map、字段和管理方法都不可进一步压缩。** 第一轮的失败测试无法证明具体数据结构最优。

## 净收益与实施建议

三个可审阅补丁合计净减少 125 行生产实现：Surface -111、matcher -16、准入编译 +2。这只是变更规模；实质收益分别是删除一个写入事务、删除一套匹配语义、减少一处动态解释阶段。

按当前证据排序：

1. **优先迁移 S1**：统一 Surface 权威声明；只读投影兼容现有消费者，性能需求用派生索引处理。
2. **迁移 S2 前后做路由浏览器与既有性能验收**：包级语义差分已通过，生产路径仍需验证。
3. **收紧生命周期契约后迁移 S3**：声明与策略冻结后编译；明确异常归属，不额外建立可变 policy 状态机。
4. **收缩目标设计**：Tab 声明使用已有 Surface 执行，Profile 在接纳期编译，Action 先复用 Bridge 的成熟调用机制，再补齐真正缺失的无 Surface 装载。

接受替代方案的标准不是“测试仍绿”这一项：还需要检查最低职责没有丢失、没有暗改产品要求、没有用新名字重建同一个 X，并且已有 Y 的 Interface 没有变成更宽的万能入口。本轮最明确的收敛方向是：**减少权威状态和执行语义的副本，把静态工作放回接纳阶段，把已有执行器擅长的职责交还给它。**

# 首期跨插件 UI 组合契约

状态：已实现，进入验收记录归档。2026-09-04 按整体审阅后的六条补充收敛设计。本文合并 Q1–Q25、Q27–Q34；[设计记录](./cross-plugin-ui-composition-design.md)保存决策，仓库 `CONTEXT.md` 定义术语。协议语义以本文为准，公开 SDK、具体实现选择和验证结果见 [UI 组合实现与作者 API](./cross-plugin-ui-composition-implementation.md)。

## 1. 场景、角色与交付范围

首个验收场景是 Restricted 插件 A 的节点详情页放置 `<Slot id="node.details"/>`，独立发布的 B 向该扩展点贡献普通 Card、Panel 或 Chart Surface。A、B 不导入对方的实现；Host 通过通用协议完成组合，无需为这对插件编写专用页面逻辑。

| 角色 | 负责 | 对外边界 |
| --- | --- | --- |
| A：placement owner | 自有 Extension Point、Slot 位置、业务 Context、筛选意图、外层布局与反馈 UI | 不持有、创建、调用或销毁 B 的实例；筛选不能授予权限 |
| B：contribution owner | Contribution Definition、自有 Surface、内部业务 UI | 不越过 Slot 分配区域；跨区域 UI 通过 Host Capability 发起 |
| Host | 声明接纳、授权、匹配、执行、运行观察、资源回收与 Overlay | 为 Builtin / Restricted 提供相同语义，仅 adapter 不同 |

首期实现 `surface` kind，支持多 occurrence、多 contribution、content-sized / bounded 两种尺寸模式及 Host Overlay。Slot 是 Extension Point 的运行时 occurrence，与 Surface 解耦；后续 menu、page tab、resource action 可复用声明与授权模型，并定义各自的执行语义。

首期验收包含 A → B → C 的最小递归组合链路：B 在自己的 Surface 中放置 B 自有扩展点的 Slot，继续接受 C 的贡献，用于证明模型和实现可递归成立。v1 不承诺递归组合的长期兼容性、深度上限、性能稳定性或多层布局行为；这不免除实际实现的资源限制与回收责任。B → A scoped events、Restricted Route Layout / Outlet、跨 owner 放置委托、跨 owner Overlay、keep-alive 和原型 `slot: string` 的 legacy mapping / rollback 兼容不在首期范围内。

## 2. 静态声明、身份与治理

### 声明草案

```ts
interface ExtensionPointDefinition {
  id: string;
  kind: 'surface';
  contractMajor: number;
  contextSchema: JsonObject;
}

interface SurfaceContributionDefinition {
  id: string;
  point: {
    ownerPluginId: string;
    id: string;
    contractMajor: number;
  };
  kind: 'surface';
  surfaceId: string;
  order?: number;
}
```

所属插件绑定声明 owner，不能由声明载荷冒充其他 owner。Restricted 使用 manifest，Builtin 在 Ready 前提交等价声明，两类定义均在 Ready 前接纳并冻结；Builtin 的本地 render value 由 adapter 持有。Ready 后 Extension Point / Contribution Definition 不可新增；运行时可以动态创建与销毁 occurrence、Attempt、Session 和 Wujie instance。

每个 point 固定一种 Host 定义的 kind，首期只有一个当前 `contractMajor`；贡献须明确匹配 kind 与 Major，并引用 contributor owner 自有的已声明 Surface。Contribution ID 在所属插件内唯一，Point ID 在所属插件的扩展点命名空间内唯一。

| 身份 / 地址 | 含义 | 不能替代的事实 |
| --- | --- | --- |
| `ownerPluginId + point.id` | Extension Point 身份 | 某次呈现或执行 |
| `point + contractMajor` | 精确 Context Contract 地址及授权目标 | 插件包版本 |
| `ownerPluginId + contribution.id` | Contribution Definition 身份 | Surface Instance |
| Host 分配的 occurrence 身份 | 一次 Slot 挂载 | DOM 元素或业务对象 |
| occurrence 内的 `contextKey` | 业务连续性 | occurrence、Scope、Attempt 身份或授权 |
| Host 内部 Scope / Attempt 身份 | 逻辑寿命 / 具体呈现寿命 | 插件可自行创建的资源句柄 |
| DOM Anchor | 当前 Presentation Root 内的物理挂载位置 | 身份与授权依据 |

Context Schema 与 `contractMajor` 独立于插件包版本。首期同 Major 的 Schema 和语义完全冻结；任何变化，包括新增可选字段，都必须升 Major。Host 校验序列化 Schema 及 Context；Schema 采用 JSON Schema 2020-12 的内联受限子集。精确关键字白名单、资源上限和版本检查落点在实施时确定并发布作者参考，不能以标准 meta-schema 校验代替项目白名单，也不能声称工具能自动识别全部语义变化。

跨 owner 授权固定为 `contributor owner → point@major`，Major 变化须重新授权。仅引用 point 或 Surface 不产生权限；同 owner 仍须通过声明、kind 与版本校验。Manifest 错误拒绝所属插件，relation 错误只隔离对应 contribution。

A 默认展示全部已授权且可用的贡献，按 `order → ownerPluginId → contributionId` 排序；本草案将省略的 `order` 视为 `0`，ID 比较采用与 locale 无关的固定顺序。A 只能从已授权集合筛选，Host 再校验筛选结果并保留确定性排序。A 可观察自身 point 下已授权项的可用性；完整授权诊断由 Host Inspector 提供。

## 3. 作者入口与 UI Control Plane

以下为 SDK 使用形态，非现有可运行示例：

```tsx
<Slot
  id="node.details"
  contextKey={node.id}
  context={{ nodeId: node.id, clusterId: node.clusterId }}
  sizing={{ mode: 'bounded', minHeight: 160, maxHeight: 480 }}
  hidden={false}
/>
```

`id` 解析到当前 placement owner 自有的 Extension Point。`contextKey + context` 作为一次完整输入意图提交，不能拆成先改 key、再发送旧对象数据的两次业务更新。Schema 由 point 定义，A 的其他页面也可复用同一个 point；Slot Context 与 Route Context、Surface Definition 的静态 initial configuration 分别表达，不自动合并成一个业务输入对象。

SDK 还提供对已授权 contribution 描述的筛选，以及 occurrence 观察与反馈 UI 接入；具体 hook / callback 命名在实施时确定。回调和 React 元素留在 A 的本地 SDK 中，Restricted 控制面只传可序列化的筛选引用和运行意图，不传函数、DOM 或 B 的实例。反馈 UI 的物理区域与 Host 挂载 B 的专用区域分开。

| 作者或 SDK 的意图 | Host 执行语义 |
| --- | --- |
| 放置 / 移除 Slot | 在当前 Attempt 下建立 / 撤销 occurrence，绑定合法 Anchor，协调贡献执行 |
| 提交 Context | 校验完整快照及 key，执行第 4 节的转换规则 |
| 改变筛选 | 在获准集合内更新展示集合；移出按 unmount，重新选入重建 |
| 改变 hidden | 保留 occurrence 及其执行；可见性独立变化 |
| 声明 sizing policy | 按真实容器协调布局与控制消息，不修改业务 Context |
| observe | 交付一致的初始事实快照并无缝衔接后续更新 |
| 请求 retry | 校验绑定的失败目标和可重试性，由 Host 创建替代 Attempt |

Builtin 通过本地 adapter、Restricted 通过 Session / MessagePort 进入同一 UI 控制核心。UI Control Plane 与 Capability RPC 语义隔离，可以共用 transport；具体 dispatcher、限流和 resize 合并策略不属于已冻结的协议结构。

定位始终遵守 `Declaration → Occurrence → DOM Anchor`。Host 根据可信执行绑定判断调用者身份、owner 与当前 root，再解析物理挂载位置；Anchor 只能在当前 Presentation Root 内解析，不能借 DOM 标记或视觉嵌套跨入另一个执行的 root。真实 DOM 由浏览器 adapter 持有，具体标记形式留到实施时决定。

## 4. Context 交付与业务连续性

Context 是 A → B 的 latest-snapshot channel。Host 接受合法快照并分配递增 revision；B 首次观察得到最新已接受快照，后续只向更新快照推进。可以合并尚未交付的中间 revision，不能将这个通道用于要求逐次处理的命令或事件。

| 输入 / 生命周期变化 | Context 结果 | 执行与旧对象展示 |
| --- | --- | --- |
| 首次输入合法 | 建立有效快照 | 执行匹配的已选贡献 |
| 首次输入非法 | 报告输入拒绝，无有效快照 | 不执行 B |
| 同 key 合法更新 | 推进最新合法快照 | 保留当前逻辑执行；健康 Attempt 接收更新 |
| 同 key 非法更新 | 报告拒绝，保留上一合法快照 | 已有执行继续；拒绝本身不触发重试或重建 |
| 新 key 合法 | 切换到新业务快照 | 结束旧对象的贡献 Scope，创建新执行 |
| 新 key 非法 | 报告拒绝，新对象没有有效快照 | 结束旧对象执行，不得继续展示旧对象 |
| 同一 occurrence 内 hidden | 最新合法 Context 仍有效 | 保留执行，恢复可见不重建；unmount 后不保留 |
| unmount / 筛选移出 | 不再向结束的执行交付 | 销毁对应执行；remount / 重新选入重建 |

`hidden` 只在同一仍挂载的 occurrence 内保留执行；keep-alive 指 unmount 后仍保留实例或执行，首期不支持。业务 key 的 A → B → A 回访必须创建新的 Contribution Scope A₂，不能复活已结束的 A₁；与插件角色 A / B 的命名无关。

同一个 point 的两个 occurrence，即使 `contextKey` 相同，也分别持有 Context 与执行。新 key 非法后再提交曾经使用过的 key，也不能复活已经结束的 Scope 或 Attempt；历史合法快照可用于诊断，不能作为当前有效 Context 展示旧对象。

首次 Context 快照与后续观察必须无缝衔接：连接期间接受的新快照要么包含在首次结果中，要么经后续更新送达；在有效连接中，稳定后的最新合法快照不能因订阅窗口而丢失。Host 必须区分输入意图的新旧顺序、Context revision 与执行身份，不能让迟到的校验或交付结果覆盖新的输入状态，不能向旧 Attempt 交付新对象的数据；具体序号与同步算法留到实施时确定。

## 5. observe 的独立维度

Occurrence Observation 必须分维度表达，不提供一个替代所有事实的总 `status`。同一快照内各维度应当一致，但某个维度的失败不自动改写其他维度。

| 维度 | 表达的事实 | 必须允许同时存在的情况 |
| --- | --- | --- |
| lifecycle | occurrence 是否仍有效 | occurrence 有效但没有贡献可执行 |
| visibility | visible / hidden | hidden 且执行仍 ready |
| input | 最近输入接纳 / 拒绝、最后合法快照、当前有效快照 | 同 key 输入 rejected，旧合法 Context 仍有效 |
| contribution availability | 每项已授权贡献的 relation 是否可用及标准原因 | 一项 unavailable，其他项可用 |
| selection | A 当前选择展示的贡献 | 可用但未选中，无正在执行的实例 |
| execution | 每项实际执行的 starting / ready / failed 及重试目标 | B ready，另一贡献 failed，输入同时 rejected |

这里的 `ready` 仅表示协议所需的呈现、控制连接与初始 Context 接入已就绪，不表示 B 已完成业务数据加载，也不表示每个已接受 revision 都已经绘制。Context revision 描述输入快照，不能冒充整个观察快照的版本。具体状态枚举名称属于本草案的 SDK 表达。

同 key 非法更新后的合法观察示例，省略业务数据：

```json
{
  "lifecycle": "active",
  "visibility": "visible",
  "input": {
    "submittedKey": "node-42",
    "acceptance": "rejected",
    "error": "CONTEXT_INVALID",
    "lastAccepted": { "contextKey": "node-42", "revision": 7 },
    "effective": { "contextKey": "node-42", "revision": 7 }
  },
  "contributions": [
    {
      "ref": { "ownerPluginId": "plugin-b", "id": "metrics-card" },
      "availability": "available",
      "selected": true,
      "execution": { "phase": "ready" }
    }
  ]
}
```

如果提交的是新 key 且非法，`lastAccepted` 可以保留历史信息，但 `effective` 必须为空，旧对象执行必须失效并停止展示。不能只把该示例最外层改为 `error`，从而丢掉“输入被拒绝”和“旧快照仍有效”的区别。

Host 是观察流唯一的排序源。每份 observation 携带 Host 分配、在其观察身份内单调推进的进度标识；Context revision 与 observation 进度分别表达业务快照和观察事实。reconnect 通过「完整快照 + 进度点」恢复，再接入更新；旧连接或较低进度的迟到消息不能覆盖新快照，transport 到达顺序不能决定最终状态。具体 seq / revision 算法留到实施时决定。

首次 observe 的一致快照与后续更新必须无缝衔接。可以跳过被更新事实覆盖的中间观察值；有效观察不得回退，状态稳定后必须收敛到最新快照。Scope / Attempt 已结束时，不以向已经销毁的观察者送达最后一次通知作为清理成功的前提。

A 根据这些事实渲染反馈，不能据此操作 B 实例。可重试错误附带 Host 认可的、不透明的失败目标引用；该引用只能用于请求 Host 重试，不能作为 Scope、Session 或 Surface 的通用操作句柄。

## 6. 执行寿命、失败与恢复

Host 管理逻辑 Scope tree，Attempt 是挂在 Scope 上的呈现尝试，不是另一级逻辑 Scope。以下名称有不同含义：

| 名称 | 层级与职责 |
| --- | --- |
| Execution Scope | 一次逻辑 UI 执行的树节点，可作为根执行或 Overlay 执行 |
| Owner Execution Scope | 某资源的归属角色，指向一个具体 Execution Scope；不是独立类型，也不自动指向最外层 A |
| Contribution Scope | 为某个 occurrence 中选中的 contribution、当前业务连续性创建的子 Execution Scope，owner 为 contributor；同时受创建它的父 Attempt / occurrence 生命周期约束 |
| Attempt | 所属 Scope 的具体呈现尝试，拥有 Session、Presentation Root、Anchor 与 Slot occurrence；retry 可替换 Attempt，不能复活结束的 Scope |

例如 A 的根 Scope Sₐ 下，A Attempt a₁ 放置 O₁；O₁ 执行 B 时建立子 Contribution Scope Sᵦ；B Attempt b₁ 放置 O₂ 时可建立 C 的子 Contribution Scope S𝚌。B 打开的 Overlay handle 的 Owner Execution Scope 是 Sᵦ，Overlay 的呈现执行属于其子 Scope，不能自动提升为 Sₐ 的资源。Scope tree 的父子关系表达逻辑归属，父 Attempt / occurrence 的失效守卫补充表达呈现依赖。

**Attempt 拥有呈现资源，Scope 拥有逻辑资源。** Host 为一次逻辑 UI 执行管理 Scope，Scope 可经历替代 Attempt；插件不直接创建或销毁 Scope。某项已选贡献在当前 occurrence 与业务连续性下的执行，可以因 retry 替换 Attempt，但不能因为相同 `contextKey` 跨 occurrence 共享 Scope。

A 的某个 Attempt 拥有其 Presentation Root、Anchor 关联和 Slot occurrence。该 Attempt 结束时，旧 Slot 撤销，其贡献执行 Scope 及下属资源结束；A 自己仍有效的 Scope 直接拥有的 Overlay 可以继续。B 的 Scope 随 Slot 结束时，B 的 Overlay 不能借 A 的 Scope 仍有效而继续。

销毁顺序固定为 `invalidate → reject new operations → cleanup`：先使本次终止范围内的身份及关联失效，阻止旧执行发起或完成新的资源操作，再完成异步清理。迟到加载、回调、控制消息与重复清理不能使旧执行恢复有效；加载在失效后才产生的资源也必须被回收。

| 失败 / 变化 | 隔离范围与恢复方式 |
| --- | --- |
| Manifest / 本插件声明结构错误 | 拒绝所属插件，不能仅跳过错误字段继续接纳 |
| point / Surface 引用、kind、Major、授权等 relation 不可用 | 隔离对应 contribution；A 只看到其有权观察的可用性信息 |
| Context 非法 | 按第 4 节处理输入；A 修正 Context，不走 runtime retry |
| 某个 B Attempt / Session 失败 | 结束该 Attempt 及其呈现子树，其他贡献继续；B Scope 仍有效时，其直接拥有的 Overlay 可保留 |
| occurrence 无效或无法建立合法挂载绑定 | 影响该 occurrence 的执行子树，不把局部容器错误提升为插件声明错误 |
| A 的 Attempt 失败 | 撤销其中的 Slot 与贡献 Scope；A Scope 是否继续由 Host 管理 |
| 过期控制操作 / retry | 拒绝该操作，不能误操作替代执行或新业务对象 |
| Overlay Surface 呈现失败 | 独立报告执行错误，业务 outcome 仍待定；Host 提供适用的 retry / cancel |

重试只针对 Host 标记可重试的 runtime failure，绑定具体失败执行。有效重试在同一 Scope 中建立新 Attempt；**Host 接受 retry 的时点**所见的最新合法 Context 固定为该 Attempt 的初始快照，随后同 key 的更新正常交付（可以合并中间更新，但不能把接受时的初始基线偷换为之后某个时点的值）；过期目标拒绝，同一失败的重复请求不得产生并发 Attempt。新 Attempt 不继承旧 Session、Anchor 或子 Slot 的运行身份，正常重新挂载的 Slot 建立新的 occurrence。

## 7. 尺寸与容器约束

A 声明 sizing policy 和 min/max constraints，负责外层布局；B 负责内部 UI。content-sized 允许内容参与容器尺寸协调，bounded 在分配区域内布局；两种模式都受 A 的约束，Surface 不能自行突破 Slot 边界。

实际宽高主要由真实 container 协调，resize 属于 UI runtime control，不进入业务 Context、不改变业务 revision，也不要求 A 逐帧计算和推送宽高。真实几何测量、溢出处理及尺寸反馈算法由 adapter 实现并经浏览器验证；不能把插件的虚拟 viewport 尺寸直接当成挂载区域尺寸。

## 8. Host Overlay Capability

Overlay 挂载调用方 owner 自有的已声明 Surface，通过独立 Capability 权限校验。生命周期绑定 Host 确定的 Owner Execution Scope；插件不传入任意 Scope ID 选择资源寿命。

### 动作草案

| 动作 | 输入 / 结果 | 权限和执行边界 |
| --- | --- | --- |
| `open` | 自有 `surfaceId`、modal / drawer 呈现意图、固定 JSON input；返回 handle | Host 校验并登记逻辑资源后返回，不等待业务结果；后续呈现失败通过观察报告 |
| `observe(handle)` | 当前 Overlay 快照与后续更新 | 校验当前调用者与 owner Scope 的观察权限；handle 本身不授权 |
| `observeOwned()` | 当前 owner Scope 内 Overlay 清单与后续更新 | 供同一 Scope 的新 Attempt 恢复 handle；不接受任意 owner / Scope 查询 |
| `complete(result)` | 一次性 JSON result | 仅当前 Overlay 执行可请求完成自己，Host 从执行绑定确定目标 |
| `cancel(handle)` | 取消请求 | 仅有权的 owner-scope 调用者或 Host 可请求；最终由 Host 仲裁 |

`observeOwned()` 是落实 Q30 恢复语义的 API 草案：新的 Attempt 可能已经丢失旧 JS 内存中的 handle，不能要求它必须持有旧 Session 的数据才能继续观察。清单仅包含当前 Owner Execution Scope 的资源，提供 handle、Surface 引用、open input 及状态，终态记录也保留到该 Scope 结束；获得清单不产生跨 Scope 权限。具体 SDK 名称和交付形式在整体审阅后确定。

每次 open 的 JSON input 固定，业务结果是一次性的 JSON result；Host 校验 JSON、权限与资源限制，owner 负责业务形状。输入输出不复用 Slot Context 或 `point@major`，首期不提供持续 input 更新和中间业务事件。

### 独立状态与终态

Overlay 观察分别表达业务 `outcome` 和呈现 `execution`。业务 outcome 从 pending 进入一次性的 completed 或 cancelled；执行失败不自动成为业务取消，也不能伪造 completed。Host Overlay 反馈 UI 根据执行错误提供适用的重试或取消入口，重试遵守第 6 节。

Host 接受的第一个合法终态生效，后续 complete / cancel 不能覆盖它。终态确定后释放该 Overlay 的呈现执行及其子资源，handle 与终态作为 owner Scope 的逻辑资源继续保留；调用方 Session 重建不改变既有业务结果。

Owner Scope 结束时，未完成项取消，所有该 Scope 的 handle 永久失效，再按固定顺序清理资源。不保证向已销毁观察者送达终态；已 completed 的结果不能被随后 cleanup 改写为 cancelled，也不能在新 Scope 中重新 observe 旧 handle。

## 9. 首期验收矩阵

下表是首期验收要求，实际执行结果见 [实施记录](./cross-plugin-ui-composition-implementation.md#可运行验收)。协议契约检查与真实浏览器检查共同覆盖；不能仅以模拟 adapter 通过来宣称 Restricted 嵌套已可用。

| 验收场景 | 必须证明的结果 |
| --- | --- |
| Restricted A 页面内的 Restricted B 普通业务 Surface | 独立声明和构建，无相互实现导入或成对 Host 页面逻辑；B 在 A Slot 内呈现并完成控制接入 |
| 最小递归 A → B → C | B 自有 Slot 中 C 真实挂载并独立接收 Context；移除或重试父 Attempt 时子树按 Scope / occurrence 归属回收 |
| Builtin / Restricted 接入 | 相同的治理、Context、观察、生命周期契约通过两类 adapter 验证 |
| 静态定义 | Ready 后新增定义被拒绝；Manifest 错误按插件拒绝；原型 slot string 不成为兼容入口 |
| 授权与 Major | 未授权、kind 不匹配、Major 不匹配的贡献不执行；Major 变化不能沿用旧授权；A 筛选不能扩大授权 |
| 多项贡献和筛选 | 默认全部、确定性排序；移出销毁，重新选入重建，其他项不受影响 |
| 多 occurrence | 同 point、同 key 的不同 occurrence 不共享 Context、实例或 Session |
| Context 合法更新 | 同 key 保留执行并更新快照，新 key 结束旧 Scope 后建立新执行 |
| Context 非法更新 | 首次不执行；同 key 保留合法基线并独立报错；新 key 不再展示旧对象 |
| 快照观察竞态 | Host 唯一排序、observation 进度单调；首次快照与后续更新无缺口；reconnect 用完整快照和进度点恢复；乱序 / 旧连接消息不能回退状态 |
| 旧 key 回访 | key A → B → A 创建新的 Contribution Scope A₂，A₁ 及其 handle / Attempt 不复活 |
| retry 初始 Context | 接受 retry 时捕获合法快照；加载期间发生 same-key 更新，新 Attempt 先取得捕获基线，再正常收到后续快照 |
| 分维度状态 | 能同时表达 input rejected、B ready、另一 contribution failed 及独立 visibility，不能只返回总 error |
| 容器生命周期 | 普通重渲染保持 occurrence；hidden 保留；unmount 清理；remount 使用新运行身份 |
| root 与 Anchor | 物理挂载只解析当前 root；伪造标记不产生身份或授权，视觉嵌套不授予访问其他 root 的能力 |
| content-sized / bounded | 在真实浏览器中遵守容器与 min/max 约束，resize 不产生业务 Context 更新 |
| 局部失败与 retry | B 失败不影响其他贡献；合法 retry 在同 Scope 创建新 Attempt；过期或重复请求不启动错误对象或并发 Attempt |
| 失效与迟到资源 | B 加载中移除 A Slot、结束 A Attempt 或切换 key，迟到资源均回收；旧消息不能恢复执行，Session / 订阅 / Anchor / 实例记录无残留 |
| Attempt 与 Scope 所有权 | A Attempt 结束会撤销子 Slot 与 B Scope；A Scope 直接拥有的 Overlay 可继续，已结束 B Scope 的 Overlay 必须回收 |
| Overlay open 与权限 | 只允许有权调用方打开自有已声明 Surface；open 返回 handle 后独立观察，不等待用户完成；handle 不能绕过 Scope 权限 |
| Overlay 恢复 | 同 Scope 的新 Attempt 无需旧 JS 内存即可找到并继续观察已有 handle 及终态 |
| Overlay 竞态与错误 | complete / cancel / Scope 结束只有一个合法终态；呈现失败独立报告；已完成结果不被 cleanup 改写；Scope 结束后旧 handle 永久无效 |

首期必须证明最小 A → B → C 递归链路；通过该项不构成对递归长期兼容性、稳定深度上限、性能或多层布局行为的承诺。Restricted Route Layout 仍不在本次范围内。

## 10. 实施项与整体审阅边界

dispatcher、具体控制消息、限流与资源预算、resize 测量、DOM 绑定、快照同步、cleanup 屏障、Schema 白名单及冻结检查、Host Overlay 焦点和键盘交互已记录在作者参考中。后续调整实现必须继续满足上文的语义与验收结果。

六条补充已纳入实施基线，不再扩展设计访谈。契约检查与真实浏览器验收的结果及实际限制已单独记录；本文的要求不替代执行记录。

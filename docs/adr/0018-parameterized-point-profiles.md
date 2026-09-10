---
status: accepted
---

# 通用交互 Profile 通过 Ref Contract 绑定领域引用

完整目录、执行语义和验收要求见 [Console Core 插件化设计](../../apps/docs/docs/maintainers/console-core-architecture.md)。

沿用 `Kind → Profile → Point → Slot`：Runtime 的 V1 Kind 固定为 route、navigation、action、tab、surface，各自实现执行语义与生命周期。`list.actions@1`、`detail.actions@1`、`detail.tabs@1` 表达通用交互语义；Profile 显式声明 Ref Contract 参数位，Point 绑定已注册的领域引用契约，例如 ResourceRef@1 或 PluginRef@1。这使交互契约可以跨领域复用，同时保留可校验的引用结构，避免每个业务领域新增 Kind 或让 Point 任意改写 Context Schema。

Point Major 冻结 Profile、Ref Contract 绑定和最终 Context Schema，任一变化必须升级 Point Major，延续 ADR-0012 的冻结规则；同一个通用 Profile 可用于不同领域而无需为绑定升级 Profile。领域 API 包定义带命名空间的 contractId@major 与 Schema，Distribution 汇集，Runtime 校验并冻结；同一身份存在不同定义时拒绝接受，不允许按加载顺序覆盖。

Contribution 仅以目标 point@major 选择 Point，该 Point 是 Profile 与 Ref Contract 绑定的唯一真源。可选 expectedProfile / expectedRefContract 是 fail-fast 静态断言；不参与第二次选择、不覆盖绑定，也不构成授权。V1 不推断结构兼容或自动转换引用类型。

Action 的 visible/disabled 条件在 V1 限于 selection count、Capability 条件，以及 Ref Contract 显式公开的稳定 traits/predicates。Runtime 只支持有限比较，禁止任意 Schema path 或回调；复杂领域判断留给 Owner，呈现条件不能替代执行授权。

Action 通过独立的短生命周期 Action Invocation 执行，取消和超时只表示等待及执行资源终止，并不保证业务副作用未发生或已回滚。Runtime 向 Owner 发送尽力取消信号、不自动重试；需要确认业务结果时通过 Capability 查询。

列表 Context 使用 selectedRefs，详情使用 itemRef，单个 Point 的引用服从同一个已绑定 Ref Contract。V1 最多携带 100 个引用，同时受 JSON 体积限制；超限明确拒绝，不静默截断。查询仅提供 filtered、matchedCount 等摘要，不支持通过摘要执行“全部匹配项”。ResourceRef 的 uid 可选，但需要实例身份保证的 Action Owner 必须要求 uid 并通过业务 Capability 校验；缺少 uid 时拒绝此类操作，Runtime 仅执行通用契约验证。

# 01 — 确定性解析 Plugin Set 与 Core Closure

**What to build:** 在执行任何 Plugin Code 之前，根据 Builtin/Restricted 的最小 Descriptor 和 Host 指定的 Core Roots，生成稳定、可解释的依赖关系、Core Closure、Bootstrap Order 与失败结果，让同一 Plugin Set 始终得到相同的解析事实。

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `CapabilityId` 与 `HostApiId` 只接受包含显式 Major 的标识，版本范围与隐式 Major 被拒绝。
- [x] 每个 `requires` 都解析为明确的 consumer/capability/provider edge；Major 不匹配等价于 `MISSING_CAPABILITY`。
- [x] 相同 Capability 的多个 Provider 触发 `DUPLICATE_CAPABILITY_PROVIDER`，Resolver 不选择任意一个 Provider。
- [x] 循环依赖返回完整 Cycle；Non-core Cycle 被 SKIPPED，涉及 Core 时 Runtime Bootstrap 失败。
- [x] Core Closure 从 Core Roots 沿 Provider 反向传递展开，缺失 Core Root 或 Closure 中出现 Restricted Plugin 时 fail-fast，并返回完整依赖路径。
- [x] Restricted ID 与 Builtin ID 冲突时保留 Builtin 并 SKIP Restricted；重复 Builtin ID 被视为 Host 构建错误。
- [x] 稳定拓扑排序以 `pluginId ASC` 作为 tie-breaker，同一 DAG 在不同输入数组顺序下得到相同结果。
- [x] Resolver 是纯计算过程，不加载 Artifact、不执行 Plugin Code，也不修改 Registry。

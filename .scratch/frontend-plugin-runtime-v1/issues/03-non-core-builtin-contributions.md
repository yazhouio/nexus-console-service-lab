# 03 — 让 Non-core Builtin 以 fail-soft 发布 UI Contribution

**What to build:** 接入一个依赖 Core Capability 的 Non-core Builtin，使其可以通过同一个 owner-bound Context 原子发布 Capability 与 Route、Navigation、UI Extension；失败只影响自身及依赖它的后续 Plugin，Runtime 仍可 Ready。

**Blocked by:** 02 — 通过 Core Builtin 启动首个 Ready Runtime

**Status:** done

- [x] Non-core Builtin 仅在所有依赖 Provider 已为 ACTIVE 时执行；Provider 非 ACTIVE 时直接 SKIPPED，不执行 activate。
- [x] Provider 激活失败后，后续消费者在单遍稳定顺序中自然 SKIPPED，不运行第二次递归传播。
- [x] Non-core activate throw 或声明断言失败时记录 FAILED，Runtime 仍可进入 Ready。
- [x] Capability 与三类 Contribution 的 staged records 在全部校验成功后一次性提交，任一冲突都会丢弃该 Plugin 的整组 staged records。
- [x] Route ID 与 Navigation ID 在 Runtime 全局唯一；Extension ID 只在同一 Slot 内唯一。
- [x] Route path 重复不被误报为 ID collision，其匹配语义继续交给 Host Router Contract。
- [x] Navigation 可跨 ACTIVE Plugin 引用 Route 或 Parent Navigation，且引用不会产生 Capability dependency edge。
- [x] 有视觉顺序的 Contribution 按 `order`、ownerPluginId、contributionId 稳定排序；不存在的 Slot 只让 Contribution 保持未使用。
- [x] Registry 的查询结果是带 owner 的不可变 Snapshot，不暴露内部可变集合。

# 02 — 通过 Core Builtin 启动首个 Ready Runtime

**What to build:** 让静态收集的 Core Builtin 通过 owner-bound PluginContext 串行激活、注册 Capability，并在全部 Core Closure 成功后形成首个 Ready Runtime；Core 的任何失败都阻止 Runtime Ready。

**Blocked by:** 01 — 确定性解析 Plugin Set 与 Core Closure

**Status:** done

- [x] Builtin 通过静态 `PluginDefinition` 收集，并严格按照 Core Closure 内的稳定拓扑顺序串行激活。
- [x] PluginContext 自动绑定当前 owner，Plugin 无法为其他 Plugin 注册 Capability。
- [x] 激活期间注册内容只进入 owner 的 staging area，Global Registry 在 commit 前不可观察到 staged Capability。
- [x] `require` 未声明的 Capability 立即返回 `UNDECLARED_CAPABILITY_REQUIRE`；`register` 未声明的 Capability 立即返回 `UNDECLARED_CAPABILITY_PROVIDE`。
- [x] activate 成功后缺少任一 declared provide 时返回 `DECLARED_CAPABILITY_MISSING`，且 staged records 全部丢弃。
- [x] activate、声明断言与 commit 全部成功后 Core Builtin 才进入 ACTIVE，Capability Metadata 带正确的 Provider ownership。
- [x] 任一 Core Builtin activate 或 assertion 失败时 Runtime Bootstrap fail-fast，Runtime 不进入 Ready。
- [x] Capability 列表只暴露不可变 Metadata，不暴露 Capability Value 或 Registry 内部可变集合。

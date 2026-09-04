# 10 — 在 Route 与 UI Extension 中独立挂载同一 Surface

**What to build:** 让 UI Host 同时从 Route 和 UI Extension 渲染同一个 Restricted Surface Definition，并保证每个挂载都是独立、可诊断、可单独失败和清理的 Surface Instance。

**Blocked by:** 06 — 首次访问时按需挂载 Restricted Route

**Status:** done

- [x] ACTIVE Restricted Plugin 的 UI Extension 可由对应 Host Slot 渲染，缺失 Slot 时保持未使用且不触发挂载。
- [x] 同一 Surface Definition 被 Route 与 Extension 引用时，两者都能独立挂载并接收各自 Contribution 的 layout 与 initialParameters。
- [x] 每次 mount 生成不同的 surfaceInstanceId、Wujie name、DOM container、MessagePort 和 BridgeSession。
- [x] Route mountPointId 使用 `route:<routeId>` 归因，Extension 使用 `extension:<slot>/<extensionId>` 归因。
- [x] 同一 Surface 同时挂载两次时，Session identity、请求去重、资源限制和清理范围互不共享。
- [x] 一个实例进入 FAILED 或被 unmount 不会改变另一个实例，也不会把所属 Restricted Plugin 标为 FAILED。
- [x] 实例处于 mount point 时保留 MOUNTING、MOUNTED 或 FAILED 事实；Unmount 完成后才从活动实例集合移除。
- [x] 真实浏览器用例覆盖并发挂载、分别交互、单实例失败和逆序卸载。

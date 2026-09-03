# 04 — 在安装期验证 Restricted Plugin 而不执行代码

**What to build:** 在 Restricted Package 安装阶段读取并验证 Manifest 与 Installed Config，产出可供下一次页面 Reload 使用的合法安装记录；任何无效输入都在 Plugin Code 执行前被拒绝。

**Blocked by:** 01 — 确定性解析 Plugin Set 与 Core Closure

**Status:** done

- [x] Manifest、Installed Config 与 Bridge Bootstrap Descriptor 使用拒绝未知字段的 closed schema。
- [x] Manifest 与 Config 的 Plugin ID、版本必须精确匹配，且 Restricted `provides` 必须为空。
- [x] `hostApi` 必须包含显式 Major，`entry` 必须属于 Host Artifact Allowlist。
- [x] Surface ID、Route ID、Navigation ID，以及同一 Slot 内的 Extension ID 满足各自的本地唯一性要求。
- [x] Restricted Route 与 Extension 引用的 surfaceId 必须存在于同一 Manifest。
- [x] Permission ID 格式合法，Granted Permissions 是 Manifest Requested Permissions 的子集。
- [x] 本地校验失败返回带 pluginId、稳定错误码和 `validationStage: manifest` 的诊断。
- [x] 验证过程不加载 `entry`、不创建 Wujie Instance、MessagePort 或 BridgeSession。
- [x] 合法结果保留 Manifest 与 Installed Config 的简单配对，不引入 trustLevel、executionMode、critical 或通用 Runtime Policy 字段。

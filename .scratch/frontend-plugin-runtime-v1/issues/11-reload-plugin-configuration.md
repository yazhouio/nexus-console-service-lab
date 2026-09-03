# 11 — 通过 Reload 应用安装、禁用、升级与回滚

**What to build:** 将 Plugin Configuration Change 统一落实为“下一次 Reload 的输入”，使当前页面 Runtime 的 Plugin Set、Provider、Surface 和 Contributions 始终不可变，同时支持安装、禁用、卸载、升级与回滚。

**Blocked by:** 05 — Manifest-first 接纳 Restricted Plugin

**Status:** ready-for-agent

- [ ] 安装或启用 Restricted Package 只更新 Installation Store，并明确返回 Reload Required；当前 Runtime 不出现新 Plugin 或 Contribution。
- [ ] 禁用或卸载只更新下一次 Runtime 输入，不调用 Plugin-level deactivate，也不销毁当前 Plugin Set。
- [ ] 升级与回滚只切换 active version，Config 必须与所选 Manifest 的 ID 和版本精确匹配。
- [ ] Reload 后重新收集静态 Builtins 与 enabled InstalledPluginRecords，并从头执行 Validation、Resolution 和 Bootstrap。
- [ ] Reload 后被禁用或卸载的 Plugin 不再进入新 Runtime；启用或切换版本的 Plugin 使用新的不可变 Manifest。
- [ ] Runtime Ready 后不能增加或删除 Plugin、重算依赖 DAG、替换 Capability Provider 或动态注册 Restricted Contribution。
- [ ] 创建和销毁 Surface Instance、BridgeSession 与 Subscription 仍可在 Ready 后按需发生，且不被误判为 Plugin Set 变化。
- [ ] 测试覆盖安装后未 Reload、Reload 后生效、升级、回滚、禁用和卸载六条用户路径。

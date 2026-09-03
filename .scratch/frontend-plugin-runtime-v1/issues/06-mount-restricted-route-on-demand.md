# 06 — 首次访问时按需挂载 Restricted Route

**What to build:** 当 UI Host 首次渲染一个 ACTIVE Restricted Route 时，才创建独立 Surface Instance、启动 Wujie 并完成 Bridge Handshake；离开页面或挂载失败时只清理和标记当前实例，不改变 Plugin ACTIVE 或 Runtime Ready。

**Blocked by:** 05 — Manifest-first 接纳 Restricted Plugin

**Status:** ready-for-agent

- [ ] Runtime Ready 且 Surface 尚未访问时，不调用 Wujie startApp，不创建隐藏容器、Wujie Instance、MessagePort 或 BridgeSession。
- [ ] 合法 Route mount 创建包含 plugin/version/surface/surfaceInstance/mountPoint 的 Host-side identity，并先进入 MOUNTING。
- [ ] Wujie name 在实例生命周期内稳定且在当前 Host 唯一，不被其他 Surface Instance 复用。
- [ ] Bridge Bootstrap Descriptor 只包含 protocolVersion、surfaceInstanceId 和一次性 nonce；Plugin 回传的身份、权限或 Capability 字段不被信任。
- [ ] Handshake 校验实例、协议与绑定 nonce，成功后建立且只建立一个 ACTIVE BridgeSession，Surface 进入 MOUNTED。
- [ ] Artifact、Wujie Bootstrap、Handshake 或 Render 失败只使当前 Surface Instance 进入带稳定 stage 的 FAILED，Plugin 保持 ACTIVE。
- [ ] Unmount 先 dispose BridgeSession，再清理 Wujie Instance、MessagePort 和 listeners，随后移除实例记录。
- [ ] 传入 Wujie 的 props 不含 Host Store、React Context、DOM Node、Function、Token 或 Raw API Client。
- [ ] 真实浏览器测试明确验证同源 `window.parent` 可访问的 cooperative-isolation 事实，不产生“secure sandbox”断言。

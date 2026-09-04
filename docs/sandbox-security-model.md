# Sandbox Security Model

## 1. 结论先行

V1 的 `Restricted + Wujie` 是 **cooperative-isolation**，不是 hostile-code sandbox。Wujie 子页面与 Host 同源时，Plugin 可能访问 `window.parent`，因此它不是浏览器 Origin Security Boundary。

真正的数据安全边界仍是 Backend Authorization。Bridge Permission 只治理经过 Host PluginBridge 的 Capability Action，不能限制 Plugin 自己发出的同源网络请求。

## 2. V1 信任模型

V1 假设 Restricted Plugin 主要来自官方或合作方，不开放任意第三方 JavaScript 市场。若未来需要执行 Hostile Third-party Code，必须重新设计为 Independent Plugin Origin + 生产级 Sandboxed iframe，而不是继续向同源 Wujie 添加权限字段。

## 3. Host 保护措施

### Manifest-first

Host 在执行 Plugin Code 前验证：

- closed schema；
- Plugin ID / version；
- Host API；
- Entry Allowlist；
- `provides = []`；
- Surface 与 Contribution 引用；
- Bridge Contract；
- Requested / Granted Permissions。

失败时不加载 Artifact、不创建 Wujie、不创建 MessagePort 或 BridgeSession。

### MessagePort identity binding

Handshake 后，Host 将以下事实绑定到当前专用 MessagePort：

```text
pluginId
pluginVersion
surfaceId
surfaceInstanceId
mountPointId
protocolVersion
manifest.requires
grantedPermissions
```

Plugin 发送的消息不能用自带的 `pluginId`、Permission、nonce 或 protocolVersion 替换 Host-side identity。

### Bridge validation and containment

每个 Session 独立拥有：

- closed envelope validation；
- requestId dedup；
- message size limit；
- concurrency / request rate limit；
- timeout and AbortSignal；
- request / result / snapshot / event Schema；
- per-call Permission check；
- subscription count / event buffer / event rate limit；
- bounded audit and Host error records。

普通错误只拒绝当前请求。持续严重协议违规可以 dispose 当前 Session 并将当前 Surface Instance 标记为 `FAILED`，但不影响同一 Plugin 的其他实例，也不把 Plugin 改成 `FAILED`。

## 4. Plugin 能看到什么

Plugin 可获得：

- 自己 Surface 的渲染输入；
- Host 明确定义的 JSON Bridge Result / Snapshot / Event；
- 当前 BridgeSession 的通信结果。

Plugin 不应获得：

- Host Runtime Object；
- Capability Value 原对象；
- Raw API Client；
- Access Token；
- Host Store 或 React Context；
- 其他 Surface Instance 的身份和 Session。

## 5. Network 与后端鉴权

同源访问可能仍然成立：

```text
Plugin fetch('/api/...')
  → Browser same-origin rules
  → Backend session / authorization
  → allow or 403
```

因此：

- 不要把 Bridge `PERMISSION_DENIED` 当作网络防火墙；
- 所有敏感数据接口必须在后端校验用户、Session、Role 和 Resource 权限；
- E2E 应同时测试 Bridge 拒绝与 Backend 403；
- Audit 不记录原始 payload、Result、Event 或 Token。

## 6. 非目标与重新设计触发条件

V1 不提供 Native iframe、Independent Origin、Artifact Signature、Marketplace Trust、Hostile-code Containment 或任意第三方代码的安全承诺。

出现以下需求时必须重新评估架构：开放第三方发布、独立插件 Origin、恶意代码执行、Remote Direct Loading 或多个 Transport 共享 Permission Enforcement。

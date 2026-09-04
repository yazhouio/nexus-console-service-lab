# Compatibility & Versioning

## 1. 版本层级

| 层级 | 标识 | V1 规则 |
| --- | --- | --- |
| Plugin | `id` + `version` | Config 必须精确匹配 Manifest；包建议 immutable |
| Capability | `name@major` | 只按显式 Major 匹配；不支持范围和多 Provider 协商 |
| Host API | `name@major` | Host 必须声明支持的 Major |
| Bridge Protocol | `protocolVersion` | Handshake 时协商 / 校验，不兼容则拒绝 |
| Surface | `pluginId/version/surfaceId` | 实例另有独立 `surfaceInstanceId` |

## 2. Capability 与 Host API

以下依赖兼容：

```text
requires kubesphere.cluster@2
provides kubesphere.cluster@2
```

以下依赖不兼容：

```text
requires kubesphere.cluster@2
provides kubesphere.cluster@1
```

结果为 `MISSING_CAPABILITY`，不会通过隐式 Major 或版本范围自动匹配。

Host API 只比较显式 Major。Host 不支持 Manifest 的 `hostApi` 时，Plugin 在 Manifest 阶段 `SKIPPED`，且不加载 `entry`。

## 3. Plugin 升级、回滚和配置

建议将每个版本视为不可变包：

```text
kubeeye@1.0.0
kubeeye@2.0.0
```

升级或回滚流程：

1. 安装并验证目标 Manifest。
2. 将 active version 写入 Installation Store。
3. 返回 `{ reloadRequired: true }`。
4. 页面 Reload 后用目标 Manifest 重新执行 Validation、Resolution 和 Bootstrap。

当前 Runtime 的 Plugin Set、Provider、Contribution 和 Surface Definition 不会被热替换。

## 4. Bridge Protocol

Host 在创建 BridgeSession 前校验：

- `protocolVersion` 是否支持；
- Surface Instance 是否仍为 `MOUNTING`；
- nonce 是否有效、未使用且绑定当前实例。

Handshake 成功后，协议版本、Plugin、Surface、实例和权限事实绑定到专用 MessagePort。Plugin 消息不能自行携带或覆盖这些身份信息。

## 5. 兼容变更建议

在当前 V1 模型下：

- 新增不影响已有调用的 Capability Action，可作为同一 Bridge Contract 的扩展，但必须新增契约测试和 Catalog 文档。
- 修改已有 Action 的 Request / Result / Snapshot / Event Schema，或改变 Required Permissions，应视为需要协调的 Contract 变更。
- 改变 Capability Major、Host API Major 或无法兼容的 Bridge Protocol，应使用新 Major / Protocol Version，并通过安装验证或 Handshake 明确失败。
- 不要通过配置数组顺序表达兼容性或激活优先级。

V1 不实现 SemVer Solver、Multiple Provider Negotiation、运行时 Artifact Negotiation 或 Provider Switching。

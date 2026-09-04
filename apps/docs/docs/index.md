---
pageType: home
title: Nexus Frontend Plugin Runtime
description: Contract-first frontend plugins with deterministic lifecycle, Bridge governance, and observable runtime facts.
hero:
  name: Nexus Runtime
  text: Frontend plugins with explicit contracts
  tagline: 用确定性的依赖、声明式 UI 和受治理的 Bridge，把 Plugin 接入变成可解释的 Runtime 事实。
  actions:
    - theme: brand
      text: 开始接入
      link: /plugin-author-guide
    - theme: alt
      text: 了解架构
      link: /lifecycle-architecture
features:
  - title: Contract-first
    details: Manifest、Capability、Contribution 和 Bridge Contract 在执行前完成校验。
    icon: 🧩
    link: /manifest-contract-spec
  - title: Runtime immutable
    details: 单次页面 Runtime 的 Plugin Set、Provider 和 Contribution 保持不可变，配置通过 Reload 生效。
    icon: 🔒
    link: /lifecycle-architecture
  - title: Observable by default
    details: Inspector 分别投影 Plugin、Surface Instance、BridgeSession 和 Subscription 的运行事实。
    icon: 🔎
    link: /plugin-api-reference
---

## 从哪里开始

按角色选择入口：

| 你要做什么 | 推荐阅读 |
| --- | --- |
| 编写一个 Restricted Plugin | [Plugin Author Guide](./plugin-author-guide) |
| 查询公开 TypeScript API | [Plugin API Reference](./plugin-api-reference) |
| 定义 Manifest 或 Host Contract | [Manifest / Contract Spec](./manifest-contract-spec) |
| 理解 Bootstrap、挂载和失败边界 | [Lifecycle & Architecture](./lifecycle-architecture) |
| 查看当前 Host 能力 | [Capability Catalog](./capability-catalog) |

## V1 的一句话模型

```text
Builtin Plugin → Direct activate
Restricted Plugin → Manifest-first → on-demand Surface → Wujie → PluginBridge
```

完整规范见仓库中的 `spec/技术落地方案.md`；站内的拆分版从左侧导航进入。

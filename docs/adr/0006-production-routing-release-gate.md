---
status: accepted
---

# 目标环境 SPA fallback 验证是路由生产启用门槛

本轮不修改生产基础设施，但 routing capability 不能仅凭开发服务器、构建预览通过或文档提醒就在生产开启。目标环境必须提供真实深链接刷新 smoke test，以及 API、plugin artifact、静态资源和相应缺失资源不被错误 rewrite 的证据；未完成验证时能力保持关闭。Gate 属于版本/环境发布流程，基础设施可以由其他仓库或团队交付，但其验证不能从 rollout 中省略。

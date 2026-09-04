---
status: accepted
---

# 生产构建默认启用 Host 路由

生产构建直接包含 Host routing capability，不再以目标环境证据作为编译期开关。`pnpm build` 默认生成启用路由的产物，测试 fixture 仍只进入显式 validation 构建。

目标环境 smoke、SPA fallback、资源 rewrite 和性能预算验证继续保留在 `build:routing-release` 流程中。该流程用于生成带目标证据的受控发布产物，不改变普通生产构建的路由开关。

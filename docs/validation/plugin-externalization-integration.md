# Externalization 集成验证

日期：2026-09-12。实现与使用说明见 [维护者指南](../../apps/docs/docs/maintainers/plugin-externalization.md)。

## 结果

- 全仓 typecheck、边界检查通过；公共包 build 已纳入 typecheck，避免新 checkout 依赖已有 dist。
- 单元与构建规则测试：27 个仓库脚本测试、236 个 Runtime 测试、5 个 Federation 接线测试通过。
- Console 生产预览：43 个 E2E 测试通过；随后增加的 Health Tab 回归也单独通过。
- 独立目录验证：14 个场景通过，全部通过实际 tarball 和公开 exports 消费包。
- 文档站生产构建通过；设计稿的工作站绝对路径改为仓库路径说明，避免发布死链。

## 独立安装的实际版本

Host 和 Remote：Rsbuild 2.2.2、Rspack 2.2.2、Federation Runtime/runtime-tools 2.9.0、React/ReactDOM 19.2.8、SDK 0.1.0。Restricted 使用 Rspack 2.2.2，不接入 Federation share scope。

独立 npm 项目使用 Rspack override 并保留 lockfile；仅固定 Rsbuild 2.2.2 时，其传递依赖曾解析到 Rspack 2.2.3。本轮最终结果已重新在 2.2.2 下验证。

## 覆盖

- 七个公共包的 tarball 依赖没有未解析的 workspace/catalog；独立 Host、Builtin 与 Restricted 分别安装和 typecheck，不继承根 paths/tsconfig，不复制构建工具源码。
- 跨 origin Remote 在既有 BrowserHost 中注册 Route、Slot、Action、Tab；Hooks、显式 ResourceRef Context、受管 CSS 可用。重新挂载复用成功模块，不增加 Remote JS 请求。
- entry 404、身份错配、超时只过滤对应 feature；缺失 Core 时进入原 break-glass，并保留 entry 和准备阶段诊断。
- 启动中卸载及超时后迟到结果不创建晚到 Store/UI；正常卸载清理 CSS。
- 独立发布的 KubeEye 经 Host 同源路径映射加载，Bridge 请求、订阅停止与销毁可用。
- 单独的开发构建验证 StrictMode 两次准备调用只创建一次 Store。静态开发产物关闭 Fast Refresh；不依赖 dev server/HMR。
- 原 PoC 的共享身份、严格版本拒绝和 CSS 单一所有者门槛在本轮实现期间重跑通过。原历史报告保留，新接线另外有导出校验、失败隔离和超时单测。

Health Tab 验证发现并修复了示例原有的 Context 使用错误：独立 Tab Root 不继承外层 RoutePresentation，现使用扩展点提供的 ResourceRef.name。未增加 Runtime Provider 转发机制。

## 本地性能观测

本次 Remote 制品共 2 个 JS 文件，原始 133525 bytes，逐文件 gzip 合计 36164 bytes。启动取 entry 和 expose 两个 JS 请求；Remote CSS 在首次需要其 UI 时请求。

本机静态服务下，从导航到 Remote Route 首次呈现为 103 ms；同页卸载后重新挂载为 25 ms，未重取 Remote JS。该测量包含 UI/CSS 就绪，**不是单独的 bootstrap Runtime Ready 时间**，也不作为性能门槛或生产 CDN 延迟预测。

## 复现与边界

运行 `pnpm test:externalization`。完整结果与三个独立项目的 npm lockfile 位于 `test-results/externalization/`，制品和独立目录按结果中的 scratch 路径保留。CI 在 Playwright 测试之后执行它，避免 Playwright 清空证据目录。

未在真实 CDN 验证缓存、CSP、CORS/MIME 和版本目录保留策略，未向 npm registry/CDN 实际发布。此集成脚本没有新增跨源 Wujie entry 支持、运行中换版、跨 Git 仓库发布流水线或完整生产网络性能基准。跨版本 pin 回退仍按文档通过不可变制品目录和 reload 操作。

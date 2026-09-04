# Host routing 验证记录

日期：2026-09-04。源码基线 `0631b880ff806a1d0b491c19ff88b236916e39de`，在当前工作树实现后验证。性能报告包含独立产物 hash；不把基线 commit 冒充最终代码版本。

## 自动化结果

| 命令 | 实际结果 |
| --- | --- |
| `pnpm test` | 184 项通过：tooling 5、runtime 139、Host 40 |
| `pnpm typecheck` | 所有 workspace 通过 |
| `pnpm build` | runtime、Host、plugin、文档均通过 |
| `pnpm build:docs` | 更新后的 contract / 实施文档通过 |
| `pnpm test:e2e` | 开发服务器 14 项通过 |
| `pnpm build:routing-validation` + `pnpm test:e2e:preview` | 生产优化构建预览 14 项通过 |
| `pnpm build:routing-release`（不提供 evidence） | 按预期以非零状态拒绝启用，错误为缺少 target config/evidence |
| 普通生产 bundle 检查 | 不包含 `/__fixtures__/surfaces` 入口 |

Node 实际版本为 24.14.1，满足当时的 >=22.22.0；正反例及 CLI 非零退出路径有测试。此记录不表示 GitHub CI 或真实生产域名已经运行。

## 真实 Wujie 测量

80 个最终样本，每场景 20 个，均无失败/计划外取消，最终 rAF 计数未发现 Surface 已无可见内容且未显示 loading 的帧。下表时间单位为 ms；可见时刻要求真实 Restricted 内容、Bridge connected 且进入视口。

| 场景 | n | 可见 p50 | 可见 p95 | loading 出现 p95 | 失败 / 取消 | 空白帧 |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| first-cold | 20 | 93.8 | 116.1 | 18.2 | 0 / 0 | 0 |
| repeat | 20 | 83.7 | 104.2 | 12.5 | 0 / 0 | 0 |
| params | 20 | 90.0 | 106.5 | 19.6 | 0 / 0 | 0 |
| query | 20 | 97.4 | 105.2 | 10.8 | 0 / 0 | 0 |

原始数据：[最终样本](./host-routing-performance-2026-09-04.json)、[调整前样本](./host-routing-performance-2026-09-04-before-loading-fix.json)。设备、浏览器、网络、缓存、原始时刻、instance identity 和产物 hash 均记录在 JSON。

最终运行与本地 dev E2E/build 有部分并行，未做 CPU 隔离。初测空白帧计数也包含 Surface 状态节点出现前的旧页面帧；最终计数收窄到实际 Surface 状态，且 loading 改为 layout effect。保留两个原始报告供追踪，不能只凭聚合数字把全部差异归因于单一改动。

本机样本不是生产环境的稳定延迟分布。目标环境及体验预算尚未提供，因此 `accepted: false`，生产 routing 保持关闭。真实 target fallback、API/plugin/JS/CSS rewrite 排除、authenticated access（如需要）和体验预算，仍须通过发布 gate 验证。

## Standards

未发现需要修复的项。硬规则 0 项；有明确维护风险的 possible smells 0 项。集中 Route Model、独立 ownership、共享 policy、双轴 inspection 和 release gate 符合 ADR 0001–0006。

## Spec

未发现剩余 missing/partial、scope creep 或错误实现。生产环境未提供与本地性能未获验收是明确的环境限制，启用保持关闭。

审查发现的 Q20 参数覆盖问题已修复：诊断占位 Route 使用与模型参数不冲突的名称；CONFLICT 下父 Context 从独立父匹配提取参数，合法 sibling 仍可复用。真实 RR 测试先重现覆盖，再验证修复。审查者独立复跑 compatibility/navigation 两文件的 9 项测试通过，后续完整验证结果见上表。

最终剩余发现：Standards 0，Spec 0；两轴均无未解决问题。

## 2026-09-05 配置更新

后续决策将运行时限制为 `Node >=24.14.1 <25`，并让普通生产构建默认启用 routing。上文“生产 routing 保持关闭”仅记录 2026-09-04 验证时的发布状态；当前行为以 ADR 0016 和实施文档为准。目标环境 smoke 与性能证据仍由专用 release workflow 验证。

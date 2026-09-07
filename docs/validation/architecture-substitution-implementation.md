# 替代性消融落地与验证

日期：2026-09-07。依据第二轮报告落实已有实现中的 S1–S3。Tab、Action、Profile 和 Host/Core 物理拆分仍属于后续目标，不因本次修改变成已实现能力。

## 已修改

- Restricted Surface 删除独立 activation 与可变声明目录，统一通过 Contribution Registry 接纳。原 `runtime.surfaces.get/list` 保留为 Ready 时派生的只读索引；`get` 使用 Map 查找，避免实验原型的列表扫描。
- 删除自写 `matchSpace`，隔离路由的 URL 成员匹配复用 React Router。保留路径语言、冲突治理、祖先关系与非法编码拒绝。
- UI runtime 创建时快照 Point、Surface、Contribution 并编译静态准入事实；Context 与 selection 仍逐次校验。声明和 policy 的变更须创建新 Runtime。
- policy 异常拒绝相应关系，在 inspection 中报告 `POLICY_ERROR`；不暴露异常内容，也不阻断健康贡献。新测试覆盖异常隔离、迟到声明不可见、策略冻结与新 Runtime 接纳变更。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm test` | 5 项脚本、155 项 Runtime、49 项 Host 测试通过 |
| `pnpm typecheck` | 全 workspace 通过 |
| `pnpm build:routing-validation` | 验证构建通过 |
| `pnpm test:e2e:preview` | 24 项真实 Chromium 验收通过 |
| `pnpm build:docs` | 文档构建通过 |
| 两轮历史实验脚本 | 固定到原始基线后复现成功，未改写现行源码 |
| `pnpm routing:measure --local docs/validation/host-routing-performance-2026-09-07-substitution.json` | 4 个场景各 20 次，零失败、零取消、零空白帧 |

新增 3 项 Runtime 测试与 9 个参数化 Host 用例，分别覆盖只读 Surface 目录、静态准入行为以及冲突 URL 编码。现有浏览器用例验证父 Layout 保持、叶子重挂载、嵌套贡献、Overlay retry、卸载和迟到资源清理。

[性能记录](./host-routing-performance-2026-09-07-substitution.json)中的可见时间 P95：首次冷访问 109.4 ms，重复进入 96.1 ms，参数变化 98.6 ms，query 变化 99.0 ms。这是本地运行特征，无批准的生产预算，因此记录中的 `accepted: false` 不表示样本失败，也不构成生产发布验收；没有声称相对旧实现的速度提升。

两轮实验通过 [固定基线辅助脚本](./architecture-baseline.mjs) 恢复 commit `e1b594c3a12816b05c4e7310bd2cf121fa6ae81d` 中的源码和测试到临时目录，继续对照原实现。历史结果与现行实现的测试分开记录，实验补丁不是最终实现补丁。

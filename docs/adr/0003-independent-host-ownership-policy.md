---
status: accepted
---

# Host ownership policy 独立于 React Router ranking

Host 在受支持的 Route grammar 上结构化判定匹配空间的相交、包含与等价，并独立定义 same-owner deterministic specialization；不复制、读取或依赖 React Router 的 `computeScore`、`rankRouteBranches` 或声明顺序作为治理依据。React Router 固定为 `8.3.1`，仅执行合法 Route Model 的匹配、history 与 nested rendering；ownership policy tests 验证 Host 自身规则，compatibility tests 则把合法模型的生成 URL 交给真实 `matchRoutes()`，核对执行 winner 与 Host 预期。有限 URL 抽样不是冲突证明，依赖升级必须作为显式动作重新运行兼容性防线，不能让路由库内部评分变化隐式改变平台 ownership。

---
status: superseded by ADR-0017
---

# Host 统一承担页面路由，插件内部导航保持独立

Host 内置 Overview 与插件页面采用统一 Route 模型，由常驻 Host Shell 根据当前 Route 展示对应内容，不为首页建立 Router 之外的特殊渲染路径。Host 负责 Route 实际匹配空间的歧义检测，并保留 contribution ancestry 与 owner；仅按 path 字符串判重或直接接受 React Router 按声明顺序选出的赢家，都不足以表达 ownership 规则。Host URL 是各页面贡献共享的契约，而 Restricted Plugin 的内部 URL 属于另一层导航，因此本轮不新增插件主动导航 Host 的 Bridge，也不启用 Wujie URL 双向同步，避免将通配 ownership 隐式扩大成跨边界导航协议。

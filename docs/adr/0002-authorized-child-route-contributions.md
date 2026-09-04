---
status: accepted
---

# 以显式授权的父子 Contribution 扩展 Route

跨 owner 的 Route 匹配空间重叠默认拒绝，只有父 owner 显式开放 Child Route Extension Point、且统一 Host Contribution Policy 授权贡献 owner 的 parent/child composition 才获得例外；引用父 Route 或共享路径前缀本身都不构成授权。Host 组合 child 相对路径并保留 ancestry 与参数归属，父 Layout 保持挂载、通过标准 `<Outlet />` 渲染 child；本轮不引入任意位置注入的跨插件 UI 容器协议，Navigation 也仅复用当前与目标匹配链共同祖先声明的参数，而非任意同名参数。冲突隔离以 Route Contribution 为最小单位，缺失或不可用祖先导致其后代不可达，但两个 child 的冲突不会反向判废合法 parent，也不会扩大为整个插件失败。

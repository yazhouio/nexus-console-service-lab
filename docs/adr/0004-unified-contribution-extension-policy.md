---
status: accepted
---

# Route 与 Navigation Extension 共用平台治理入口

父 owner 显式声明 Route children 或 Navigation container 可扩展，由统一 Host Contribution Policy 判断具体 contributor 是否获准，避免形成相互独立的 Route Policy 与 Navigation Policy 配置面。该决策复用接入平台的 trust/installation 治理入口和配置载体，但不复用 Bridge action permission 的含义，也不允许 child 通过声明父引用自行授权。共享的是平台信任决策面，不是任意位置注入 UI 的容器协议；示例仓库尚无统一治理实现，落地时必须提供明确的 Host 策略来源，不能假定已有可调用的平台接口。

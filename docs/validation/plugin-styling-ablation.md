# 插件样式方案消融实验

日期：2026-09-10。对象：[插件样式设计稿](../../apps/docs/docs/maintainers/plugin-styling-design.md)。实验保留用户确认的职责：平台定义视觉语义，Plugin Build 生成资产，Browser Runtime 按实际 Presentation Root 的呈现位置管理生命周期，插件拥有内部样式。Builtin 使用既有 DOM/CSS 环境，Restricted 使用既有 Wujie ShadowRoot，不引入新的隔离模型。

结论：最小方案成立，但应把“必须保留的行为”与“可替换的表示方式”分开。必须保留公共 Token、构建资产事实、实际样式挂载目标、共享引用寿命及失败/清理时序；不必固定新的 Artifact JSON、hash 文件名、独立计数器类型或公共样式管理服务。现有 Wujie 路径不需要新增主题桥接，也没有本次实测支持的缓存修补需求。

## 1. 方法与证据范围

设计中的 CSS Loader 尚未落地，因此不能直接对生产 Loader 做删除变异。本轮建立一个仅用于验证的 browser 资产加载原型，接入**未经修改的生产 `createUiRuntime` 与 Contribution Registry**；运行真实 Chromium 与仓库已安装的 Wujie 2.1.0，并用现有 Rsbuild 编译 CSS Modules 产物。

构建两个源码修订（V1 / V2），再对 V2 做一次关闭 filenameHash 的输出替代，共三次真实构建。所有构建发生在临时目录，结束后删除。探针中的 private Loader、DOM driver、测试页面不是生产 Browser Host，也不是可直接交付的 Runtime 实现。

分别记录：

- **浏览器原型实测**：固定场景中的 CSS computed style、实际 link 数量、生产 UI core 的状态及清理结果。
- **等价替代 / 附加对照**：生成数组替代包装对象、版本 URL 替代 hash 文件名、额外添加实时 Token 复制；不伪装成三个已实现公共服务的删除实验。
- **源码 / 设计反事实**：公共 API、生产装配与未覆盖适配器的取舍，不计入测试通过数。

全部变体执行同一套 12 项检查；基线失败时停止解释消融结果。最初校准探针时修正了夹具容器的文本节点问题，最终记录仅包含校准后的完整运行。负向变体中的失败是有意移除约束后的观察，不是生产代码回归。

没有调用新的 ShadowRoot 构造来隔离 Builtin；实验中出现的两个 ShadowRoot 都由真实 Wujie 为 Restricted 创建。将 Builtin 内容置于其已有 Anchor，只验证现有组合位置所需的 CSS 投递，未增加业务支持范围。

## 2. 固定检查

| 检查 | 可观察判据 |
| --- | --- |
| theme-inheritance | Host 平台 Token 在 Builtin、Wujie 内部和 body 下的 Overlay 具有相同语义值；修改根主题属性后同时更新 |
| selector-ownership | 插件自己的元素按预期变化，Host 与嵌套 Builtin 的元素不被误改；Host 私有 class 不穿透 Wujie |
| shared-lifetime | 两个 Presentation 共享一个 link；关闭一个仍有样式，关闭最后一个移除 link |
| actual-style-root | 同一 URL 在 Host Document 及两个已有 Wujie ShadowRoot 各挂载一份；各处可见 CSS 正确且清理后归零 |
| ready-gate | 必需 CSS 到达前没有业务 DOM；之后生产 UI core 的执行进入 ready |
| failure-rollback-retry | 两文件中一项 404 时进入 artifact 失败，无业务 DOM 和残留 link；修复后显式 retry 成功 |
| cancel-shared-load | 取消一个 pending 使用者不取消另一个；最终没有迟到 DOM 和残留 link |
| dom-cleanup-order | DOM 仍在异步卸载时保留 CSS，DOM 清理后释放 |
| build-asset-identity | V2 CSS Modules JS 配对 V2 构建 CSS，真实颜色、padding 与映射一致；卸载后回收 |
| bounded-failure | 未响应 CSS 在探针 350ms deadline 后进入 artifact 超时；800ms 是外部观察上限，不是产品默认值 |
| slot-overlay-lifetime | 复用现有 Slot/Overlay 流程；hidden 保留 Attempt，子 Slot 卸载不影响 Overlay，Owner 结束后全部清理 |
| single-css-owner | Runtime 释放 CSS 后无同 URL link；新建同 class 探针元素不再被原业务 CSS 命中 |

这些检查验证固定需求，不将新增公共类型、包数、代码行数或抽象名称作为成功标准。

## 3. 结果

19 组 × 12 项，共 **228 次检查：200 通过，28 次预期失败**。基线 12/12 通过；等价替代和附加桥接对照均为 12/12。没有未捕获的 page error 或基础设施错误。

| 变体 | 通过 / 失败 | 观察与判断 |
| --- | --- | --- |
| baseline | 12 / 0 | 无 ThemeManager、StyleRegistry、主题 RPC、新隔离容器，仍闭合固定场景 |
| direct-generated-list | 12 / 0 | 去掉探针的 `{ assets: { css } }` 包装后行为不变；保留生成的 CSS 地址事实即可 |
| versioned-url-no-hash | 12 / 0 | V2 实际输出 `static/css/index.css`，由版本目录区别产物；文件名内 hash 不是必要条件 |
| live-token-copy | 12 / 0 | 额外使用 MutationObserver 将根 Token 实时复制到 Wujie Host，无新增可观察收益；基线的原生继承已足够 |
| no-platform-tokens | 11 / 1 | 三处落入 fallback 黑色，未获得平台指定视觉值 |
| plugin-token-defaults | 11 / 1 | Restricted 自带 `:root` 同名变量后变红，Builtin / Overlay 仍取平台色 |
| global-selectors | 11 / 1 | `.pluginA button` 命中嵌套 Builtin，Host 私有 class 的全局规则也造成污染；Wujie 内部仍隔离 |
| document-only | 11 / 1 | link 分布变为 `[1,0,0]`，两个已有 ShadowRoot 中的 Builtin padding 从 `17px` 退化为 `0px` |
| url-only-dedupe | 11 / 1 | 投递目标本可正确，但跨 root 错误复用同 URL 项，产生同样的样式缺失 |
| no-dedupe | 10 / 2 | 可见业务样式尚可成立，但同 root 出现两份 link，违反明确的去重目标 |
| no-reference-lifetime | 9 / 3 | 第一个使用者释放后幸存 UI padding 变为 `0px`；取消还会误伤另一个 pending 执行 |
| no-final-release | 3 / 9 | 最后使用者离开后 link 留存；关闭、失败、超时等路径均不能按执行寿命回收 |
| no-ready-gate | 11 / 1 | CSS 尚未到达，执行仍为 starting，但业务 DOM 已出现 |
| no-failure-rollback | 9 / 3 | 部分加载、取消、超时留下资源；不能只处理成功路径的 dispose |
| retain-failed-cache | 11 / 1 | 原型缓存永久保留失败 Promise，修复资源后的 retry 仍失败 |
| release-on-abort | 11 / 1 | 仍 connected 的 DOM 在异步清理期间已失去 CSS，padding 为 `0px` |
| handwritten-stale-assets | 11 / 1 | 把 V2 JS 配回旧 V1 CSS，class 映射失配，颜色及 padding 均退化 |
| no-deadline | 11 / 1 | 未响应资源在整个外部观察窗口仍为 starting；源码中已无结束等待的 deadline |
| host-static-import | 11 / 1 | Runtime 正常释放后仍有一份 Host link；同 class 新元素继续得到 `17px` padding |

**不能把失败数量当作架构重要性评分。** 例如最后引用释放被多个场景重复观察，所以失败较多；它不因此比 Token 语义“更重要”。

## 4. 可以消掉什么

### 4.1 固定的 Artifact 包装与额外 Manifest 文件

必须有构建派生的完整 CSS 地址事实，不必让 Runtime 先获取一个新的统一 Manifest，再交给公开 Artifact Loader。

对当前静态 Builtin，Distribution 可直接取得构建生成的 `readonly string[]`，关联已选定的插件定义。是否使用 `assets.css` 包装由已有加载输入决定。实验去掉的仅是 Runtime 输入包装；Rsbuild 自己的构建 manifest 仍用作派生来源，因此本轮**没有证明应删除构建工具元数据**。

`handwritten-stale-assets` 证明的是 JS/CSS 错配会破坏呈现，不证明任何手写配置都不可能正确。推荐构建生成的理由是消除持续双写和遗漏风险，而非宣称 Runtime 能自动修复旧清单。

### 4.2 “必须 hash 文件名”

保留不可变产物身份，允许两种等价地址：内容 hash，或不可覆盖的版本目录加稳定文件名。版本目录能被覆盖时，该替代不成立。实验服务提供 `Cache-Control: no-store`，只验证身份、定位与呈现，没有验证 CDN 缓存策略。

### 4.3 主题复制链路

无复制的基线与增加实时复制的对照都通过相同检查；后者多出读取、写入、观察和断开职责。本次范围没有收益，V1 保持原生继承，不引入快照、事件、桥接订阅或全局主题状态副本。

不是把一个已实现的 ThemeManager 删除后测得等价，也不外推为 Canvas、真实 iframe 呈现或每个 Slot 独立主题永远不需要额外机制。

### 4.4 新的公共样式生命周期对象

原型通过现有 `UiDriver.mount`、Attempt signal、`UiMounted.dispose`、`core.failAttempt` 完成固定场景，没有需要插件调用的 `registerStyles()` 或新业务 Capability。

保留共享消费者的寿命事实，不规定必须公开 `StyleLease`，也不强制使用计数器而不能用内部持有者集合。一个短小的内部实现可集中资源管理；公共 StyleRegistry、StyleScope、StyleSession 都没有本轮证据支持。

## 5. 哪些行为不能删，为什么

### 5.1 Presentation Root 的归属与 CSS 的实际挂载目标不能混为一个键

同一 Document 可以承载多个不同的 Presentation Root；这时同 URL CSS 应共享。多个既有 Wujie ShadowRoot 又必须各自挂载，即使 URL 相同。`shared-lifetime` 与 `actual-style-root` 一起约束了两边。

因此 Browser Runtime 从已有 Presentation Root / 物理 Anchor 得到真实 Document 或既有 ShadowRoot，再在那个目标内去重。不要为每个 Presentation Root 新造 CSS 容器，也不要把 Presentation Root ID 直接当作 CSS 去重分区。JS realm、ownerPluginId 和逻辑执行身份都不能替代这个物理事实。

### 5.2 去重与共享引用寿命是一个组合决策

`no-dedupe` 并未观察到业务外观损坏，主要损失是重复样式节点。因此不能说“没有 dedupe 就一定视觉错误”。如果明确接受每个 Attempt 独立 link，可以用更简单的独立释放，但会放弃用户已经要求的去重能力。

在保留共享节点的前提下，`no-reference-lifetime` 实测会误删仍在使用的资源。真正不可省的是“最后一个使用者离开才回收”的语义，不是某个类名或某个 `refs` 字段。

### 5.3 不依赖新容器，也必须约束双方 selector

私有根 class 后接裸元素 selector 仍会覆盖嵌套 Builtin。这不是增加 `@layer` 或换一种 CSS 编译器就能解决的问题。Host、Core 和插件都应给自己创建的元素明确归属，避免跨 Anchor 的宽泛后代规则。

这是工程约束，不是针对恶意 Builtin 的强隔离保证。对照不支持扩大 V1 隔离模型。

### 5.4 错误与清理要闭合到已有 Attempt

需要保留必需 CSS 就绪门槛、有限等待、artifact 错误归属、失败回滚、取消隔离、失败缓存驱逐及“DOM 清理后释放”。它们共同决定用户是否看到缺样式 UI、是否能 retry，以及仍在显示的另一执行是否受影响。

这些是呈现与资源管理要求，不需要额外的 CSS 业务状态机。350ms 只是实验 deadline；生产值应沿实际加载预算决定，不从实验数值推导产品配置。

### 5.5 Build 与 Runtime 只能有一个业务 CSS 挂载所有者

`host-static-import` 中 Runtime 的引用清理完全正常，但业务 CSS 仍生效。新增 Loader 无法代替构建调整：插件 CSS 不得继续作为 Host 总样式或自动注入副作用常驻。

本轮真实构建覆盖 CSS Modules 的初始 CSS 配对；没有验证完整生产应用的异步 CSS 闭包、第三方注入、HMR 或跨插件 chunk 提取。因此“清单完整且无双重挂载”仍是生产实施验收项，不能因本探针通过就直接宣布完成。

## 6. Wujie 缓存的独立观察

除上述矩阵外，对真实 Wujie 做了一次有明确触发的兼容性观察：入口 HTML 和 CSS URL 保持相同，CSS 第一次返回 404，销毁实例后换新实例名重试，CSS 第二次返回 200。

| 时刻 | loadError 次数 | 可见 padding |
| --- | --- | --- |
| 首次启动 | 1 | `0px` |
| 同入口重试 | 0 | `17px` |

当前安装版本在这个场景恢复成功。源码 `esm/entry.js` 也会在失败路径清除对应资源缓存。原设计中“可能需要修补 Wujie 缓存”的担忧不构成实施前置任务；保留回归验收即可。

这项观察没有绕过现有 Wujie 机制，也没有复制 Restricted CSS 到 Host。它不覆盖所有动态资源失败，且未经过生产 Nexus Bridge 握手；不能外推为完整 Restricted 执行失败恢复已经验收。原型中的 `retain-failed-cache` 是故意写坏的 Builtin 缓存对照，不是本轮发现的 Wujie 缺陷。

## 7. 未做运行消融的设计取舍

| 项目 | 取舍与依据 | 证据类型 |
| --- | --- | --- |
| 新增 CSS 字段到 Kind/Profile/Point/Slot/Contribution | 无需求；当前业务声明不带 CSS，原型已完成固定行为 | 现有类型 + 原型支持；不是完整生产装配验证 |
| CSS Modules / StyleX / Tailwind 专用 Runtime Adapter | 不新增；依赖输出 CSS 资产与插件构建规则 | 本轮仅真实编译 CSS Modules；另外两种是输出契约层面的推断 |
| 每个 Surface 一份样式声明 | V1 不新增；沿 Artifact 完整 CSS 列表管理 | 原型覆盖完整列表，没有测生产动态 chunk 图 |
| 全局 layer 注册表、CSS AST 清洗 | V1 不新增；不会代替 selector 归属 | 设计反事实，未写替代编译器 |
| 将 CSS 网络加载放入 activate / Runtime Ready | 不采纳；生产代码区分声明就绪与 UI 执行 | 源码判断；未执行 Bootstrap 和 Break-glass 验收 |
| 为主题改造容器尺寸、overflow、排序 | 不需要；与视觉语义和资产生命周期无关 | 职责判断；实验 DOM driver 不验证生产 layout |

## 8. 收敛后的实施要求与复现

将方案压缩为四项：

1. 平台维护一个公开 Token 定义来源，并提供页面级主题 CSS；插件消费这些变量。
2. Plugin Build 生成可关联到现有插件产物的 CSS 地址列表，保证同次构建及单一挂载所有权。
3. Browser Runtime 内部按实际 Document/既有 ShadowRoot 管理 URL 共享、等待和引用释放，复用现有 Attempt/Presentation 清理。
4. Restricted 继续由 Wujie 加载内部样式并原生继承 Token；双方执行样式归属约束。

不增加公共主题/样式管理服务，不冻结新的 Artifact 包装格式，不扩大隔离或业务协议。实验只支持收敛设计，并不授权将探针复制成未验收的生产实现。

复现命令（使用已安装的 workspace 依赖及 Playwright Chromium）：

```sh
node docs/validation/plugin-styling-ablation.mjs
```

脚本临时构建、启动仅监听 loopback 的随机端口服务、逐场景创建浏览器页面，并在结束时关闭连接及删除临时产物。完整可执行夹具见 [runner](./plugin-styling-ablation.mjs) 与 [browser probe](./plugin-styling-ablation.browser.js)；机器记录、环境版本、源码 SHA-256、构建资产和每项观察见 [results JSON](./plugin-styling-ablation-results.json)。临时目录参与构建路径，重跑时文件 hash 和生成 class 名可能改变，判据基于行为与同次构建关系，不要求字节完全一致。

本轮没有修改生产源代码、安装依赖、重跑完整项目 E2E 或将设计标为已实施。工作区原有 `pnpm-lock.yaml` 改动未参与本次修改。

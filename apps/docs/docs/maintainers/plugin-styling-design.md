---
status: implemented
---

# 插件样式与 Design Tokens 最小方案

平台统一视觉语义，构建负责生成 CSS，Browser Runtime 负责把样式资产送到实际呈现位置并管理引用，插件负责内部样式。Builtin 保持 Direct Host Realm 和现有 DOM 挂载方式；Restricted 保持 Wujie ShadowRoot。不增加新的样式隔离容器，不修改 Kind、Profile、Point、Slot、Contribution 的业务语义。

本文是设计提案，依据当前仓库源码及 CSS / 工具官方资料。部分机制已完成浏览器原型消融实验（仓库内 `docs/validation/plugin-styling-ablation.md`），并据此收敛；V1 生产接线与验收见[实施记录](./plugin-styling-implementation.md)，下文保留设计时的事实基线和约束；原型结果不替代生产 Browser Runtime、构建链路和呈现验收。

## 现状与实施接入点

| 当前事实 | 对设计的影响 |
| --- | --- |
| `apps/console/src/main.tsx` 静态导入 Console Core CSS，`plugins/deployment.tsx` 静态导入业务 CSS | 当前样式属于 Host 构建副作用，不能只删除 Runtime 引用便声称完成 CSS 回收 |
| `packages/console-core/src/styles.css` 混合 `--kube-*`、全局 reset、元素规则和产品 class | 必须拆开公共 Token、少量平台 baseline 与 Core 私有业务 CSS |
| cluster、deployment、extension-demo 等复用 `nexus-*` class；deployment 扩展还复用主插件的 class | 独立资产化前需要清理隐式样式依赖 |
| `packages/plugin-runtime/src/browser/ui-host.ts` 已负责挂载、布局、显示隐藏、Overlay 与清理 | 样式资源引用应加入现有挂载与 dispose 流程 |
| `ui/runtime.ts` 的 Execution Attempt 已有 AbortSignal、失败、重试及异步清理 | 无需另建 Style Scope 或 Style Session |
| Builtin 定义在 Distribution 静态组装；仓库尚无统一 Builtin Artifact Loader | 在 browser 加载实现内补资源管理即可，不假定已有同名公共服务 |
| Wujie adapter 已提供 `loadError`、`artifact` 失败阶段与实例销毁 | Restricted 资产继续由该加载路径负责 |

职责分配：平台维护 Token 契约；Distribution 选择并固定主题资产和插件产物；Host 加载平台主题；Browser Runtime 管理插件资产；Presentation Adapter 协调 CSS 就绪、DOM 挂载与卸载；Console Core 负责产品级页面布局与视觉；Browser Runtime 根据既有 Point/Slot/Presentation 规则负责插件呈现容器布局；插件负责内部业务布局与视觉。

## 1. Design Tokens

### 契约范围

公开颜色语义（正文、弱文本、画布、表面、边框、主操作、危险、焦点）、间距尺度、字体族、字号、字重、行高、圆角和必要阴影。保留平台命名空间 `--nexus-*`；插件私有变量使用自己的命名空间，例如 `--deployment-*`。

Token 表示视觉选择，不包含组件 class、selector、Tailwind 配置、StyleX 对象、主题 RPC、Slot ID、尺寸策略或 Overlay 层级控制。平台可给 Overlay 外壳使用边框及圆角 Token，但 Token 不授权插件修改容器。

Token 也不保证不同插件渲染完全相同的按钮或表格；像素级组件一致性属于可选公共组件库的契约，不属于本方案。

### 表示与唯一事实来源

运行时契约是有文档、有单位语义的 CSS Custom Properties。V1 以一个独立于 Console Core 的平台 Token 目录维护权威 CSS 和契约说明；无需先引入 Token 数据服务。未来有多目标生成需求时，可以改为从一个结构化源生成 CSS、类型和文档，但不能同时手工维护 CSS 与另一份 TS/JSON 数值表。

示例名称和值用于说明形态，最终值由平台设计规范确定：

```css
:root {
  --nexus-color-text-primary: #242e42;
  --nexus-color-surface: #ffffff;
  --nexus-color-border-default: #e3e8ef;
  --nexus-color-action-primary: #3385ff;
  --nexus-space-2: 8px;
  --nexus-space-4: 16px;
  --nexus-font-family-body: system-ui, sans-serif;
  --nexus-font-size-body: 14px;
  --nexus-line-height-body: 1.55;
  --nexus-radius-md: 6px;
}

:root[data-nexus-theme='dark'] {
  --nexus-color-text-primary: #e7edf6;
  --nexus-color-surface: #202838;
  --nexus-color-border-default: #44516a;
  --nexus-color-action-primary: #7aafff;
}
```

Host 在首次插件 UI 呈现前加载主题；主题定义放在 Host `documentElement`，使 `body` 下的 Overlay 同样继承。主题选择归 Host 的现有设置流程；CSS 当前生效值是呈现事实，不再在 Runtime 维护一份 Token 状态。V1 一个页面只有一个平台主题，切换根属性即可驱动 CSS 重算，不重挂插件。暗色变体只有在整套 Token 补齐后才发布，示例不是完整暗色主题。

新增 Token 是兼容扩展，重命名、删除或改变含义是契约破坏；主题数值变化不等于 Token 契约升级。契约版本通过平台包/发布文档管理，兼容范围可在安装或构建检查，V1 不引入运行时协商。保留的旧名如需兼容，作为同一平台资产内的别名生成，不维护两份值。

Token 应提供可直接消费的长度及单位约定；使用 `rem` 时必须明确它取决于呈现文档根字号，不能假定 Wujie JS iframe 根字号就是可见 DOM 的字号。V1 示例使用明确长度，字体采用系统字体栈，不新增字体下载管理。

### 两类插件的消费方式

两类插件都在自己的 CSS 中使用同样的变量：

```css
.deploymentPanel {
  color: var(--nexus-color-text-primary);
  background: var(--nexus-color-surface);
  padding: var(--nexus-space-4);
  border: 1px solid var(--nexus-color-border-default);
  border-radius: var(--nexus-radius-md);
  font-family: var(--nexus-font-family-body);
  font-size: var(--nexus-font-size-body);
  line-height: var(--nexus-line-height-body);
}
```

Builtin 直接继承平台变量。Restricted 在可见 ShadowRoot 内继承变量，同时自行声明字体、背景和内部 reset；不能靠 Host 的 `button` 或 `.nexus-button` 规则美化内部 DOM。

标准 CSS Custom Properties 默认继承，且继承可沿 Shadow Host 进入 Shadow Tree；这与普通 selector 穿透是不同机制。依据：[CSS Custom Properties](https://www.w3.org/TR/css-variables-1/#defining-variables)、[CSS Shadow 的继承说明](https://drafts.csswg.org/css-shadow-1/#flat-tree)。

插件不得重定义保留的 `--nexus-*`，也不得将它们注册为 `inherits: false`。需要业务局部变体时定义自己的变量或直接修改自己的样式属性，避免改变嵌套插件的公共输入。独立开发预览从平台包加载默认主题；集成产物不携带会遮蔽 Host 值的同名默认定义。新 Token 的可选兼容可使用 `var(--nexus-new-token, fallback)`，不以 fallback 掩盖整个主题缺失。

## 2. Builtin CSS 的加载、去重、失败和回收

### 资源粒度与时机

V1 每个 Builtin Artifact 提供一个有序 CSS 列表；列表覆盖该插件所有 UI，包括异步 JS 所需的 CSS。可以物理合成一个文件，但协议不限制只能一个文件。首次 UI 执行前加载，CSS 全部就绪后才调用 `renderBuiltin`。纯 Action 不为此加载 UI CSS；activate 继续只注册声明，不等待 CSS 网络请求，不改变 Runtime Ready 含义。

每个 Execution Attempt 持有一份内部资源引用。同一插件的两个 Surface、两个 Tab 或 Overlay 各自持有引用，但共享已加载资源。插件 ACTIVE 不持有永久引用；隐藏但仍挂载的 UI 保留引用；结束的 Tab 按现有执行语义释放。

内部实现可以有如下形态，不作为插件 SDK 出口：

```ts
acquireArtifactCss(artifact, actualStyleRoot, signal)
  // Promise<{ release(): void }>；release 幂等
```

该函数隐藏规范化、并发加载、超时、引用计数、失败回滚和节点清理。内部 Map 是实现细节，不是公共 StyleRegistry。

### 挂载目标与去重

普通 Builtin 共享 Host Document，使用 `<link rel="stylesheet">` 挂到 Host `document.head`。不用 Runtime fetch + 拼接 `<style>`，避免额外承担相对 `url()`、跨域和 CSS 重写；构建负责处理依赖及内部 URL。

去重键为“实际样式根对象 + 规范化的绝对 CSS URL”。这里的样式根只是已有物理挂载目标，不是新的公共隔离概念；同一 Document 内不同 Presentation Root 应共享资源，不能直接按 Presentation Root ID 分区。V1 CSS URL 具有不可变内容身份，既可以使用内容 hash，也可以使用不可覆盖的版本目录加稳定文件名，hash 文件名不是强制要求。保留 query 等有意义部分；不按 pluginId、文件 basename 或 CSS 内容猜测去重。不同版本如果 URL 不同就独立加载。未来若支持 integrity/credentials 等属性，需纳入资源身份或拒绝冲突元数据。

这一替代的消融只验证身份、定位与呈现，没有验证 CDN 缓存策略。实验服务使用 `Cache-Control: no-store`，不能据此认定两种 URL 形态在生产 CDN 配置下也已验证等价；发布前仍需确认版本路径不可覆盖及实际缓存策略。

并发 acquire 在插入 DOM 前同步登记同一 pending 项，共享一个 Promise。按 Artifact 列表顺序插入 link，即使并发请求完成顺序不同也不改变列表内层叠顺序。跨插件不定义“后加载者覆盖前加载者”的业务语义，正确性必须由样式归属保证。V1 不自动拆出跨插件共享 CSS chunk；已有明确的共同依赖可复用同一资产 URL，不能依靠两个相反的加载顺序。

**现有组合的特殊情况：** `ui-host.ts` 允许从 Restricted Presentation Root 解析 Anchor，再在真实 Anchor 中分配子节点，Builtin 的 JS realm 并不证明它的可见 DOM 一定在 Host Document 样式树。若现有业务使用 Builtin 呈现在 Restricted Anchor 内，CSS 应加载到那个已经存在的 Wujie ShadowRoot，并按该 root 单独计数；不能只放到 `document.head`，也不能因为 URL 相同而跳过另一 root 的挂载。这不是为 Builtin 新建隔离容器，也不改变当前组合关系。

实际样式根由 Browser Adapter 利用已有物理 DOM 归属机制确定，不能盲信 Wujie 修补的 `getRootNode` / `ownerDocument`。具体判定顺序如下：

1. Browser Adapter 初始化时，像现有 `ui-host.ts` 一样，从 Host Window 的 `Node.prototype` 保存原生 `parentNode` getter。后续通过 `nativeParent.call(node)` 读取真实父节点，不读取节点上可能被修补的同名属性。
2. 以该 Attempt 实际使用的呈现容器为起点。先复用现有执行有效性、Presentation Root / Anchor 归属与连接检查，确认容器来自受管理的挂载路径；不能以插件传入的 selector、pluginId 或 JS realm 推断位置。
3. 沿原生父链逐级向上，遇到第一个 ShadowRoot 就停止：确认它是当前受支持呈现链中已有的 Wujie ShadowRoot，并返回该对象。确认依据现有 Restricted Presentation Root / Wujie 实例记录，不另建 Root 注册表。不要继续跨越 `shadowRoot.host` 寻找外层 Document，否则会选错 CSS 挂载目标。
4. 若途中先到达 Host 自己的 Document，则返回该 Document。若父链提前结束、容器已断连，或遇到未被当前呈现链承载的 ShadowRoot / 其他 Document，应使本次挂载失败并回收已取得的引用；不能默认回退到 `document.head`。
5. 以返回的对象和规范化 CSS URL 共同去重：Document 对应其 `head`，已有 ShadowRoot 对应它自身的样式挂载位置。CSS 异步加载完成、业务 DOM 呈现之前，再检查 Attempt、归属及实际样式根仍有效且未改变；失效时释放本次引用，沿现有取消/失败路径结束，不隐式迁移资源到新 root。

消融探针已验证原生父链定位及按实际 root 挂载；上述有效性检查与生产 Adapter 的完整接线仍需实施验收。这项分支只服务现有挂载拓扑，不新增任意 portal、多文档或新隔离模式。跨 root 的共享下载可交给浏览器缓存，挂载资源不能跨 root 合并。

### 失败行为

所有声明 CSS 在 V1 都是该 Artifact UI 必需资源。link 的 error 或有限超时使本次 Attempt 进入既有 `artifact` 失败阶段，不呈现缺样式的业务 DOM。错误记录包含 owner、版本、attemptId、资产 URL 与原因；不产生 CSS Contribution 或新业务可用性状态。

多文件加载中一个失败，应释放本次 acquire 已取得的全部引用；仍被其他 Attempt 使用的节点不能删除。失败项从可复用加载缓存中移除，已有等待者各自收到失败；后续显式重试重新 acquire，不复用永久 rejected Promise。取消和失败清理都要防止旧异步回调删除新一代同 URL 条目。

Core 根呈现 CSS 失败按 Console Presentation Failure 处理，由现有 Host 路径显示 Break-glass；普通插件失败局限于相关执行。它们都不反转 Runtime Ready。Break-glass 的必要样式继续独立于插件和主题提供，避免恢复 UI 被失败的主题阻断。

当前 `ui/runtime.ts` 的通用 mount catch 只提取 `UiError.code`，不会自动保留 CSS error 的 stage。实施时应在 Browser 挂载失败路径调用已有 `failAttempt(id, code, 'artifact')`，或补齐现有失败传播，不能仅给 Error 添加字段便宣称诊断可用。

CSS 等待时间与 UI ready 握手计时应分开归因；不要沿用当前在 mount 一开始就启动 ready 定时器的顺序，导致 CSS 慢加载先被误报为 `UI_READY_TIMEOUT`。

### 释放行为

正常清理顺序为：停止该执行、卸载业务 DOM 和本地资源、在 finally 中释放 CSS。不要在已挂载 UI 收到 abort 的瞬间先移除 CSS，让仍在异步卸载的 DOM 失去样式。尚在等待 CSS 的 acquire 可以立即取消本等待者，但不能取消其他执行的共享加载。

最后一个引用释放时移除 Runtime 创建的 link、事件监听器、定时器与缓存项。加载期间引用归零也应移除节点并忽略迟到回调；不承诺浏览器已发出的 HTTP 请求必定停止。Runtime dispose 应关闭新 acquire、结束并等待执行清理，再释放其剩余资源。不移除 Host 预置的 Token、baseline 或不归自己所有的样式节点，也不清除浏览器 HTTP 缓存。

V1 不让多个独立 Browser Runtime 共享同一批样式节点；若应用以后在同一 Document 同时运行多个 Runtime，再将内部资源存储提升到对应 Browser Host 生命周期，而非现在新增全局服务。

link load 成功仅表示 CSS 资源加载完成，不表示其中每条规则有效，也不保证字体、图片全部加载成功。语法错误、非法全局规则和副资源正确性由构建检查与呈现验收覆盖；Runtime 不解析 CSS AST。

## 3. Restricted 与 Wujie

推荐链路为 Host `documentElement` 的 Token → 现有容器 → `wujie-app` → ShadowRoot 内业务 DOM。Token 不依赖 BridgeSession，因此当前 ShadowRoot 模式不需要额外 RPC、事件订阅、Token 快照、逐实例 style 注入或 MutationObserver 同步。

仓库锁定 Wujie 2.1.0，adapter 设置 `degrade: false`。已安装版本的 `esm/shadow.js` 创建 open ShadowRoot；`getPatchStyleElements` 和 `sandbox.patchCssRules` 会把子应用 `:root` 规则补成 `:host`，还会将部分 `@font-face` 放到 ShadowRoot 外。由此得出两项具体约束：

- 集成 CSS 不应重新定义平台 Token；同名默认值会在继承路径上覆盖 Host。
- Restricted 私有字体仍需命名空间，并由 Wujie 实例销毁负责其附加节点，不能宣称所有 CSS 命名事实都天然留在 ShadowRoot 内。

Restricted 自带 HTML 及内部 CSS 依赖，沿当前 Wujie HTML/样式加载链路挂载并随实例销毁回收，Builtin 的 link 管理器不再加载一遍。已有 `loadError` 应继续转为 `artifact` 执行失败，不能仅凭 `startApp` resolve 判断资源完整。

Wujie 对 CSS 错误有转为空字符串的处理及自己的资源缓存，因此不能仅由 `startApp` resolve 推定成功。本次消融的独立观察中，同一入口及 CSS URL 首次 404、销毁实例后重试能够恢复；当前安装版本的失败路径也会驱逐对应缓存。V1 不预先增加缓存修补层，保留该场景的生产回归验收；只有真实缺陷出现时才在现有 Wujie driver / 加载兼容实现内处理。

需要用 JS 驱动 Canvas 等非 CSS 渲染时，插件可从自身真实可见 DOM 读取 computed Token；不要读取 Wujie 隐藏执行 iframe 的根节点来代表页面主题。V1 不保证此类一次性读取随主题自动重绘，也不为它新增主题订阅协议。

只有支持真正的 iframe 呈现、DOM 脱离继承链，或产品明确要求跨 realm 的主题观察时，才重新评估桥接。届时可先由现有 Browser/Wujie Adapter 在挂载前投递平台公开值并绑定现有生命周期，仍无充分理由自动升级为公共 ThemeManager。V1 不支持这些扩展路径。

## 4. 不同 CSS 技术如何接入

| 技术 | 插件构建负责 | Runtime 看到的内容 |
| --- | --- | --- |
| CSS Modules | 生成 class 映射与静态 CSS；局部类名包含插件身份和内容信息以避免独立构建碰撞 | 普通 CSS URL；不读取映射表 |
| StyleX | 编译并提取静态 CSS，内部变量引用平台 `var(--nexus-...)`；确保独立产物的生成名称及规则含义不冲突 | 普通 CSS URL；不管理 StyleX 编译器或主题对象 |
| Tailwind | 扫描自身源码、生成 CSS、映射平台 Token；Builtin 关闭 Preflight，处理 utility、变量、keyframes、layer 等命名 | 普通 CSS URL；不知道 class 是 utility |
| 原生 CSS / Sass 等 | 编译为 CSS，采用插件私有类名和变量，解析 import 与资源 URL | 普通 CSS URL |

CSS Modules 提供局部 class/animation 映射，但这不自动约束裸元素 selector、显式 global 或继承。依据：[CSS Modules 官方说明](https://github.com/css-modules/css-modules)。

StyleX 推荐构建时转换，其配置支持关闭 runtime injection；这些属于插件构建配置。依据：[StyleX 安装与编译说明](https://stylexjs.com/docs/learn/installation/)。

Tailwind 的 Preflight 默认包含全局元素规则，官方提供关闭方式；prefix 与禁用 Preflight 是不同设置。还需检查最终产物中的初始化规则、变量注册、keyframes 与 layer 名称，不能把“加 utility 前缀”当作完整隔离。依据：[Tailwind Preflight](https://tailwindcss.com/docs/preflight)。

统一的是输出条件：Builtin 生产样式成为可枚举、可加载、可释放的资产。它不是统一源语言要求。V1 不接管任意 CSS-in-JS 的运行时注入，也不拦截所有 DOM `<style>` 写入。选择这些技术时，应使用其静态提取路径；无法输出这一形态的模式暂不纳入受管资产保证。普通动态 inline style 可用于插件自身业务 DOM，随 DOM 自然回收。

开发服务器的 HMR 可使用构建工具原有实现，但生产预览必须走真实资产清单与 Runtime 生命周期，不能拿 dev 注入表现证明生产回收正确。

## 5. 共享 CSS 环境的最小约束

1. **样式必须明确归属。** 类名采用插件命名空间或独立构建安全的生成名；keyframes、font-family、counter、私有变量及 layer 名称同样处理。共同组件的样式应是显式依赖，不允许复制一个通用名后靠加载顺序协调。
2. **Builtin 不发全局 reset 或泛化规则。** 禁止业务 CSS 改 `html`、`body`、`:root`、裸 `button/a/input`、全局 `*` 或 `[role=tab]`。仅有私有祖先也不一定安全：`.pluginRoot button` 会覆盖嵌套插件。优先给自己渲染的具体元素挂私有 class，跨插件 Anchor 以下内容不属于提供者。
3. **Host 和 Core 也遵守归属规则。** 现有 `code`、`a`、`button` 规则及 `.nexus-content-card [role=tab]` 不能继续默默充当插件组件样式；拆成具体私有 class。平台只保留经声明的小型 document baseline，例如页面 margin 与必要 box-sizing；产品按钮、链接、表格外观不属于 baseline。
4. **平台变量只读，私有 selector 不构成契约。** 插件不依赖 Host/Core/其他插件私有 class，不查询祖先主题 class，不写 `--nexus-*`。共同视觉通过 Token；公共组件库若以后出现，应有独立明确出口。
5. **尊重容器所有权。** 不以 `!important` 或选择 Runtime 内部标记修改 Slot、Surface、Anchor、显示隐藏、overflow、contain、尺寸、排序及 Overlay 外壳。插件内部可使用 flex/grid、滚动及定位，但不能通过向 Host body 任意 portal、固定定位或全局 z-index 接管跨区域呈现；沿现有 Overlay 流程呈现跨区域 UI。
6. **检查编译后的结果。** 通过构建 lint 和集成截图覆盖第三方 CSS、全局注册及独立构建碰撞。规则检查在构建层，Runtime 不做 CSS 清洗、自动加前缀或 selector 重写。

这些是共享环境下的工程契约，不能承诺恶意 Builtin 的强隔离；Direct Host Realm 的权限事实不因引入 Tokens 而改变。`@layer` 只控制级联顺序，不形成隔离；V1 不强制一个全平台 layer 框架，也不自动包裹编译后的 CSS。

## 6. Artifact 与 Manifest

源码声明业务事实：插件身份、版本、能力、Surface、Point、Contribution。CSS 的真实 URL、hash、顺序和依赖关系是构建事实，必须由产物生成，不能人工在每个 Surface 或 Manifest 内重复登记。

建议 Builtin 的构建产物描述为以下最小形态，挂在已有插件产物记录或生成的 Distribution 资源映射下：

```json
{
  "entry": "./index.6b8d.js",
  "assets": {
    "css": ["./styles.8ac7.css"]
  }
}
```

示例只说明加载层数据关系，不冻结新的 Artifact JSON，也不是当前 `RestrictedPluginManifest` 已支持的字段。owner 和 version 关联已有插件记录，不再手工建立第二份身份源；entry 对应已选择的同一次构建，避免 JS 与 class 映射/CSS 版本错配。若使用相对路径，其基准应为产物描述的发布 URL；生成到 Distribution 的数组也可直接采用已解析的资产 URL，不能相对当前路由。清单不含 `engine`、`cssModules`、`tailwindConfig`、selector、Point 或 Surface CSS 配置。

对目前静态组装的 Builtin，优先直接提供与已导入插件定义关联的构建生成 `readonly string[]`；已有加载输入需要时再用 `assets.css` 包装，不新增一次 Manifest 获取或远程 Builtin JS 加载框架。消融中去掉该包装仍保持行为一致，构建工具自己的元数据继续作为生成来源。该资源描述属于 BrowserDistribution / browser 加载输入，不进入 `PluginDefinition.activate` 的业务上下文。

Restricted 继续以构建生成的入口 HTML 为 CSS 依赖权威来源。若发布渠道需要完整资产 inventory，可从同一构建图生成，用于发布与校验；Runtime 不能再按 inventory 重复注入 HTML 已拥有的 CSS。物理上同一 JSON 文件容纳业务声明和产物区并非禁忌，关键是所有权与生成源分开，而非必须增加一个文件。

生产构建必须保证：

- 生成完整的插件 CSS 闭包，包括异步组件的 CSS；V1 不要求运行中发现新 CSS chunk。
- 插件 CSS 不再被 Host HTML 自动注入，不混进一份不可回收的 Host 总 CSS，不在 JS 求值时再次自动注入。
- 保留 CSS Modules class 映射等 JS 需要的信息；不简单删除所有 CSS import 而破坏组件构建。
- URL/hash 随构建图产生；未能形成完整产物清单时让构建失败，不能静默当作无样式插件。
- 移除需要运行时继续发现的 CSS `@import`，由构建展开；字体/图片等 `url()` 输出到正确的发布位置。

## 7. 公共抽象判断

需要新增的是平台 Token 契约与 Artifact 的 CSS 资产事实，它们分别表示视觉语义和真实产物；不要求新的 Manifest 格式。无需新增 ThemeManager、StyleRegistry、CSS Capability、StyleSession、样式 Extension Kind 或插件调用的 `registerStyles()`。共享消费者寿命可以用内部计数或持有者集合表达，不固定公共 StyleLease 类型，也不增加与现有 Attempt 并行的生命周期。

Artifact 加载实现足以承担资源规范化、加载与引用；Browser Runtime 足以提供实际 Document/ShadowRoot 和销毁时机；Presentation Adapter 已经是 CSS 就绪后渲染及 DOM 清理后的资源释放位置；Wujie Adapter 已拥有 Restricted 的加载与隔离生命周期。新建公共服务只会再暴露一次这些现成职责。

可以增加私有 `browser/artifact-assets.ts` 来集中实现和测试，避免堆积 `ui-host.ts`，但不从 Runtime 主入口导出，不让插件理解 link、缓存或引用计数。

## 8. 推荐 V1、迁移顺序与验收

V1 是：平台 CSS variables + 生成的 Builtin CSS 清单 + Browser Runtime 内部的 CSS 资产共享与生命周期管理 + Wujie 自带资产加载及变量继承 + 双向样式归属约束。

实施前置检查：与 [Host 路由设计](./host-routing-design.md)及其[实施记录](./host-routing-implementation.md)联合核对同一份 Restricted Manifest schema / 解析实现（仓库内 `packages/plugin-runtime/src/manifest.ts`）。当前 Restricted Route 已支持 `parentRouteId`，路由设计中的“尚未支持”属于设计时基线，不能在样式方案中另起一份 schema。V1 仍优先由 Restricted 入口 HTML 描述 CSS；若后续确需增加 Restricted CSS 产物字段，应先协调字段归属、白名单、兼容性与发布顺序，再在同一权威 schema 下同步解析、规范化和必要的 inspection 投影，并联合验证旧 Manifest、含 `parentRouteId` 的声明及路由字段与新资产元数据共存的情况。该协调检查待实施前完成，不预设本轮必须新增 CSS Manifest 字段。

迁移按依赖顺序进行：先从 Core CSS 拆出平台 Token 和最小 baseline，修正 Host/Core 泛化 selector；再把示例插件私有化样式，明确 deployment 与其扩展的共同 UI 依赖；然后建立 CSS 输出清单并停止 Host 静态样式副作用，接入 UI Attempt 生命周期；最后迁移 Restricted 的 Token 消费并完成真实浏览器验收。不能只增加 loader 而保留所有原 CSS import 副作用。

实施接入点包括 `apps/console` 的 Rsbuild 产物生成、`BrowserDistribution` 的资产输入、`ui-host.ts` 的 mount/dispose、必要的错误阶段传播，以及 `console-core/styles.css` 和示例业务 CSS。只改 Wujie Adapter 确有缺口的兼容处；不扩展业务契约。

V1 不做：新隔离容器、任意 CSS-in-JS 注入托管、CSS AST 运行时重写、按 Contribution/Surface 配置样式、CSS 按需 chunk 图调度、跨插件原子 CSS 合并、全局 layer 调度器、多版本 Builtin 同时热替换、每个 Slot 独立主题、主题 RPC/订阅、iframe 降级主题桥、动态字体资源管理、统一 UI 组件库。首次 UI 执行加载完整插件 CSS，接受这项体积换取生命周期简单明确。

验收通过后才能将本方案视为落地：

| 场景 | 必须观察到的结果 |
| --- | --- |
| 同一插件两个 Surface 并发挂载 | 同一 root 每个 CSS URL 只有一个受管 link；两者等待同一加载结果 |
| 一个 Surface 关闭、另一个仍显示 | 样式保留；最后一个关闭后受管节点和引用归零 |
| Route、Tab、Overlay、根呈现及隐藏状态 | 各自按现有生命周期 acquire/release；仅隐藏不会移除 CSS |
| CSS 404、超时、多文件部分成功 | 不进入业务 UI ready；错误归因到 artifact；本次资源回滚且不影响其他持有者 |
| 加载中 abort、重试与 Runtime dispose | 不误取消其他引用，不残留 timer/listener/node，迟到回调不污染新尝试 |
| DOM 异步卸载 | CSS 在所属 DOM 清理后释放，dispose 抛错也执行释放 |
| Core CSS 失败 | Runtime Ready 含义不变，独立 Break-glass 可读可操作 |
| 两个 Builtin 采用不同工具、反转加载顺序 | 彼此外观及 Host 控件不变；不靠全局 reset 或偶然层叠修复 |
| Builtin 分别使用 StyleX / Tailwind 生产编译并切换主题 | 编译产物中的平台 Token 引用保留运行时 `var()` 或变量引用链，未被 inline 成静态值；切换 Host 根主题属性后，插件 computed style 正确重算，无需重挂（待验证；现有消融仅真实编译验证了 CSS Modules） |
| Host、Builtin、Restricted 与 Overlay 切换主题 | CSS 消费同一语义值；无需重挂、重复样式或主题消息 |
| 当前 Wujie 的 root patch、私有字体与资源失败重试 | 无同名 Token 遮蔽，销毁清理附加节点，修复 CSS 后重试可以恢复 |
| 当前组合若含 Restricted Anchor 中的 Builtin | CSS 出现在已有实际样式根，按 root 去重，父执行销毁后引用无残留 |
| 最终生产产物 | 清单完整、CSS 不被 Host 和 Runtime 双重加载；dev HMR 不作为替代证据 |

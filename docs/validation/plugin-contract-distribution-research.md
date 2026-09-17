# 插件契约可行性：Manifest、分发、文档与 CI 实现核验

调研日期：2026-09-08。范围：当前仓库源码、构建配置及设计文档；未修改代码或设计文档。下文“建议”不代表已实现。未发现范围内额外 AGENTS.md。

## 核心结论

Restricted Manifest 已经承载静态插件声明，并直接用于 Runtime Admission。当前缺的是对已有数据的文档投影、少数 Builtin 声明的提取，以及版本确定的文档输入清单，不是先天缺少一个名为 `plugin-contract.json` 的新模型。新的 JSON 文件可以作为跨仓库传输产物，但不应重命名并重建已有契约字段。

## 当前事实与证据

1. **Restricted Manifest 是现存声明结构。** `RestrictedPluginManifest extends PluginDescriptor`，包含 `entry`、`hostApi`、`permissions`、`surfaces`、`actions?`、`extensionPoints?` 和按 `routes/navigation/extensions` 分组的 `contributions`；`provides` 必须为空。见 [manifest.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/manifest.ts:23)。`PluginDescriptor.provides/requires` 是 Capability ID 数组，不是 Point 列表，见 [plugin.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/plugin.ts:6)。
2. **Manifest 的现有生产方式是 Host 仓库手写 TypeScript 对象并验证，尚无生成步骤。** 示例 KubeEye 在 Host 内调用 `validateRestrictedInstallRecord`，把 Manifest 与安装配置一起构造，见 [kubeeye-installation.ts](/Users/yazhou/code/nexus-service/apps/console/src/plugins/kubeeye-installation.ts:10)。Restricted 应用只构建 UI 入口和 HTML，构建配置设置 `publicPath`，未输出 Manifest 或 Contract JSON，见 [rspack.config.mjs](/Users/yazhou/code/nexus-service/apps/example-restricted-plugin/rspack.config.mjs:5)。
3. **Manifest 已用于 Runtime，不是旁路元数据。** Bootstrap 把 Manifest route 转成 Runtime target，其余 navigation/extensions 复用声明，见 [bootstrap.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/bootstrap.ts:234)；随后在同一 activation transaction 注册 routes、navigation、points、actions、surfaces、extensions 并 validate/apply，见 [bootstrap.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/bootstrap.ts:631)。
4. **Manifest 与安装状态已明确分离。** `InstalledPluginConfig` 有 `enabled` 和 `grantedPermissions`；解析器验证 ID/version 一致，权限授予必须是申请权限的子集，见 [manifest.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/manifest.ts:503)。不能从静态插件声明推断当前安装版本选择、启停状态或授权结果。Host 存储实际由 localStorage 支持，见 [installation-storage.ts](/Users/yazhou/code/nexus-service/apps/console/src/installation-storage.ts:10)。
5. **发布参数存在手工同步点，但不能一律称为重复权威模型。** KubeEye Manifest `entry: /plugins/kubeeye/1.0.0/` 与插件 bundler `publicPath` 一致但分散；Host 代理又手工把 v2 路径映射到 v1 fixture，见 [kubeeye-installation.ts](/Users/yazhou/code/nexus-service/apps/console/src/plugins/kubeeye-installation.ts:15)、[rspack.config.mjs](/Users/yazhou/code/nexus-service/apps/example-restricted-plugin/rspack.config.mjs:13)、[rsbuild.config.ts](/Users/yazhou/code/nexus-service/apps/console/rsbuild.config.ts:26)。Manifest/config ID-version 双写是安装记录校验所需的两个角色；可生成默认配置，不能合并生命周期。
6. **现有 API 包已有可以复用的静态文档输入。** `CONSOLE_EXTENSION_POINTS`、`CONSOLE_PROFILES`、`PLUGIN_REF_CONTRACT` 以及 Cluster 对应常量均已声明为现有 Runtime 类型，见 [console-core-api/index.ts](/Users/yazhou/code/nexus-service/packages/console-core-api/src/index.ts:14)、[cluster-api/index.ts](/Users/yazhou/code/nexus-service/packages/cluster-api/src/index.ts:16)。Builtin 实际注册同一 Point 数组，见 [console-core/plugin.ts](/Users/yazhou/code/nexus-service/packages/console-core/src/plugin.ts:13)、[cluster.tsx](/Users/yazhou/code/nexus-service/apps/console/src/plugins/cluster.tsx:43)。
7. **已有描述性 Catalog，可以复用而非另造 Point 描述模型。** 两个 API 包的 `*_EXTENSION_POINT_CATALOG` 提供 ref/kind/title/description，见 [console-core-api/index.ts](/Users/yazhou/code/nexus-service/packages/console-core-api/src/index.ts:34)、[cluster-api/index.ts](/Users/yazhou/code/nexus-service/packages/cluster-api/src/index.ts:34)。Catalog 与 Point 数组重复 kind，存在漂移风险；文档投影宜按 ref 关联、验证匹配，由 Point 定义提供结构事实，Catalog 只补描述。
8. **当前还没有跨仓库发布通道。** 两个 API 包均是 `private: true`，直接 export `./src/index.ts`，依赖 `workspace:*`，见 [console-core-api/package.json](/Users/yazhou/code/nexus-service/packages/console-core-api/package.json:1)、[cluster-api/package.json](/Users/yazhou/code/nexus-service/packages/cluster-api/package.json:1)。不能把已有 monorepo export 等同于已具备跨仓库 npm/JSON 分发。
9. **文档目前是本地 Markdown 站。** `@feforgejs/docs` build 直接执行 `rspress build`，无预生成脚本或契约依赖；Rspress root 为 `docs`，导航与侧栏手工配置，见 [docs/package.json](/Users/yazhou/code/nexus-service/apps/docs/package.json:5)、[rspress.config.ts](/Users/yazhou/code/nexus-service/apps/docs/rspress.config.ts:5)。当前实现未提供 Contract Fetcher、Contract Registry 或跨仓库聚合器。
10. **Distribution 有明确插件集合，但不是无副作用文档入口。** 当前对象包含 Builtins、Profile/RefContracts、catalog、fixtures，也导入 UI 与安装存储，见 [distribution.ts](/Users/yazhou/code/nexus-service/apps/console/src/distribution.ts:1)。文档构建可沿用这份 release 选择意图，但不应为了读取静态信息直接启动 Host 或激活插件。
11. **现有 `check:plugin-contract` 仅做目标版本特性门禁。** CLI 解析 JSON 后只调用 `assertContributionContractCompatible`，见 [check-plugin-contract.mjs](/Users/yazhou/code/nexus-service/scripts/check-plugin-contract.mjs:1)。该函数遇到非对象或无 contributions 直接返回，只根据字段存在性拦截 v2/v3 特性，见 [contribution-compatibility.ts](/Users/yazhou/code/nexus-service/packages/plugin-runtime/src/contribution-compatibility.ts:6)。不能将 CLI 成功解释为 schema 正确、Point 存在、Profile 匹配或引用闭合；其测试也是特性门禁测试，见 [contract-version.test.mjs](/Users/yazhou/code/nexus-service/scripts/test/contract-version.test.mjs:4)。
12. **当前 CI 没有生成漂移或跨发布 Contract Diff 检查。** CI 执行 typecheck/test/build/E2E/routing validation，见 [ci.yml](/Users/yazhou/code/nexus-service/.github/workflows/ci.yml:18)。新增文档生成检查可接入现有流程，但不应把现有测试表述为已覆盖设计文档第 13—15 节全部能力。

## 对设计文档相关章节的判断

| 章节 | 判断 | 最小调整 |
| --- | --- | --- |
| 5 Plugin Declaration | 需要调整 | 不要求所有插件先迁移到新 `definePlugin`。Restricted 直接以现有 Manifest 为声明；Builtin 优先导出原本注册的纯数据常量。 |
| 6–7 Contract Metadata / Compiler | 需要调整 | JSON 传输产物可选；保留现有 `extensionPoints/contributions/contractMajor/point` 结构，只增加产物版本及来源信息。`provides` 不得复用来表示 Point。 |
| 9–10 文档生成与单插件 API 页 | 可直接实现（静态已声明部分） | 先消费 API 常量、Manifest、描述 Catalog，明确未提取的 Builtin contributions 不代表不存在。 |
| 11 Docs 架构 | 需要调整 | 第一阶段无需 Fetcher + Compiler + Registry 全链；本地显式输入列表到 Markdown 足够。 |
| 12 Global Registry | 可直接实现为可再生产索引 | 只有需要检索/反向引用时落盘；记录准确插件版本和覆盖集合，避免不同 release 混合。 |
| 13 Validation | 部分已具备、部分需要调整 | 复用现有 parser/validators；区分单插件结构校验、选定 release 内引用校验、Runtime Admission。版本 gate 不是完整校验器。 |
| 14 CI | 可直接实现（生成存在以后） | 接入现有 CI；若产物不提交，仅验证可生成和输入完整，不强制 Git Diff。 |
| 15 Contract Diff | 需要调整、后置 | 先定 artifact 覆盖范围和版本身份，否则遗漏/非激活贡献会产生假删除；不要自行另建兼容性语义。 |
| 16 Manifest 派生 | Restricted 部分当前已具备；通用派生需要调整 | Manifest 已是静态声明；Builtin render/handler 不可投影成 Restricted Manifest。可组合已有声明字段与发布参数生成 Manifest，安装状态另行提供。 |
| 17 Runtime 边界 | 原则可直接保留 | 构建成功不替代当前环境的 Admission；索引绝不参与 Runtime 接纳决策。 |
| 18 动态安装与产品文档 | 概念可直接保留，输入方式需要补充 | 产品文档锁定 release 集合；运行时 inspection 展示当前接纳集合，不承诺两者外层数据形状完全相同。 |
| 19 独立包划分 | 第一阶段不建议实施 | 先在 scripts 和现有 API 包完成投影；实际出现跨仓库消费后才评估可发布工具包。 |

## Manifest 派生的实际边界

- 可直接复用/序列化：Manifest 中 descriptor、extensionPoints、surfaces/actions ID 和 JSON contributions；API 包中的 Profile/RefContract schema、Point 常量与描述 Catalog。
- 可经少量整理后复用：Builtin 的固定 contribution 字段，目前许多写在 `activate` 内，见 [console-core/plugin.ts](/Users/yazhou/code/nexus-service/packages/console-core/src/plugin.ts:20)。提取同一常量并同时用于注册、文档，避免复制一份 docs 声明。
- 需要显式输入而非推断：`entry`/version 发布选择、`hostApi` 兼容声明、permissions/requires 申请；不能从某一个 Point 引用可靠推导插件的全部 Capability 和权限要求。
- 不能静态代表事实：active/admitted 状态、授权结果、运行时 capability 对象、render/action handler 实现和动态注册集合。Manifest 生成不等于这些实现存在或行为兼容。
- 当前示例的 `provides/contributes/capabilities` 与实际 Manifest 字段不一致，见设计文档 [第 16 节](/Users/yazhou/code/nexus-service/spec/插件契约文档.md:712)。建议直接改为真实字段，明确 `requires/provides` 是 Capability 依赖，`contributions` 才是扩展贡献。

## 跨插件仓库聚合的最小方案（建议）

1. 先在当前仓库用明确输入列表读取纯数据 API exports 与 Restricted Manifest；生成 Rspress Markdown，复用 Catalog 描述。无需引入新的运行时库。
2. 确有外部仓库后，每个插件在自己的构建中输出现有声明的 JSON 投影，可与插件制品或 API package 一起发布；发布元信息至少记录 plugin ID、plugin version、schema/tool version、source revision。Docs 构建仅读取数据，不执行外部插件 `activate`。
3. 文档 release 输入锁定 artifact 路径/版本/摘要。只导入明确选中的 plugin 版本；缺失输入应报聚合错误，不默默将某个环境未安装解释为无契约。当前 catalog 同时包含 KubeEye v1/v2（[distribution.ts](/Users/yazhou/code/nexus-service/apps/console/src/distribution.ts:25)），因此只用 plugin ID 去重会覆盖版本。
4. 以现有结构建立可删除重建的内存索引，按 ownerPluginId + Point ID + contractMajor 关联；跨版本文档再加 release/pluginVersion 上下文。`extension-registry.json` 仅在多消费者需要时落盘。
5. 复用已有校验逻辑并显示覆盖范围。外部 Point 不在输入集合时是“无法在此集合解析”，只有完整 release 闭包校验才能判定是否违反该 release 的约束。

以上方案不要求实现设计文档的全部抽象；先证明少量已有声明能同时驱动 Runtime 与文档，再考虑独立工具包和契约差异报告。

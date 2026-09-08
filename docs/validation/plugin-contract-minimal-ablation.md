# 本仓库契约文档：小范围架构消融与最小方案冻结

日期：2026-09-08。对象：[修订设计](../../spec/插件契约文档.md)。依据：[可行性报告](./plugin-contract-feasibility.md)。跨仓库聚合明确不在本轮范围。

## 1. 实验问题与边界

本轮只回答：已有本地静态声明生成契约参考时，是否需要中间 JSON、新声明包装、Catalog 的重复 kind，以及现有 Point Compiler？

使用当前 Console/Cluster API 的 9 个 Point、7 个 Profile、2 个 Ref Contract；在临时目录运行一个五项检查的 Vitest 探针。探针直接导入现有源码，不修改生产代码、不执行 activate、不启动 Host。各变体只改变探针的一处数据路径。

这里没有已实现的 Docs Generator 或新 Declaration DSL。基线只是一个临时静态投影模型：本地来源 → 可选 envelope → 可选 JSON 往返 → 原 Point Compiler → 带说明的排序对象。实验比对的是投影数据，不是 Markdown 字节、Rspress 构建或完整插件贡献集合。

基线的 envelope 只有 `{ plugins: sources }`。删除它只能证明这种包装对当前探针无必要，不能声称已经证明任意未来 DSL 都无价值。新 DSL 不进入冻结方案，主要根据现有类型足以承载需求的源码事实与范围判断。

## 2. 固定检查

所有变体执行相同检查：

1. 保留全部 9 个 Point 的 owner/id/major/kind。
2. 完整投影与直接调用原编译器的参考结果一致，包含文案、Schema 和约束。
3. cluster/node.actions 的 itemRef 是实际 RESOURCE_REF_CONTRACT Schema，且保留 capability 策略维度。
4. 将该 Point 的绑定改为不存在的 `cluster.missing-ref@1` 时，必须拒绝并报 REF_CONTRACT_MISSING。
5. 重复执行得到相同对象内容，来源声明不被修改。

第 2 项验证数据路径等价性；第 3、4 项提供独立的具体行为检查，避免只以输出“看起来一样”判断 Compiler 的价值。

## 3. 实测结果

| 变体 | 通过 / 失败 | 观察 | 决策 |
| --- | --- | --- | --- |
| baseline | 5 / 0 | 固定检查成立 | 基线可用于局部比较 |
| no-json | 5 / 0 | 去掉 JSON 序列化/反序列化，完整静态投影不变 | 本仓库不设中间 contract JSON |
| no-envelope | 5 / 0 | 直接消费来源数组，投影不变 | 不增加无行为的统一声明包装 |
| no-catalog-kind | 5 / 0 | 注释只保留 ref/title/description，kind 从 Point 得到 | Catalog kind 不作事实源；接入初期校验旧字段即可，无需先改造 Catalog |
| no-compiler | 2 / 3 | 身份与确定性仍通过；最终 Schema/有效元数据缺失；非法 Ref 绑定不再拒绝 | 保留并复用现有 Point Compiler |

绕过 Compiler 后失败的三项是预期的消融证据，不是工作区代码回归。去掉某层仍通过只支持当前数据范围内没有观察到损失，不构成任意需求下的普遍冗余证明。

原始结果、基线提交、三个输入源码的 SHA-256 和完整探针源码保存在 [plugin-contract-ablation-results.json](./plugin-contract-ablation-results.json)。所有变体总计 25 次检查，22 通过、3 次预期失败。未将上一轮的 38 个 Runtime 测试计入本轮实验。

## 4. 未做运行变异的代码反事实检查

| 删除候选 | 当前实现证据与后果 | 决策 |
| --- | --- | --- |
| 删除覆盖范围说明 | Builtin 元数据仍位于 activate，静态 API 数组没有其所有 Contribution。缺记录不能推出零贡献 | 保留每插件、每分组的收录状态；完整性不能由空数组推断 |
| 合并声明与实际可用状态 | Bootstrap 后 Host 还构建 route/UI/action 接纳关系；KubeEye 有故意指向不存在 Point 的贡献 | 保留声明/运行事实的区别；未解析引用显示诊断，不改变安装准入 |
| 从贡献推断 Manifest 权限/身份 | Descriptor、Manifest 与安装 config 分别持有 Capability、请求权限和授予状态 | 直接读取原字段，不增加 Manifest 推断器 |
| 去掉持久 Registry / 三个新包 | 当前同仓库单次文档构建只需局部关联与现有函数；没有独立生命周期或外部消费约束 | 不引入持久 Registry、独立 schema 或工具包；局部 Map 足够 |

这些判断是源码反事实，不是删除运行实现后的测试结果。证据：[Builtin 注册](../../packages/console-core/src/plugin.ts)、[Host 时序](../../packages/browser-host/src/App.tsx)、[KubeEye 声明](../../apps/console/src/plugins/kubeeye-installation.ts)、[Manifest/config 分离](../../packages/plugin-runtime/src/manifest.ts)。

## 5. 冻结决策

**唯一实施主线：本仓库原声明 → 原校验/Point Compiler → 单次内存投影 → 生成 Markdown。**

保留：

- 现有类型、Manifest、API 常量和原注册路径。
- 为完整插件页所需的最小 Builtin 纯数据提取；共享原对象，不维护文档专用副本。
- 现有 Point Compiler、原字段校验、Catalog 对应检查。
- 局部关联、稳定排序、文案关联、版本分组和覆盖说明。
- 生成接入 Docs build；产物不提交；CI 检查生成与文档构建。

删除或不纳入本轮：

- 新 definePlugin/defineContribution DSL、统一 Plugin Declaration 模型。
- plugin-contract.json、console-core-contract.json、extension-registry.json 和持久 Registry。
- 新 Contract Schema、新 Compiler 实现、独立工具包或预先扩大 SDK 导出；实际构建边界问题触发的最小构建入口例外见下文。
- Manifest 生成流水线、自动兼容性分类、新 Inspector、跨仓库与发行发布模型。

原 Catalog 的重复字段可以在接入时做一致性检查，后续修改时自然消除；不把 Catalog 整体重构设为文档生成前置任务。

评审后补充以下冻结约束，具体规则与验收见[设计文档第 4–9 节](../../spec/插件契约文档.md)：

1. 每次生成先清空生成器独占目录，再全量重建；目录不混放人工文档，生成失败阻断 Docs build。
2. Catalog 在对应插件版本内比较完整 PointRef（ownerPluginId/id/contractMajor），另行校验 kind；未匹配、不一致和重复引用报错。
3. coverage: complete 仅为生成器收录元数据，有明确覆盖依据，不进入 Contract 数据，不参与身份、major 冻结或兼容性判断。
4. Compiler 默认由仓库生成入口集中导入内部源码；实际构建加载问题或明确包边界限制出现时，允许在现有 runtime 包增加导出同一实现的最小构建入口。记录触发原因并验证行为等价，不复制实现、不新增 Contract 包、不放宽业务侧内部导入。

这四项是评审补充的设计约束和后续验收条件，没有追加运行实验；前文结果和原始实验数据保持不变。

“冻结”约束下一步实现范围，不表示生成器已经实现。实现中如发现必须引入本清单之外的新事实源或机制，应先用具体无法满足的验收反例重开设计，不能以未来可能需要为由直接扩展。

## 6. 复查方法

结果 JSON 的 probeSource 可原样保存为临时目录中的 `contract-projection.test.ts`。临时目录设置 type=module，并将 node_modules 链接到本仓库 packages/plugin-runtime/node_modules。对每个变体分别执行：

```sh
CONTRACT_ABLATION=baseline node /Users/yazhou/code/nexus-service/packages/plugin-runtime/node_modules/vitest/vitest.mjs run --root "$probe_dir" --reporter=json --outputFile "$probe_dir/result.json"
```

`probe_dir` 是复查者创建的临时目录；其余变体将 baseline 换为 no-json、no-envelope、no-catalog-kind、no-compiler。no-compiler 应退出 1 且失败 3 项，其余应退出 0 且通过 5 项。先核对源码哈希；源码变化后结果应重新测量。

本轮未进行真实 Markdown 生成、Docs build、完整 Builtin 提取或浏览器 E2E，不能把上述探针当作这些后续工作的验收结果。

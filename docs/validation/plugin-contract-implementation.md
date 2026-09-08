# 插件契约文档生成：实现与验收

依据：[冻结设计](../../spec/插件契约文档.md)、[消融记录](./plugin-contract-minimal-ablation.md)。

## 入口与产物

运行 `pnpm generate:plugin-contract` 生成参考；`pnpm build:docs` 和 `pnpm dev:docs` 会先执行生成器。输出为 `apps/docs/docs/generated/plugin-contract/` 内的 Markdown，不提交版本库。Docs 导航提供“生成的插件契约参考”入口。

生成入口每次先删除该独占目录，验证所有输入后写入全部页面；任何失败均清理输出并非零退出。Docs build 使用 `&&` 阻断后续构建。原 CI 的 `pnpm test` 已包含生成器验收，`pnpm typecheck` 包含生成器类型检查，`pnpm build` 包含 Docs 生成与构建，不新增产物同步检查。

Node 24 的 TypeScript stripping 配合仓库专用 resolve hook 加载 extensionless 内部源码。Compiler 直接引用 `packages/plugin-runtime/src/ui/point-compiler.ts`，没有触发公共构建导出出口，没有修改包 exports。Route/Navigation 原有形状检查从 registry 校验循环提取为内部函数供两处共用；身份冲突仍按原作用域检查，不实现 Host Admission。

## 来源与覆盖依据

- Console Core：`plugin-data.ts` 保存原 Descriptor、Route 元数据、Navigation、Extension；`plugin.ts` 的各固定注册调用直接使用对应对象。Point 继续遍历原 `CONSOLE_EXTENSION_POINTS`。
- Cluster：`cluster-data.ts` 保存原固定元数据；`cluster.tsx` 保留原 render、能力实现和 Surface 注册，固定贡献引用提取后的对象。Point 继续遍历 `CLUSTER_EXTENSION_POINTS`。
- Extension Demo：`extension-demo-data.ts` 保存全部固定贡献；原插件直接使用这些对象，没有 Point 注册。
- KubeEye：原 v1/v2 Manifest 提取到 `kubeeye-manifest.ts`；安装配置、Bridge 回调和安装验证仍在原文件。生成器仅读取 Manifest，以禁用、零授权的临时校验输入调用原安装校验函数，仅验证声明形状，不读取安装存储，不代表真实安装或管理员授权。

`complete` 只表示上述版本的 points/routes/navigation/extensions 四个声明分组已覆盖；不声称序列化了执行对象。新增插件来源需要在 `sources.ts` 接入并说明覆盖依据；已接入声明的字段、Profile/Ref Schema 和贡献元数据只维护原来源。

生成器不执行 activate、不启动 Host。不同插件版本分别展示；KubeEye 两个版本均保留 `kubeeye-unused` 的未解析诊断。原始声明与编译后的 Schema 分开展示，coverage 不进入声明或编译器。

## 已执行验证

- `pnpm typecheck`：全部通过，包含依赖边界检查和生成器类型检查。
- `node --test scripts/test/*.test.mjs`：20 项通过，其中 12 项为生成器验收，覆盖确定性、非法绑定、Catalog 四字段错配及重复、身份冲突作用域、major/断言诊断、非法 Manifest/贡献、覆盖独立性、源码变化与转义、隔离目录中的旧页删除及失败清理。
- `pnpm -r --if-present test`：26 个测试文件、228 项 Runtime 测试通过。
- `pnpm build:docs`：生成 8 个页面并完成 Rspress 构建。
- `pnpm exec playwright test e2e/console-core.spec.ts e2e/extension-points.spec.ts e2e/action-tab.spec.ts`：8 项通过，覆盖 Builtin 布局、插件操作、Tab、Restricted 导航和恢复、Demo Point 注册。

此次只运行与提取范围相关的浏览器用例，不将其描述为全量 E2E。消融记录保留历史实验边界；上述结果属于实际生成器的独立验收。

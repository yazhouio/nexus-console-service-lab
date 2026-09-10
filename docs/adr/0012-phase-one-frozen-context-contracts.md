---
status: accepted
---

# 首期同一 Context Major 完全冻结

首期同一 `contractMajor` 下的 Context Schema 和字段语义完全冻结，任何 Schema / semantic 变化都升 Major，包括新增可选字段；每个扩展点只有一个当前 Major，B 显式匹配。选择这一规则是为了在插件独立发布且可能采用 closed object 校验时保持可判定的兼容承诺，避免把“新增可选字段”直接当作旧消费者必然兼容；首期不引入自动兼容推断。该约束是 phase-1 rule，未来可通过单独设计引入兼容演进规则；Schema 采用已确认的 JSON Schema 2020-12 内联子集，具体支持范围见[设计文档](../../apps/docs/docs/maintainers/cross-plugin-ui-composition-design.md)。

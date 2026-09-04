# V1 tickets 08–12 review

Review baseline: `253de4a801ad3f6dbd482c8de25f9ca016e2d655`.
Implementation commit: `6d4b545` plus the review corrections recorded with this report.
Sources: local tickets 08–12, `CONTEXT.md`, and `spec/技术落地方案.md`.

## Standards

The independent Standards review identified three items, all resolved:

- Corrected the Builtin Inspector security posture to the specified `full-trust` value.
- Detached and froze dependency edges and rejected resolution records, preserving Ready immutability beyond Map/Set wrappers.
- Consolidated audit construction and normalization in one private PluginBridge helper.

Focused recheck: no remaining findings. The vocabulary discrepancy was a documented-standard violation; duplication and inherited shallow immutability were reported as judgment calls.

## Spec

The independent Spec review identified two diagnostic gaps and one follow-up resource-bound issue, all resolved:

- Bootstrap failures now retain safe plugin IDs, phase, capability and dependency-path attribution while excluding arbitrary error messages, causes and stacks.
- Oversized and inactive requests now receive audit attribution before envelope acceptance; Unsubscribe records retain supplied subscription IDs.
- Capability diagnostic text is capped at 256 characters before retention or delivery to `onAudit`, including early rejections. Other audit identifiers are capped at 128 characters.

Focused recheck: no remaining findings or identified scope expansion.

## Validation

- `pnpm test`: 134 tests passed across 13 files.
- `pnpm typecheck`: passed.
- `pnpm build`: passed for runtime, Host and restricted fixture.
- `pnpm test:e2e`: 8 browser cases passed, covering both Surface mount paths, subscriptions, configuration reload, failure isolation, and independent backend authorization.
- `git diff --check`: passed.

Remaining findings: Standards 0; Spec 0. Neither axis has an unresolved blocking issue.

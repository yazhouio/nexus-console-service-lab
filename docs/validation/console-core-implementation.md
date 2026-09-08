# Console Core implementation validation — 2026-09-08

Requested specification: `apps/docs/docs/console-core-architecture.md` at baseline `f5efecc6f066ff81bbec0d54d65e57980858044a`. Review used `git diff --cached f5efecc6f066ff81bbec0d54d65e57980858044a` before committing the implementation; HEAD was the baseline and no intervening commits existed.

The implementation separates Distribution, Browser Host, Runtime, Console Core and public API packages. It provides managed Router-tree root/Layout execution, independent recovery, compiled Point/Profile/Ref contracts, versioned admission across five Kinds, explicit Platform permissions, Action-only execution and lazy Tabs. Author documentation and contract-version publishing checks were updated together.

## Validation

- `pnpm typecheck`: all workspace checks passed, including dependency boundaries.
- `pnpm test`: 226 Runtime tests and 8 script tests passed.
- `pnpm build`: Runtime, Console, Restricted fixtures and documentation built successfully.
- `pnpm test:e2e`: all 31 browser regressions passed.
- `pnpm build:routing-validation` and `pnpm test:e2e:preview`: optimized build and all 31 preview browser regressions passed.
- After review fixes: focused Point/Action/Tab tests passed; root/bootstrap/Builtin-action/Point tests passed (17 tests); affected Console recovery, routing and Restricted lifecycle browser regressions passed (17 tests). Two new Point tests cover unsupported dimensions and Action cardinality before connection. Typechecking passed again.
- Final optimized build and documentation rebuild passed; all 17 affected preview browser regressions passed against the rebuilt artifacts.

## Standards

Independent review found **0 documented-standard breaches and 1 non-blocking judgement call**: possible Repeated Switches in `packages/plugin-runtime/src/platform.ts`. Capability identities select schemas, subscription eligibility and invocation behavior in several places. A future maintenance refactor could group each capability's schema, handler and optional subscription behavior into one definition map. The reviewer explicitly did not consider this a correctness issue or reason to block the commit.

The local read-through also removed a leftover business label from Browser Host and removed SurfaceMount's unused direct-adapter branch. Every current presentation now uses UiHost execution and cleanup.

## Spec

Independent review initially found **1 P2**: some accepted Point constraints had no execution effect. This was fixed and independently rechecked: unsupported dimensions now fail compilation, Surface/Tab modes are validated, and Action cardinality is checked against its single execution before connecting the owner. Documentation states the per-Kind semantics. The reviewer confirmed **0 remaining findings**, with 10 focused Point/Tab tests passing during recheck.

Final review totals: Standards — 1 non-blocking maintainability suggestion, worst: repeated capability dispatch selection. Spec — 0 remaining findings; the original constraint-enforcement P2 is closed.

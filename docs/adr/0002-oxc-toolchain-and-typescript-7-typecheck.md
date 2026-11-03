# 0002. Oxc toolchain and TypeScript 7 typecheck

Status: Accepted (2026-11-03)
Spec: #73 (S2, S4, S6, S7)

## Context

The repo had a single typecheck (`tsc --noEmit`) and no linter, formatter or dead-code check. The same choices were already made and proven in aokit, which uses the Oxc tools and the native TypeScript compiler.

## Decision

Lint with `oxlint --type-aware --deny-warnings`, format every file (markdown included) with `oxfmt`, find dead code with `knip`, and typecheck with an aliased `"typescript7": "npm:typescript@7.1.0-beta"` called by path (`node_modules/typescript7/bin/tsc`), never as bare `tsc`. Both tsconfigs enable the strict extras (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` and the rest of S2) and drop `"DOM"` from `lib`. Settings are tightened, never loosened, to make a check pass. Oxc and `typescript7` are pinned to exact versions and never automerged.

## Consequences

- Checks are fast enough to run on every commit through lint-staged.
- The beta compiler can break on upgrade, so its bumps are manual and reviewed.
- `forge selftest` keeps using the stable `typescript` in `forge/`, so the two compilers coexist on purpose.
- `tools/typescript7-version.test.ts` guards against a script calling bare `tsc`.

## Alternatives considered

- **ESLint + Prettier + stable tsc**: rejected as slower and requiring more configuration for the same coverage.
- **Biome**: rejected because type-aware linting and the local JS plugin used for ADR-0003 are not available.
- **Stable TypeScript 5 for the repo typecheck**: rejected to stay aligned with aokit and the native compiler.

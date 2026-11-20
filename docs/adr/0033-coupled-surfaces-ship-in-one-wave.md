# 0033. Coupled surfaces ship in one wave

Status: Accepted (2026-11-20)
Spec: #698 (S4, S5, S6)

Amends [0004](0004-one-wave-one-dependency-layer-one-pr.md): a wave is one dependency layer, and a coupled surface is not a layer boundary. Refines [0001](0001-root-dev-tooling-package-separate-from-runtime.md) for the paragraph named below.

## Context

A published English page and its translations are separate tickets. The translation tickets depend on the page text, so a planner reads that as a dependency and puts them in a later wave. The page then lands alone, its `sourceHash` changes, and every locale is stale until the next wave merges. A check that compares translations to their source fails in between.

## Decision

- `validate.coupledSurfaces` in `emet.config.json` is an optional non-empty list of `{ source, dependents }` glob pairs. Absent, the feature is off and every command behaves as it does today.
- `emet validate` (`--file` and `--spec`) and the run gate of `emet preflight` report a `coupled-surface-split` error when a ticket touching a pair's `source` is in an earlier wave than a ticket touching its `dependents`. The same wave, or no dependents ticket, passes. Exit codes stay 0, 1, 2 and 3.
- The planning rule in `emet/reference/phases-1-5.md` says the same to the planner: a ticket that edits a published English page and the tickets that translate it go in the same wave.
- This repository sets `{ "source": "docs/{guide,reference,how-to}/**/*.md", "dependents": "apps/site/src/content/translations/**" }`.
- **Prompt exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to one paragraph, and only to it: the planning rule above in `emet/reference/phases-1-5.md`. Every other paragraph of that file stays whitespace-only.

## Consequences

- A page and its translations land together, so the trunk is never left with stale translations.
- A wave can be wider than one strict dependency layer. The cost is that translation tickets cannot read the merged page and work from the page text in the ticket instead.
- A repository without `validate` sees no change.

## Alternatives considered

- **Keep translations in a later wave**: rejected because it leaves the trunk with stale translations between waves.
- **Fold the translations into the page ticket**: rejected because the touch set exceeds the sizing tripwires.
- **A warning instead of an error**: rejected because a warning is easy to approve past, and the split is always a planning mistake.

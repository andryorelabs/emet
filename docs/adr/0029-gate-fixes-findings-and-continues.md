# 0029. The gate fixes findings and continues instead of stopping

Status: Accepted (2026-11-18)
Spec: the manual-work reduction spec, spec 1 of 3 (S1, S2, S4, S7)

## Context

Phase 8 says to never auto-merge a wave with anything flagged, and `emet gate` stops once the review rounds run out. One budget, `budgets.reviewRounds`, covers both reviewing and fixing, so a fix made after the last **Review round** is never rechecked and its findings stay open. The **Coordinator** then waits for a person.

Across the waves launched between 2026-10-18 and 2026-11-18, 46% of chains started only after the user typed the same instruction: fix the findings, merge when CI is green and continue. Only 27% chained with no input at all. A check that never started (a billing block, no runner) is also treated as a failing check, holds the wave like a code failure and spends a CI-fix attempt.

## Decision

- `gate.onHold` selects the policy. `fix-and-continue` is the default; `stop` keeps the previous behaviour.
- With `fix-and-continue`, a **Hold** over open blocking findings starts a **Fix round**. The **Gate** answers with a `next` action so the **Coordinator** does not have to infer one.
- A **Fix round** has its own budget, `budgets.fixRounds`, which defaults to 2 and is separate from the **Review rounds**. It ends with a recheck by a **Reviewer** limited to the findings that were open when it began. A finding becomes resolved only through a recheck verdict, never because its author says so.
- The **Gate** answers **Stop** only when an open finding has the kind `intent_gap`, when the **Fix rounds** are exhausted with findings still open, or when the integration suite fails a second time after its failed specs were rerun in isolation.
- An **Environment fault** answers **Hold** without spending a CI-fix attempt. The check is rerun once. A second consecutive fault is reported as an infrastructure problem.
- The rule of never auto-merging a wave with anything flagged still holds: a wave merges only when no finding remains open, and a finding closes only through a recheck.
- **Prompt wording exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to the paragraphs of `emet/reference/phases-8-closeout.md`, `emet/reference/phases-9-handoff.md`, `emet/reference/tracker-github.md` and `commands/run.md` that describe the gate policy, `emet ci`, `emet chain`, `emet review --recheck` and `emet tracker close`. They are reworded so the prompts match the CLI, in the one ticket of the spec that owns prompts and docs. The explicit ticket that [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) requires for a change to the CLI's runtime behaviour is that spec's tickets.

## Consequences

- In the common case a wave chains without a person, because the instruction the user kept typing is now the default.
- A wrong fix could merge a regression. The recheck, CI and the integration suite stand between a fix and the merge, and a repo that wants the old behaviour sets `gate.onHold` to `stop`.
- A recheck reads only the open findings, so it costs less than a full **Review round**.
- The default changes for every repo that does not set `gate.onHold`.
- A ledger written before this change has no count of **Fix rounds** and reads as zero.

## Alternatives considered

- **Keep stopping and raise `budgets.reviewRounds`**: rejected because a fix made after the last round would still go unchecked, so it only delays the stop.
- **Opt-in policy**: rejected because the instruction is already the user's standing preference in every repo.
- **Recheck by tests alone**: rejected because no independent party confirms the fix, and tests do not cover findings of kind `intent_gap` or `bad_plan`.
- **Let the fixer mark its own findings resolved**: rejected because it removes the independent check the **Reviewer** exists to give.

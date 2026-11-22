# 0039. Quick mode lands per wave

Status: Accepted (2026-11-22)
Spec: draft #795
Amends [0037](0037-landing-per-spec.md) for **Quick runs**. Amends [0036](0036-prompt-wording-changes-under-an-explicit-ticket.md) with the paragraphs named below.

## Context

A one-ticket change pays for the full interview, the canvas, the context budget, the frontier rounds and the chaining. A spec branch ([0037](0037-landing-per-spec.md)) adds nothing to a spec with a single **Wave**: the wave would integrate into `spec/<id>` and then land again as the whole spec.

## Decision

`/emet:run --quick` starts a **Quick run**: one interview round, a spec with one ticket marked `folded`, the single approval, one worker, then `emet verify`, `emet assess --quick`, the **Reviewer** (except at the `passive` tier) and the **Gate**. It skips the canvas, the context budget, further frontier rounds and chaining.

- **Landing unit per run.** `emet approve --quick` records `mode: "quick"` in `approval.json`. `resolveLandingUnit(config, runId, root)` returns `wave` for that run and `landing.unit` for any other, and `landed`, `status` and `preflight` read the unit through it. A malformed `approval.json` is an error, never a silent fallback.
- **High risk stops the run.** `emet assess --quick` exits 1 when the tier is `high`. The coordinator treats that as a **Stop**: no auto-merge, the pull request stays open, and the report names the reasons. A person rules; the run never turns into a full run on its own.
- **One ticket or no quick run.** A change that touches a screen or does not fit one ticket stops before the approval, with a recommendation to run `/emet:run` without `--quick`.
- **Validation.** `emet validate` reports `no-tickets` for an empty ticket list, so the fast path writes one `folded` ticket instead of none.
- **Combination.** `--quick` is rejected with `--draft` and `--dispatch`; `--no-promote` is accepted and the after-spec step runs as usual. With `specs.enabled`, the quick run writes its spec deltas like any last wave.
- **Prompt exception** ([0036](0036-prompt-wording-changes-under-an-explicit-ticket.md)). The wording of these paragraphs changes, and `BYTE_CEILINGS` rises in the same pull request: the `## Modes` list in `commands/run.md` and the fast-path bullet in `emet/reference/phases-1-5.md`. `emet/reference/phases-quick.md` is new.

## Consequences

- A one-ticket change costs one interview round, one approval and one landing.
- A **Quick run** keeps every review and gate, so the saving comes from skipped ceremony, not skipped checks.
- `approval.json` gains an optional field; records written before it still pass `approve --check`.

## Alternatives considered

- **An environment variable override**: rejected because it is lost between sessions and runs.
- **A prompt-only override**: rejected because the CLI readers of `landing.unit` would still expect a spec branch.
- **Escalating a high-risk quick run into a full run**: rejected because it changes the approved plan without a person ruling.
- **A ticketless fast path**: rejected because `validate`, `approve`, claims and tracker closing all need a ticket.

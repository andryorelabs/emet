# Incidents — the evidence behind the rules

Real run failures that produced a rule elsewhere in this command. Never
loaded during a normal run — read this only when someone asks why a rule
exists, or before changing one of the rules it justifies.

## AO-285 — lost mutex via inline `bun -e`

A coordinator called the claims/slots reservation functions directly via an
inline `bun -e` snippet instead of the `forge` CLI. The snippet's positional
arguments were in the wrong order, and the mistake wasn't caught — the
ticket dispatched with no working mutex at all, silently. This is why the
rule is "always go through the `forge` CLI", not "call the underlying
function correctly": an untypechecked one-off snippet has no argument names
to get right in the first place.

## AO-281 wave 2 / AO-321 — duplicate worktrees and unlocked stragglers

Two separate real-run shapes exposed the gap a post-dispatch audit now
closes:

- **AO-281 wave 2**: two worktrees ended up claiming the same ticket, with
  nothing distinguishing the canonical one from the duplicate.
- **AO-321**: a worker's bootstrap step (the `git worktree lock` call) was
  skipped, leaving a worktree under `.claude/worktrees/` with no `/forge`
  lock reason at all — unattributable to any run, and indistinguishable from
  an ordinary interactive worktree doing unrelated work.

`forge preflight --post-dispatch`, run immediately after every dispatch
batch, catches both shapes (plus two sibling shapes: two worker branches for
the same ticket number, and a worktree whose checked-out branch doesn't
match its own lock's ticket) before any worker has had a chance to commit.

## The 8-finder roster hang

A `code-review` fan-out of 8 `angle-*`-style finder sub-agents hung for
~1h45m with transcripts that had stopped growing entirely — no notification
of its own, because a hung roster produces no completion event to notify on.
This is why Phase 8 polls `forge usage --stalled` while waiting on a
fan-out, instead of only watching for the completion notification, and why
a stalled roster gets `TaskStop`'d and retried at a smaller fan-out rather
than waited out indefinitely.

## LSP never reaches a worker

Verified across 97 subagent transcripts (2026-09-01): `LSP` never reaches a
worker regardless of `subagent_type` or `isolation: "worktree"` — it's a
tool wired into the *main* (coordinator) session only, and
`ToolSearch("select:LSP")` returns "No matching deferred tools found" from
inside every worker, every time. This is why workers are told not to call
`ToolSearch("select:LSP")` at all, and to `SendMessage` the coordinator
instead for a real `findReferences`.

## The handoff note's 0-of-4 wave

A wave measured at 79 minutes and 703K tokens produced 0 of 4 workers
following the handoff-note and locate-before-`Read` discipline, when those
were only described as prose asides ("prefer grep", "keep a handoff note")
rather than named, numbered, mandatory instructions with exact commands.
This is why the worker prompt template spells out the literal commands
(`rg -n`, `sg run -p`, `Read` with `offset`/`limit`) instead of describing
the practice abstractly, and why the handoff-note triggers are three fixed
moments, not a token-count threshold a worker has to estimate itself.

## The 348K vs 129K sibling tickets

Two nearly-identical sibling tickets in the same wave produced wildly
different worker context: one peaked at 129K, the other at 348K. The
difference traced to ticket shape, not implementation difficulty: the 348K
ticket combined a new page object **and** a new E2E spec in one ticket,
while the 129K ticket kept those separate. This is the source of Phase 3's
ticket-splitting tripwires (estimated peak > 160K; touch set > 8 files or
> 1,500 lines; new surface > 500 lines; more than one new E2E spec; a new
page object and a new spec together).

# Phase 8 — review and gate

Load `reviewer-prompt.md` before the review below. Dispatch is in
`phases-6-7-dispatch.md`; landing and close-out continue in
`phases-8-landing.md`; the hand-off is in `phases-9-handoff.md`.

**Re-read this section before each fix/review round** — after a compaction or
a long CI-fix loop the exact steps (ledger, round caps, what counts as a
blocker) are the first thing to drift; reload this file rather than working
from memory.

## Phase 8 — Wave close-out

As each worker's completion notification arrives — not once the whole wave is
done — release that worker's own slot: `emet slots --release --run <runId>
--ticket <ticket>`. Slot lifetime is per-worker, not per-wave: a worker that
finished in minute 2 of a 40-minute wave should free its slot for the next
ticket immediately, not sit on it until this whole phase closes out. `emet
cleanup --run <runId>` at the end of this phase stays the backstop that
releases anything still held (a worker that never reported, one flagged and
left for a human) — it is not the primary release path anymore. A ticket
retried in Phase 9 re-acquires its own slot from scratch and can be denied
exactly like a fresh dispatch (no free slot, or the memory brake) if the host
has filled up since.

Before merging any worker's branch, confirm a final
`.emet/handoff-<ticket>.md` in its worktree and that the worktree is still
locked with a `/emet:run` reason naming that ticket (`git worktree list
--porcelain`). If either is missing, don't merge that branch silently — flag
it in Phase 9's report like any failed ticket.

A confident summary is not evidence (`${CLAUDE_PLUGIN_ROOT}/emet/reference/incidents.md`). For each
worker: `emet results --run <runId> --read <ticket>` (status, report path,
`Risk:` line; no result = no report), then `emet verify <ticket> --run
<runId> --worktree <its worktree>` — commits beyond the dispatch baseline, paths inside the edit
surfaces, `handoff --check`, `commands.workerScopedSuite`. Exit 1 means the
branch is neither reviewed nor merged: `emet gate <ticket>` decides retry or
defer against `budgets.workerAttempts`. You post the worker's decisions and
final status to its ticket (workers never write the tracker).

Also run `emet usage --session <this coordinator session>` and, per worker,
flag (report, don't block the merge on) any full `Read` over
`usage.oversizedReadLines` lines — same "flag in Phase 9's report" treatment
as the check above. This is the backstop for Phase 7 step 3
(locate-before-`Read` discipline): see `${CLAUDE_PLUGIN_ROOT}/emet/reference/incidents.md`'s "The
handoff note's 0-of-4 wave" for the measured run where the prose-only
version of this instruction was followed by none of four workers.

Merge this wave's worker branches, in dependency order, into one integration branch named
`<type>/<slug>` — the `<type>` matching this repo's own convention (`feat`,
`fix`, `docs`, `refactor`, `chore`, `test`, …) and chosen from whichever
commit type dominates the wave, resolving any merge conflicts inline, the `<slug>` describing what the wave
actually contains (e.g. `test/unit-test-foundation` for a wave whose commits
are mostly `test(...)`). This is the branch that gets pushed — never the
workers' own local `<branchPrefix>-<n>-<slug>` branches from Phase 7, and
never a bare, slash-less name improvised on the spot.

This name has no run or ticket discriminator, so two waves in different
worktrees can collide on it. Before `git checkout -b`, check `git rev-parse
--verify --quiet <type>/<slug>`; if it resolves, append a disambiguator
(`<type>/<slug>-2`) rather than reusing it.

With `landing.unit: spec`, `<trunk>` below is the spec branch's `tip` from
`emet spec-branch status`, and the landing is `phases-8-spec-landing.md`.

Review here, once, over the full integration branch — this is the review
Phase 7 deliberately deferred. First route it by risk: run
`emet assess --base <trunk> --head <integration branch> [--risk-line "<first non-none Risk: line>"]`. It prints JSON
`{tier, reasons, reviewer:{model,effort}}`, and the tier decides:

- `passive` (docs-only diff) → no reviewer. Skip the dispatch below, note the
  `reasons` in this wave's report, and continue with the full suite.
- `medium` → today's reviewer, dispatched as below on `models.reviewer.medium`
  (default opus/medium).
- `high` → the same dispatch on `models.reviewer.high` (the `reviewer` object
  `emet assess` printed: pass its model, and its effort where the dispatch
  supports one). Auto-merge is additionally gated: `pr.autoMerge` lands the PR
  only when every check is green **and** the ledger has no open finding;
  otherwise leave it open with the human-decision label.

A worker's `Risk:` line other than `none` can only raise the tier you take
from `emet assess`, never lower it. Package the diff first: `emet
review-package <base> <head> --out <file>` (exit 3 on an empty or
non-descendant range — fix the range, don't review nothing) and pass the
reviewer that path. Dispatch one `Agent({subagent_type: "emet:emet-reviewer"})`
built from `${CLAUDE_PLUGIN_ROOT}/emet/reference/reviewer-prompt.md` (fill `{{project_skills}}` with the
union of the wave tickets' `## Project skills`, `none` if all say `none`; add
the spec's `## Global Constraints`) — single-pass, never a fan-out (nesting
hung workers and a fan-out roster hung ~1h45m; `${CLAUDE_PLUGIN_ROOT}/emet/reference/incidents.md`).
Fallback if `emet:emet-reviewer` is missing: the `code-review` skill at `--level
low|medium`. `/code-review ultra` is a manual, opt-in step only.

Browser axis: fill `{{browser_verify}}` in the reviewer prompt (with the
"Browser axis text" section of `reviewer-prompt.md`) only when `emet assess`
printed `browserVerify.run: true`; otherwise leave it empty.

Record the reviewer's findings JSON per ticket: `emet review --ticket
<ticket> --findings <file|-> [--changed <files since the last round>]`. The
CLI enforces triage order (intent_gap, bad_plan, patch, defer) and the
`budgets.reviewRounds` cap, and exits 1 while findings are open. Fix, then
with `gate.onHold: stop` (or when no fix round applies) re-dispatch
`emet:emet-reviewer` with the "Recheck variant: stop-mode re-review" (ledger
plus the diff from the reviewed sha only) and record again through `review
--findings`, also after any CI fix. Under `fix-and-continue`, use the fix round
below instead.
At the cap, escalate once: `emet review --ticket <ticket> --escalate --model
<current>` prints the next tier (exit 1 if none); run one fresh worker on it.
Anything still open you rule on: `emet review --ticket <ticket> --rule
"<what>" --why "<why>" --cost "<cost if wrong>"`. `--rulings` prints them
for "Rulings I made" in the final report and PR body.

**Fix round.** With `gate.onHold: fix-and-continue` (the default) open blocking
findings do not end the wave: `emet gate` answers `hold` with `next:
"fix-findings"` while `budgets.fixRounds` (default 2) has rounds left. Fix the
open findings, then end the round with a recheck: re-dispatch
`emet:emet-reviewer` with the "Recheck variant: fix round" over only the findings that were open
when the round began and the fix diff. The reviewer emits a JSON array of
`{id, resolved}` with one entry per finding open at round start (not the
findings array minus the fixed ones); record those verdicts with `emet
review --ticket <ticket> --recheck --verdicts <file|->` (a JSON array of
`{id, resolved}`). A finding becomes `resolved` only through a recheck verdict.
A recheck costs one fix round, never a review round, and exits 1 naming the
cap once `budgets.fixRounds` is used. `emet gate` answers `stop` when an open
finding has kind `intent_gap`, or when the fix rounds are exhausted with
findings still open. `gate.onHold: stop` keeps the older behavior: `hold` and
`stop` leave the PR open for a human.

Then run `commands.fullSuite` exactly once over the merged result (the
Phase 7 singleton, if any). Red blocks the PR and `autoChain`; a first red answers `hold` with `next:
"rerun-failed-specs"`: rerun only the failed specs in isolation and pass the
result again as `--integration`, and a second red answers `stop`. Finally ask
the one decision: `emet gate <ticket> --tier <assess tier> --ci
<pass|fail|pending|none> --integration <pass|fail|pending|none>
--waves-remaining <n>` prints
`{decision, reasons}` as JSON — `merge`, `hold`, `chain`, `stop`, or `defer`
(label `emet:deferred`; the wave continues). A `hold` carries a `next` value
and you act on it instead of stopping: `fix-findings` (fix round above),
`rerun-failed-specs` (integration suite), `rerun-ci` or `report-infrastructure`
(CI environment fault, below). A `hold` without `next` and every `stop` leave
the PR open with the human-decision label; don't re-derive the rules in prose.

Next: the tracker transition, the wave PR and close-out are in `phases-8-landing.md`.

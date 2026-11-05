# Phase 8 — wave close-out

Load `reviewer-prompt.md` before the review below. Dispatch is in
`phases-6-7-dispatch.md`; the hand-off is in `phases-9-handoff.md`.

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

Record the reviewer's findings JSON per ticket: `emet review --ticket
<ticket> --findings <file|-> [--changed <files since the last round>]`. The
CLI enforces triage order (intent_gap, bad_plan, patch, defer) and the
`budgets.reviewRounds` cap, and exits 1 while findings are open. Fix, then
re-dispatch `emet:emet-reviewer` in `recheck` mode (ledger plus the diff from the
reviewed sha only; "Recheck variant") and record again, also after any CI fix.
At the cap, escalate once: `emet review --ticket <ticket> --escalate --model
<current>` prints the next tier (exit 1 if none); run one fresh worker on it.
Anything still open you rule on: `emet review --ticket <ticket> --rule
"<what>" --why "<why>" --cost "<cost if wrong>"`. `--rulings` prints them
for "Rulings I made" in the final report and PR body.

Then run `commands.fullSuite` exactly once over the merged result (the
Phase 7 singleton, if any). Red blocks the PR and `autoChain`. Finally ask
the one decision: `emet gate <ticket> --tier <assess tier> --ci
<pass|fail|pending|none> --integration <pass|fail|pending|none>
--waves-remaining <n>` prints
`{decision, reasons}` as JSON — `merge`, `hold`, `chain`, `stop`, or `defer`
(label `emet:deferred`; the wave continues). `hold` and `stop` leave the PR
open with the human-decision label; don't re-derive the rules in prose.

The coordinator writes a tracker-state transition only where
`emet.config.json`'s `tracker.transitions` names it `coordinator` for
`onPrOpen`/`onPrMerge` (see `${CLAUDE_PLUGIN_ROOT}/emet/reference/tracker-<kind>.md`) — never where a
tracker's own PR-linked automation already marks it `automatic` (e.g.
Linear's GitHub integration). If green and nothing was flagged: push the
integration branch once, open one PR for this wave (never one per ticket —
that's what makes running the shared suite once per wave enough). Write its body by calling the Skill tool with `pr` and following
its template. It
lists "Rulings I made" (`emet review --rulings`) and closes every ticket this wave completed using this repo's tracker's
closing-keyword convention (`docs/agents/issue-tracker.md` — a plain
`commit.trailer` only links without closing; it's for a ticket this wave
touches but doesn't finish).

**Verify the closing line landed, right after `gh pr create`, before doing
anything else** — a markdown formatter reflowing the blank line that
separates it from the rest of the PR body silently breaks the tracker's
keyword parsing (see `${CLAUDE_PLUGIN_ROOT}/emet/reference/tracker-<kind>.md`'s `pr.referenceLines`):
`gh pr view <n> --json body -q .body | grep -c '^Closes'` must return `1`+;
if it doesn't, fix it with `gh pr edit <n> --body-file …` before reporting
the wave done. This has no cheap fix later — the merge webhook that would
have closed those tickets doesn't retry, so a PR that already merged without
this line needs a manual per-ticket state write instead.

**Land the PR** per `emet.config.json`'s `pr` section (`autoMerge` default
`true`, `mergeMethod` default `squash`, `maxCiFixAttempts` default `2`):

1. `pr.autoMerge: false` → leave the PR open, skip cleanup of this wave's
   branches, and say so in the report.
2. No checks at all (`gh pr checks <n> --json bucket -q length` returns `0`,
   or `gh` says none are reported) → CI counts as `pass`: go to the gate.
3. Checks exist → `gh pr checks <n> --watch --fail-fast`. All green → the gate.
   Run `emet gate <ticket> --ci pass …` per ticket (above); merge only if
   every ticket answers `merge` or `chain`: `gh pr merge <n> --<mergeMethod>
   --delete-branch`. Then, as its own call, `emet spec-merge --spec <spec-id>`
   folds the spec's `.emet/runs/<spec-id>/spec-deltas/` into `specs.dir`
   (exit 1 = conflict or scenario loss, nothing written: report it).
4. A check failed → never read the CI log yourself (no `--log-failed` into
   your own context). Dispatch an `Agent` on `models.triage` (default
   `haiku`) to fetch and read it (`gh run view <run-id> --log-failed`) and
   return at most ~2k tokens: the failing check, the root-cause error, and
   `file:line` for each failure, with no raw log excerpts beyond a few lines.
   Before spending an attempt, compare the failing _job_ with trunk's
   latest completed run (`gh run list --branch <base> --workflow <name>
   --status completed --limit 1 --json databaseId`, then `gh run view <id>
   --json jobs`). Only if that same job failed on trunk is it baseline:
   spend no attempt, note it in the PR body, and treat that check as
   non-blocking. A different job failing on trunk, or no completed trunk
   run, is not baseline.
   Otherwise fix it on the integration branch from that report, run the
   affected fast checks locally, push, and go back to step 3. After
   `pr.maxCiFixAttempts` failed fix attempts, stop: leave the PR open, apply the human-decision label
   (`docs/agents/triage-labels.md`), and report the failing check.

**Merge mode** (`landing.mode: merge`): no push, no PR, no `gh`. Run
`commands.selfCheck` on the integration branch as CI (on red, up to
`pr.maxCiFixAttempts` fix rounds, then leave the branch unmerged and report);
its result is the `--ci` value for `emet gate`. If every ticket answers
`merge` or `chain` and `pr.autoMerge` is on: `emet land --spec <spec-id>
--branch <integration> --tickets <id,…> --wave <n> --summary "<what the wave
contains>"` (refuses with exit 1 unless the main
worktree is on `repo.trunk` and clean; prints the new trunk sha as JSON). Then
close each ticket per `onPrMerge: coordinator`, and run `emet spec-merge` and
`emet cleanup --run <runId>` as separate calls. `pr.autoMerge` off or anything
flagged: leave the integration branch unmerged and report it.

Never auto-merge a wave with anything flagged (see below), whatever
`pr.autoMerge` says. Run the merge and the cleanup below as **separate Bash
calls** — never chained with `&&` or `;` — so one being blocked can't stop
the other. After a merge, run `emet cleanup --run <runId>`. For each worktree
this run owns (attributed by its emet lock, else by the claim on its ticket)
whose ticket landed and whose tree is clean, it removes the worktree, deletes
its worker and `worktree-agent-*` branches, and releases its claim; it also
releases the run's worker slots. A dirty worktree, or one whose ticket has not
landed, is kept and reported with the command to run by hand. When the sweep
has no failures it marks the run closed, so every later reclaim treats the run
as finished even while your session stays open. Don't leave any of this for the
next wave or the final report to discover.

The bare `emet cleanup` is the safe reclaim: it removes the same things for
every run that is closed or dead and whose ticket landed, and never touches a
live or idle run, a worktree it cannot attribute to a run, or a foreign
worktree. Run it to sweep up after a crashed or abandoned wave. `emet cleanup
--all` stays the deliberate repo-wide branch sweep; never run `--all --force`
while `emet slots` shows a live run other than your own, since it reaches
every branch in the repo. Worktrees are removed only through `emet cleanup`,
never by hand with `git worktree remove` or `rm`.

If anything was flagged (a ticket failed twice, produced a
needs-a-human-decision, or a conflict got resolved by judgment rather than
mechanically): leave the PR open instead of merging, skip `emet cleanup`
for this wave's still-live branches, and say so plainly in the final report
— don't merge on the user's behalf.

Next: Phase 9 is in `phases-9-handoff.md`.

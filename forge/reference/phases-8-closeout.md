# Phase 8 — wave close-out

Load `reviewer-prompt.md` before the review below. Dispatch is in
`phases-6-7-dispatch.md`; the hand-off is in `phases-9-handoff.md`.

**Re-read this section before each fix/review round** — after a compaction or
a long CI-fix loop the exact steps (ledger, round caps, what counts as a
blocker) are the first thing to drift; reload this file rather than working
from memory.

## Phase 8 — Wave close-out

As each worker's completion notification arrives — not once the whole wave is
done — release that worker's own slot: `forge slots --release --run <runId>
--ticket <ticket>`. Slot lifetime is per-worker, not per-wave: a worker that
finished in minute 2 of a 40-minute wave should free its slot for the next
ticket immediately, not sit on it until this whole phase closes out. `forge
cleanup --run <runId>` at the end of this phase stays the backstop that
releases anything still held (a worker that never reported, one flagged and
left for a human) — it is not the primary release path anymore. A ticket
retried in Phase 9 re-acquires its own slot from scratch and can be denied
exactly like a fresh dispatch (no free slot, or the memory brake) if the host
has filled up since.

Before merging any worker's branch, confirm its ticket has at least one
tracker comment, a final `.forge/handoff-<ticket>.md` in its worktree
(`state: done`, or whatever it actually ended at), and that its worktree is
still `git worktree lock`ed with a `/forge` reason naming that exact ticket
(`git worktree list --porcelain`) — an unlocked or mismatched lock at this
point means the Phase 6 post-dispatch audit's finding was ignored or the lock
was lost mid-wave. If any of these is missing, don't merge that branch
silently — flag it in this wave's report (Phase 9) the same way a failed or
needs-a-human-decision ticket is flagged. This is the real backstop for the
"comment as you go" rule: every worker's branch passes through this gate
regardless of ticket type, unlike the E2E queue's own check, which only fires
for E2E-touching tickets.

A worker (or a coordinator's own fork) that reports success with no commit in
its worktree did not do the work — a confident summary is not evidence.
Verify with `git -C <worktree> log`/`status` before merging or trusting the
report; a transcript with zero tool calls behind a "done" claim is the
canonical shape of this failure (`reference/incidents.md`).

Also run `forge usage --session <this coordinator session>` and, per worker,
flag (report, don't block the merge on) any full `Read` over
`usage.oversizedReadLines` lines — same "flag in Phase 9's report" treatment
as the check above. This is the backstop for Phase 7 step 3
(locate-before-`Read` discipline): see `reference/incidents.md`'s "The
handoff note's 0-of-4 wave" for the measured run where the prose-only
version of this instruction was followed by none of four workers.

Use the `resolving-merge-conflicts` skill to merge this wave's worker
branches, in dependency order, into one integration branch named
`<type>/<slug>` — the `<type>` matching this repo's own convention (`feat`,
`fix`, `docs`, `refactor`, `chore`, `test`, …) and chosen from whichever
commit type dominates the wave, the `<slug>` describing what the wave
actually contains (e.g. `test/unit-test-foundation` for a wave whose commits
are mostly `test(...)`). This is the branch that gets pushed — never the
workers' own local `<branchPrefix>-<n>-<slug>` branches from Phase 7, and
never a bare, slash-less name improvised on the spot.

Unlike worker branches (numbered by ticket, so two waves almost never collide
on one), this name carries no run or ticket discriminator — two waves in
different git worktrees of the same repo (e.g. two Orca worktrees, each
running a different spec) can independently land on the same `<type>/<slug>`
for an unrelated reason. Before running `git checkout -b`, check
`git rev-parse --verify --quiet <type>/<slug>`; if it already resolves,
append a short disambiguator (`<type>/<slug>-2`, or something naming this
wave's own tickets) rather than reusing the name — git will otherwise refuse
the second worktree's checkout outright, or worse, silently fold two
unrelated waves' history together if it doesn't.

Review here, once, over the full integration branch — this is the review
Phase 7 deliberately deferred. First route it by risk: run
`forge assess --base <trunk> --head <integration branch>`. It prints JSON
`{tier, reasons, reviewer:{model,effort}}`, and the tier decides:

- `passive` (docs-only diff) → no reviewer. Skip the dispatch below, note the
  `reasons` in this wave's report, and continue with the full suite.
- `medium` → today's reviewer, dispatched as below on `models.reviewer.medium`
  (default opus/medium).
- `high` → the same dispatch on `models.reviewer.high` (the `reviewer` object
  `forge assess` printed: pass its model, and its effort where the dispatch
  supports one). Auto-merge is additionally gated: `pr.autoMerge` lands the PR
  only when every check is green **and** the ledger has no open finding;
  otherwise leave it open with the human-decision label.

Both `models.*` keys default to today's values, so a repo without a `models`
section keeps the same medium-tier reviewer model as before (the tier itself
still comes from the diff). Dispatch a single `Agent({subagent_type:
"forge-reviewer"})` call built from `reference/reviewer-prompt.md`'s
template — fill its `{{project_skills}}` placeholder with the union of every
wave ticket's `## Project skills` entries (`none` if all tickets said
`none`) — a fresh-context, single-pass review, never a fan-out: nesting
sub-agents inside a subagent's own review is what caused two workers to hang
mid-review in the run that originally motivated a fan-out here
(`reference/incidents.md`), and a fan-out's own roster has separately hung
for ~1h45m in this repo. The reviewer writes a ledger to `.forge/review-<runId>.md`. Apply whatever
it flags as a blocker before proceeding, then (and again after any CI fix in
step 4 below) re-dispatch `forge-reviewer` in `recheck` mode with only the
ledger and the diff from the reviewed sha to HEAD (`reviewer-prompt.md`,
"Recheck variant"), at most 2 rounds. A finding still open after round 2
gets the human-decision label and blocks auto-merge, like any other flag; a should-fix finding is the coordinator's judgment call,
noted in this wave's report either way (Phase 9). If `forge-reviewer` is
missing (`forge doctor`'s global findings), fall back to the `code-review`
skill's own no-fan-out mode (`--level low` or `medium`) rather than its
default fan-out. For a high-stakes wave, the user can additionally run
`/code-review ultra` by hand afterward — that's a manual, opt-in step, never
something this phase dispatches on its own.

Then run this repo's full test suite exactly once over the merged
result (`commands.fullSuite`, the shared/singleton resource from Phase 7, if
this repo has one).

The coordinator writes a tracker-state transition only where
`forge.config.json`'s `tracker.transitions` names it `coordinator` for
`onPrOpen`/`onPrMerge` (see `reference/tracker-<kind>.md`) — never where a
tracker's own PR-linked automation already marks it `automatic` (e.g.
Linear's GitHub integration). If green and nothing was flagged: push the
integration branch once, open one PR for this wave (never one per ticket —
that's what makes running the shared suite once per wave enough). Its body
closes every ticket this wave completed using this repo's tracker's
closing-keyword convention (`docs/agents/issue-tracker.md` — a plain
`commit.trailer` only links without closing; it's for a ticket this wave
touches but doesn't finish).

**Verify the closing line landed, right after `gh pr create`, before doing
anything else** — a markdown formatter reflowing the blank line that
separates it from the rest of the PR body silently breaks the tracker's
keyword parsing (see `reference/tracker-<kind>.md`'s `pr.referenceLines`):
`gh pr view <n> --json body -q .body | grep -c '^Closes'` must return `1`+;
if it doesn't, fix it with `gh pr edit <n> --body-file …` before reporting
the wave done. This has no cheap fix later — the merge webhook that would
have closed those tickets doesn't retry, so a PR that already merged without
this line needs a manual per-ticket state write instead.

**Land the PR** per `forge.config.json`'s `pr` section (`autoMerge` default
`true`, `mergeMethod` default `squash`, `maxCiFixAttempts` default `2`):

1. `pr.autoMerge: false` → leave the PR open, skip cleanup of this wave's
   branches, and say so in the report.
2. No checks at all (`gh pr checks <n> --json bucket -q length` returns `0`,
   or `gh` says no checks are reported) → merge at once:
   `gh pr merge <n> --<mergeMethod> --delete-branch`.
3. Checks exist → `gh pr checks <n> --watch --fail-fast`. All green → merge
   as in step 2.
4. A check failed → never read the CI log yourself (no `--log-failed` into
   your own context). Dispatch an `Agent` on `models.triage` (default
   `haiku`) to fetch and read it (`gh run view <run-id> --log-failed`) and
   return at most ~2k tokens: the failing check, the root-cause error, and
   `file:line` for each failure, with no raw log excerpts beyond a few lines.
   Before spending an attempt, compare the failing *job* with trunk's
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

Never auto-merge a wave with anything flagged (see below), whatever
`pr.autoMerge` says. Run the merge and the cleanup below as **separate Bash
calls** — never chained with `&&` or `;` — so one being blocked can't stop
the other. After a merge, run `forge cleanup --run <runId>` to delete this wave's local branches
(`worktree-agent-*` residue and fully-merged worker branches), prune
worktrees, and release this run's ticket reservations and worker slots —
always pass `--run <runId>` here, not the bare command, or those
reservations and slots outlive the wave and stay occupied until someone
else's `forge claims --prune`/manual cleanup reclaims them. Don't leave any
of this for the next wave or the final report to discover.

**Never `git worktree remove` a worktree by hand, and never run `forge
cleanup --all --force` (or the bare, unscoped command) while `forge slots`
shows a live run other than your own.** Both sweep every branch/worktree in
the repo, not just this run's — a sibling coordinator's still-in-progress
worktree looks identical to abandoned residue from the outside, and either
command can delete a sibling's uncommitted work or leave its lock
inconsistent. `forge cleanup --run <runId>` is always scoped and always
safe to run for your own wave, regardless of who else is running.

If anything was flagged (a ticket failed twice, produced a
needs-a-human-decision, or a conflict got resolved by judgment rather than
mechanically): leave the PR open instead of merging, skip `forge cleanup`
for this wave's still-live branches, and say so plainly in the final report
— don't merge on the user's behalf.

Next: Phase 9 is in `phases-9-handoff.md`.

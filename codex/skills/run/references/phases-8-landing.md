# Phase 8 — landing and close-out

Continues `phases-8-review.md` (review and gate); the hand-off is in
`phases-9-handoff.md`.

The coordinator writes a tracker-state transition only where
`emet.config.json`'s `tracker.transitions` names it `coordinator` for
`onPrOpen`/`onPrMerge` (see `references/tracker-<kind>.md`) — never where a
tracker's own PR-linked automation already marks it `automatic` (e.g.
Linear's GitHub integration). If green and nothing was flagged: push the
integration branch once, open one PR for this wave (never one per ticket —
that's what makes running the shared suite once per wave enough). Write its body by invoking the skill with `pr` and following
its template. It
lists "Rulings I made" (`emet review --rulings`) and closes every ticket this wave completed using this repo's tracker's
closing-keyword convention (`docs/agents/issue-tracker.md` — a plain
`commit.trailer` only links without closing; it's for a ticket this wave
touches but doesn't finish).

**Verify the closing line landed, right after `gh pr create`, before doing
anything else** — a markdown formatter reflowing the blank line that
separates it from the rest of the PR body silently breaks the tracker's
keyword parsing (see `references/tracker-<kind>.md`'s `pr.referenceLines`):
`gh pr view <n> --json body -q .body | grep -c '^Closes'` must equal the
number of tickets this wave completed, since the body carries one `Closes #<n>`
line per ticket; if it is lower, fix it with `gh pr edit <n> --body-file …` before reporting
the wave done. This has no cheap fix later — the merge webhook that would
have closed those tickets doesn't retry, so a PR that already merged without
this line needs a manual per-ticket state write instead.

With a Linear tracker, run `ticket.reconcile` (`tracker-linear.md`) for each
wave ticket right after the PR opens and again after it merges, and list what
it fixed in the final report.

**Land the PR** per `emet.config.json`'s `pr` section (`autoMerge` default
`true`, `mergeMethod` default `squash`, `maxCiFixAttempts` default `2`):

1. `pr.autoMerge: false` → leave the PR open, skip cleanup of this wave's
   branches, and say so in the report.
2. Wait for CI with `emet ci --pr <n> --wait --rerun-flakes` (add
   `--timeout-minutes <m>`, default 30). It polls the checks, reruns each failed
   check once through `gh run rerun --failed` (a check that then passes is a
   Flake), never merges, and prints `state: pass | fail | env-fault | timeout`,
   the failed checks and `flakeReruns`. A PR with no checks at all is `pass`
   with `noChecks: true`. Exit 0 pass, 1 fail or env-fault, 3 timeout.
3. `state: pass` → the gate. Run `emet gate <ticket> --ci pass …` per ticket
   (above); merge only if every ticket answers `merge` or `chain`: `gh pr merge
   <n> --<mergeMethod> --delete-branch`. Then, as its own call, `emet
   spec-merge --spec <spec-id>` folds the spec's
   `.emet/runs/<spec-id>/spec-deltas/` into `specs.dir` (exit 1 = conflict or
   scenario loss, nothing written: report it). Then close the tickets: with
   `tracker.kind` `github`, `emet tracker close <ticket>... --pr <n>` closes
   each with `gh issue close --reason completed`, verifies its state and adds
   "Landed in #<n>" (idempotent: an already closed ticket reports
   `already-closed`; exit 1 if any ticket failed, the rest are still
   processed). Linear tickets are not closed by the CLI: confirm each is Done
   through the Linear MCP.
   `state: timeout` → CI did run but has not finished: pass `--ci pending`,
   rerun `emet ci --wait` once, and if it still times out leave the PR open
   and report.
   `state: env-fault` → a CI that never ran, e.g.
   `STARTUP_FAILURE`, is an Environment fault, not a code failure: pass
   `--ci env-fault` to the gate. The first answers `hold` with `next:
   "rerun-ci"` and charges no `pr.maxCiFixAttempts`; rerun and run `emet ci`
   again. A second consecutive one answers `next: "report-infrastructure"`:
   leave the PR open with the human-decision label and report it.
4. `state: fail` → never read the CI log yourself (no `--log-failed` into
   your own context). Run a read-only `codex exec` on `models.triage` (default
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

Every mode also deletes each local branch whose PR merged at the branch's tip
commit (the integration branch included), with the clean, unlocked agent
worktree holding it; the current branch is kept. So never hand the user a
`git branch -D`: run `emet cleanup` from the main worktree.

The bare `emet cleanup` is the safe reclaim: it removes the same things for
every run that is closed or dead and whose ticket landed, and never touches a
live or idle run, a worktree it cannot attribute to a run, or a foreign
worktree. Run it to sweep up after a crashed or abandoned wave. `emet cleanup
--all` stays the deliberate repo-wide branch sweep; never run `--all --force`
while `emet slots` shows a live run other than your own, since it reaches
every branch in the repo. Worktrees are removed only through `emet cleanup`,
never by hand with `git worktree remove` or `rm`.

**Tool-exhaustion check, before `ready for human`.** Before you hand any
task, step or decision back to the user as `ready for human`, list the CLIs
(`gh`, `git`, `emet`, `jq`, `bun`, …) and the MCP servers this session has,
and try them first: a status read, a merge, a tracker write that is yours to
make, a log fetch. Hand back only what none of them can do, and name in the
report which tools you tried and what each returned.

If anything was flagged (a ticket failed twice, produced a
needs-a-human-decision, or a conflict got resolved by judgment rather than
mechanically): leave the PR open instead of merging, skip `emet cleanup`
for this wave's still-live branches, and say so plainly in the final report
— don't merge on the user's behalf.

Next: Phase 9 is in `phases-9-handoff.md`.

# Phases 6–9 — dispatch through wave close and hand off

Loaded in every mode. Also load `worker-prompt.md` and `tracker-<kind>.md`
(`<kind>` from `forge.config.json`'s `tracker.kind`) before Phase 6
dispatches anything.

## Phase 6 — Dispatch

In `--dispatch` mode, this phase's parent is the `<spec-id>` passed to the
command — there's no freshly created spec issue from this run's own Phase 5
to use instead (see "Modes" in the main command file). In every other mode,
it's the spec issue Phase 5 just created.

Run `forge preflight` first — cheap local git/filesystem hygiene (this
repo's configured `preflight.requiredFiles` and `preflight.requiredCommands`,
leftover `worktree-agent-*` branches, a dirty `.claude/worktrees/` from a run
that didn't clean up after itself, any remaining `TODO(forge):` marker in
`docs/agents/`) plus a third-party dependency gate keyed off `tracker.kind`
(the mattpocock-skills plugin always, `gh` for a `github` tracker, the Linear
MCP server for a `linear` tracker). Fix whatever it flags before dispatching;
don't dispatch into a dirty or half-initialized repo. A failure here means a
real, verified gap — an environment quirk it merely couldn't check (e.g. no
network to validate `gh auth`) shows as a non-blocking warning instead.

Compute this wave's frontier against this repo's tracker
(`~/.claude/forge/reference/tracker-<kind>.md` for the literal calls) —
candidates are unassigned, in the tracker's "todo"
state, carrying the ready-for-dispatch triage label, under this spec, with no
open blocker. Sort by priority descending (`tracker.github.priorityLabels`,
or the tracker's native priority field), then `createdAt` ascending.

Immediately before each survivor's `Agent` call, reserve it with
`forge claims --reserve <ticket> --run <runId> --anchor <anchorPid>` (the
real dispatch mutex — see `reference/incidents.md` §AO-285),
then take a worker slot with `forge slots --acquire --run <runId> --anchor
<anchorPid> --ticket <ticket>` (the global, per-host
`concurrency.maxLiveWorkers` cap — see "Concurrency"). A denied reservation
or a "no free slot" both drop that ticket from this wave; it does not get
dispatched. **Never call the claims/slots mutex inline via `bun -e`** — an
untypechecked snippet with its positional arguments in the wrong order is
exactly how a real run lost its reservation silently and ended up with no
mutex at all (see `reference/incidents.md`). Always go through the `forge`
CLI. If dispatch is aborted after some slots were already acquired (e.g. a
later ticket in the same batch fails its freshness re-check), release them
with `forge slots --release --run <runId>` before ending the phase —
otherwise those slots stay occupied until the wave's own
`forge cleanup --run <runId>` at close-out.

For each ticket in the batch, get its worktree lock reason *before* the
`Agent` call and put it in that worker's prompt:

```
forge lock-reason --run <runId> --ticket <ticket>
```

Never assemble that string yourself — it's the same AO-285 shape as calling
the claims/slots functions through an inline `bun -e` snippet
(`reference/incidents.md`), and it carries a `slug=` field only a command
running in *your* cwd can get right. `forge lock-reason` honors this repo's
`worktree.lockReason` override if it has one, and refuses to emit a reason
this CLI's own parser can't read back.

Launch up to `concurrency.waveSize` `Agent` calls in parallel (single
message, multiple tool uses), each with `isolation: "worktree"` **and
`model: "sonnet"`** (pinned explicitly — don't rely on whatever model this
session happens to be on).

**Immediately after that batch returns, before any worker has had a chance to
commit, run `forge preflight --post-dispatch`** — the fourth enforcement
gate on a dispatch. It hard-fails on:
two worktrees claiming the same ticket, two worker branches with the same
ticket number, a worktree still unlocked 30s+ after dispatch, or a
worktree's branch not matching its own lock's ticket (see
`reference/incidents.md` for the real runs that exposed each of these). Fix
whatever it flags before proceeding to Phase 7 — don't let a bad dispatch run
unattended for a whole wave.

Keep the dispatch prompt itself small — **the full spec and every sibling
ticket's full body do not get pasted in**. Give each worker: the full body of
its own ticket, a ≤15-line summary of the spec (goal, constraints, what this
wave is for), and the bare list of sibling ticket IDs under this spec — not
their contents. The worker reads a sibling's ticket/comments itself only if
it actually needs to (step 3 of Phase 7 below), instead of every worker's
context paying for every ticket's full text whether it's relevant or not.
Build the actual prompt from `worker-prompt.md`'s template — it already
encodes what never to touch, the worktree bootstrap steps and branch/commit
convention, the handoff-note contract, and the locate-before-`Read`
discipline as a mandatory, numbered instruction (a prior wave's four workers
all fell back to `grep` + full `Read` and blew past the context-budget
targets above when this was left as a "prefer grep" aside instead of a named
command — see `reference/incidents.md`).

Do **not** instruct workers to use `LSP` — verified across 97 subagent
transcripts, `LSP` never reaches a worker regardless of `subagent_type` or
`isolation: "worktree"`: it's a tool wired into the *main* session only, and
`ToolSearch("select:LSP")` returns "No matching deferred tools found" from
inside every worker, every time (see `reference/incidents.md`). A worker
that needs a real `findReferences` can `SendMessage` the coordinator, which
does have `LSP`.

Include, too: **a worker never dispatches agents of its own** — no `Agent`
calls, no forks, not even for a quick read-only lookup. Phase 7 step 6's
`code-review`-nesting prohibition below is the specific incident this came
from (`reference/incidents.md`), but the rule itself is general, not
code-review-specific.

The coordinator's own forks (a quick read-only lookup, a parallel scoped
question) need the same discipline the coordinator already applies to
workers: give a fork an explicit, narrow scope in its prompt, and never let
it `SendMessage` a worker directly — a fork left free to improvise has
already acted as an uninstructed second coordinator and sent a worker
contradictory directives mid-wave. Treat a fork that runs past ~2 minutes on
what should be a fast, read-only task as hung, not merely slow — `TaskStop`
it rather than waiting it out. Don't block on `ListAgents` to check on a
fork's status, either: it has disappeared mid-session before ("No such tool
available") while `TaskStop`/`SendMessage` kept working. The fallback is
`TaskStop`'s own error text, which lists the background agents it knows
about — not a retry loop on `ListAgents`.

## Phase 7 — Per-worker implementation

Inside each worktree, in order:

1. If `.forge/handoff-<own ticket>.md` already exists in this worktree (a
   resumed session picking its own prior work back up), read it first and
   enumerate its `dead-ends:` in your first message before touching anything
   else — that's the contract, and it's checkable directly from the
   transcript. Otherwise: first `git worktree lock "$(git rev-parse
   --show-toplevel)" --reason '<the reason the dispatch prompt gave you>'`
   — before anything else, and using that exact string rather than a
   regenerated one (the coordinator produced it with `forge lock-reason` in
   Phase 6; a worker regenerating it stamps its own worktree's slug, which
   is the one value it cannot get right). Then bootstrap per
   `docs/agents/forge.md` — **use the silent/quiet flags it specifies** —
   then `git checkout -b <branchPrefix>-<n>-<slug>` (`ticket.branchPrefix`
   from `forge.config.json`) using the ticket's own id and a slug from its
   title.
   This branch is local-only and never pushed — the coordinator merges it
   locally into the wave's integration branch in Phase 8 — so its name exists
   purely for local debugging traceability ("which worker produced this
   commit"), not for any tracker automation: a tracker's own PR-linked
   automation can only match a *pushed* branch, and this one never reaches
   the remote.
2. Mark your own ticket started, per this repo's tracker (`onStart` in
   `forge.config.json`'s `tracker.transitions` is always `worker` — see
   `reference/tracker-<kind>.md` for the literal call) — first write, before
   touching any code, and the **only** state write you ever make. No git
   automation can infer this moment in this design (see
   `docs/agents/forge.md`). Never write any other transition — not
   in-review, not done, not on this ticket and not on a sibling's — even if
   you're confident the work is finished; whichever of `onPrOpen`/
   `onPrMerge` this repo's tracker marks `automatic` happens on its own once
   the wave's PR exists (see Phase 8), and a worker moving its own ticket
   further pre-empts a review that hasn't happened yet.
3. Do not call `ToolSearch("select:LSP")` — `LSP` is not available inside a
   worker (verified: it's wired only into the coordinator's session; see
   `reference/incidents.md`). Read the
   ticket. Read a sibling's ticket/comments only if you actually need to
   align with a decision it made — the dispatch prompt gave you IDs, not
   bodies, on purpose (see Phase 6). Use `rg -n '<symbol>'` (or `sg run -p
   '<pattern>' -l` for a structural question) instead of a full `Read`
   whenever the question is "where is this used"/"what does this export";
   never `Read` a file over ~400 lines whole — locate first, then `Read`
   with `offset`/`limit`. Never `Read` a raw log, an RSC/flight payload, or a
   full `error-context.md` (use `limit: 30` — the useful lines are first) —
   `grep`/`grep -o` for the specific thing being hunted instead.
4. Implement with the `tdd` skill at the seams the spec/ticket already
   named, reaching for `diagnosing-bugs` if something gets stuck.
5. Write/update `.forge/handoff-<own ticket>.md` at its three fixed
   triggers — first green test, each closed dead-end, before each E2E run
   (`forge handoff --check` enforces the exact format and budget; run it
   in step 6 below). This is continuous, not a step you do once at the end.
6. Self-check with whatever fast, worktree-safe, non-agentic checks
   `docs/agents/forge.md` names for this repo (`commands.selfCheck` in
   `forge.config.json`), **plus `forge handoff --check
   .forge/handoff-<own ticket>.md`** — run them yourself, don't invoke the
   `code-review` skill here. You're already a subagent; `code-review`
   dispatches subagents of its own, and nesting them this way is exactly
   what caused two workers to hang mid-review in the run that prompted this
   rule (`reference/incidents.md`). The coordinator runs `code-review` once,
   in Phase 8, over the whole wave's integration branch, where there's no
   nesting and the full diff is visible at once.
7. Comment real decisions on your own ticket as you make them — sync your
   handoff note to a tracker comment at first-green and again now.
8. Commit(s) using this repo's normal commit convention, with the ticket
   trailer (`commit.trailer`/`commit.trailerPosition`, `forge.config.json`)
   as the last line of the body (never the first token — see
   `docs/agents/forge.md` for why).
9. **Always report** — success, failure, or blocked — never end silently.
   A worker that dies without reporting leaves the whole wave stuck.

A worker never runs the repo's end-to-end test suite if `docs/agents/
forge.md`/`commands.fullSuite.singleton` marks it a shared/singleton
resource — that runs once per wave, in Phase 8, over the merged result. When
a worker does run its own scoped E2E, use whatever quiet,
stop-on-first-failure invocation `docs/agents/forge.md`'s
"Shared/singleton resources" names — nothing extra to pass.

## Phase 8 — Wave close-out

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

Run `code-review` here, once, over the full integration branch — this is
the review Phase 7 deliberately deferred. It fans out its own
`angle-*`-style finder sub-agents; while waiting on that fan-out, poll
`forge usage --stalled` (default `usage.stalledMinutes`) every few minutes
instead of just watching for the completion notification — a roster that
goes silent gives no notification of its own, and this repo has seen an
8-finder roster hang for ~1h45m with transcripts that stopped growing
entirely (`reference/incidents.md`). If `--stalled` reports the roster hung,
`TaskStop` every one of those tasks and retry `code-review` at `--level
medium` (smaller fan-out) or, if it hangs again, run the review in a single
pass with no fan-out at all rather than retrying the same shape a third
time. Then run this repo's full test suite exactly once over the merged
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
touches but doesn't finish). Wait for CI, merge, then run
`forge cleanup --run <runId>` to delete this wave's local branches
(`worktree-agent-*` residue and fully-merged worker branches), prune
worktrees, and release this run's ticket reservations and worker slots —
always pass `--run <runId>` here, not the bare command, or those
reservations and slots outlive the wave and stay occupied until someone
else's `forge claims --prune`/manual cleanup reclaims them. Don't leave any
of this for the next wave or the final report to discover.

If anything was flagged (a ticket failed twice, produced a
needs-a-human-decision, or a conflict got resolved by judgment rather than
mechanically): leave the PR open instead of merging, skip `forge cleanup`
for this wave's still-live branches, and say so plainly in the final report
— don't merge on the user's behalf.

## Phase 9 — Wave close and hand off

Retry a single failed ticket once within its own wave, still in this
session — this is closing out the wave that just ran, not starting the next
one. On a second failure, apply the appropriate label (`needs-info` if it
needs more context, the human-decision label if it needs a decision an
agent shouldn't make — see `docs/agents/triage-labels.md`) and let the rest
of that wave proceed.

Recompute the frontier (some tickets may have just unblocked now that this
wave's tickets are done).

**If the frontier is empty** — no further wave is possible — stop and
produce the **final report, always, exactly once**: every wave's PR link,
what shipped, what got flagged and why, and what's still waiting on a human
decision. This is the terminal case regardless of which mode started this
session (default, `--draft`+`--dispatch`, or a chained `--dispatch`).

**If the frontier is non-empty, do not loop back to Phase 6 in this same
session.** Waves chain across sessions, not within one — each session pays
its fixed startup cost once and carries one wave's worth of growing context,
instead of one session accumulating every wave in the run (see
`docs/agents/forge.md`'s "Concurrency" section for the reasoning). Instead:

1. Report this wave's outcome (PR link, what shipped, what got flagged) —
   the same content a mid-run status update would carry, just written down
   instead of only said.
2. Print, verbatim, the command for the next wave: `/forge --dispatch
   <spec-id>` (the same spec issue this whole run has been using as parent).
3. End the session here. A human runs that command — in this terminal or a
   fresh one — to continue. This mirrors exactly the `--draft`/`--dispatch`
   split already described in "Modes": nothing about wave computation depends
   on which session created the spec or dispatched any prior wave, since the
   frontier is always recomputed fresh from the tracker.

There is currently no automated version of step 3 (spawning the next session
itself without a human pasting the command) — that's a deliberate, separate
step, gated on proving this manual handoff works across real runs first.

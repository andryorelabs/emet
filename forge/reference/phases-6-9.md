# Phases 6–9 — dispatch through wave close and hand off

Loaded in every mode. Also load `worker-prompt.md` and `tracker-<kind>.md`
(`<kind>` from `forge.config.json`'s `tracker.kind`) before Phase 6
dispatches anything, and `reviewer-prompt.md` before Phase 8's review.

## Phase 6 — Dispatch

In `--dispatch` mode, this phase's parent is the `<spec-id>` passed to the
command — there's no freshly created spec issue from this run's own Phase 5
to use instead (see "Modes" in the main command file). In every other mode,
it's the spec issue Phase 5 just created.

Name the run `forge<spec-id>w<wave><HHMMSS>` (e.g. `forge20w2042651`) —
`forge status --spec` reads the spec and wave back out of that shape.

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
The worker-slot capacity gate is relaxed on purpose: it only hard-fails at
**zero** free slots host-wide; anywhere from 1 slot up to a full free wave
prints a warning ("only N/`waveSize` free") and still lets dispatch proceed —
`acquireSlot` is per-worker, so a partially-full pool already just drops the
tickets it can't seat from this wave rather than blocking the ones it can.

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
<anchorPid> --ticket <ticket>` (the `concurrency.maxLiveWorkers` cap — a
single pool shared **host-wide**, by every coordinator on this machine across
every repo, not just this one; see "Concurrency"). A denied reservation, a
"no free slot", or a denial from the memory-headroom brake (distinct message —
this host is low on `MemAvailable`, not merely out of slots) all drop that
ticket from this wave; it does not get dispatched. **Never call the claims/slots mutex inline via `bun -e`** — an
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
`subagent_type: "forge-worker"`** — that agent definition (`~/.claude/agents/
forge-worker.md`, installed by `install.sh`) pins its own model and effort,
so don't also pass a per-call `model`: a per-call `model` overrides the
agent's frontmatter, and pinning it in two places invites them drifting
apart. If `forge doctor`'s global findings flag `forge-agents` as missing,
fix that (`./install.sh`) before dispatching — a missing agent definition
makes this call fail outright.

**Immediately after that batch returns, before any worker has had a chance to
commit, run `forge preflight --run <runId> --post-dispatch`** — always pass
`--run`, not the bare flag: it's how this audit attributes agent worktrees to
*this* wave instead of a sibling coordinator's. It hard-fails on:
two worktrees claiming the same ticket, two worker branches with the same
ticket number, a worktree still unlocked 30s+ after dispatch, a worktree's
branch not matching its own lock's ticket, or fewer of this run's own
worktrees found than slots this run is holding (see `reference/incidents.md`
for the real runs that exposed each of these — the last one is what closes the
gap where `Agent({isolation: "worktree"})` nests every agent worktree under
the **main checkout's** `.claude/worktrees/`, never the launching worktree's
own, when dispatched from a non-main worktree such as an Orca one). Fix
whatever it flags before proceeding to Phase 7 — don't let a bad dispatch run
unattended for a whole wave.

Keep the dispatch prompt itself small — **the full spec and every sibling
ticket's full body do not get pasted in**. Give each worker: the full body of
its own ticket (including its `Covers: S…` line), the spec issue's ID with an
instruction to read its `## Specs` section from the tracker (the verbatim
`S1..Sn` requirements — there is no summary placeholder to fill), and the bare
list of sibling ticket IDs under this spec — not their contents. The worker reads a sibling's ticket/comments itself only if
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

If this coordinator's own turn needs to end while background work (a
worker, a fork, a backgrounded `Bash` task) is still in flight, never give
`ScheduleWakeup`'s `prompt` a slash command — `/forge --dispatch <spec-id>`
resumed this way arrives as a fresh `<command-message>` turn, indistinguishable
from a human re-typing it, which risks restarting the whole run from Phase 0
instead of resuming the in-progress wave (a real run measured exactly this).
Use a short resume note instead (e.g. "resume wave close-out for run
`<runId>`") — one that tells the next turn what state it's picking back up,
not one that re-invokes the command that started it.

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
4. Before writing any code, load every skill listed in the ticket's
   `## Project skills` section with the `Skill` tool; if one isn't available,
   `Read` `.claude/skills/<name>/SKILL.md` in your worktree instead. Follow
   them alongside `tdd`; where a project skill conflicts with the ticket's
   own hand-off, the ticket wins — note the conflict in a ticket comment.
   Implement with the `tdd` skill at the seams the spec/ticket already
   named, reaching for `diagnosing-bugs` if something gets stuck.
5. Write/update `.forge/handoff-<own ticket>.md` at its three fixed
   triggers — first green test, each closed dead-end, before each E2E run
   (`forge handoff --check` enforces the exact format and budget; run it
   in step 6 below). This is continuous, not a step you do once at the end.
6. Self-check with whatever fast, worktree-safe, non-agentic checks
   `docs/agents/forge.md` names for this repo (`commands.selfCheck` in
   `forge.config.json`), **plus `forge handoff --check
   .forge/handoff-<own ticket>.md`** — run them yourself, don't invoke the
   review of your own. You're already a subagent; a review dispatched from
   inside a subagent is exactly what caused two workers to hang mid-review
   in the run that prompted this rule (`reference/incidents.md`). The
   coordinator reviews once, in Phase 8, over the whole wave's integration
   branch, where there's no nesting and the full diff is visible at once.
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
Phase 7 deliberately deferred. Dispatch a single `Agent({subagent_type:
"forge-reviewer"})` call built from `reference/reviewer-prompt.md`'s
template — fill its `{{project_skills}}` placeholder with the union of every
wave ticket's `## Project skills` entries (`none` if all tickets said
`none`) — a fresh-context, single-pass review, never a fan-out: nesting
sub-agents inside a subagent's own review is what caused two workers to hang
mid-review in the run that originally motivated a fan-out here
(`reference/incidents.md`), and a fan-out's own roster has separately hung
for ~1h45m in this repo. Apply whatever the reviewer flags as a blocker
before proceeding; a should-fix finding is the coordinator's judgment call,
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
   Fix it on the integration branch from that report, run the affected fast
   checks locally, push, and go back to step 3. After `pr.maxCiFixAttempts` failed fix
   attempts, stop: leave the PR open, apply the human-decision label
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
Whenever this session ends a wave — frontier empty or not — right after
posting its report, run `forge guard --mark-final-report <this coordinator
session id>`; without that marker the `Stop` hook blocks one stop while the
run still holds slots or claims.

**If the frontier is non-empty, do not loop back to Phase 6 in this same
session.** Waves chain across sessions, not within one — each session pays
its fixed startup cost once and carries one wave's worth of growing context,
instead of one session accumulating every wave in the run (see
`docs/agents/forge.md`'s "Concurrency" section for the reasoning). Instead:

1. Report this wave's outcome (PR link, what shipped, what got flagged) —
   the same content a mid-run status update would carry, just written down
   instead of only said.
2. Hand off to the next wave. If `handoff.autoChain` is `true` **and** this
   wave's PR actually merged **and** nothing was flagged (the next wave
   builds on the merged trunk, so an open or flagged PR always means a human
   step), launch it yourself:
   - Run `forge launch <spec-id> --wave <n+1>` from the repo root, as its
     own Bash call. It refuses when a live `forge-<spec-id>-*` session
     already exists, runs `claude --bg --name forge-<spec-id>-w<n+1>
     --permission-mode <handoff.permissionMode> "/forge --dispatch
     <spec-id>"`, confirms the session appears in `claude agents --json`,
     and — per `handoff.launcher` — opens an Orca tab running `claude attach
     forge-<spec-id>-w<n+1>`. It prints one JSON line:
     `{ name, id, attach, orcaTab: { opened, reason } }`.
   - The permission mode comes from the config (default
     `bypassPermissions`), **not** from this session: in `auto` mode the
     classifier can deny a step like `gh pr merge` mid-wave and leave the
     wave half-finished. `permissions.deny` rules and the `forge guard`
     hook still apply in bypass. If Claude Code refuses the launch in that
     mode (the bypass warning was never accepted interactively), relaunch
     by hand with this session's own mode and say so in the report.
   - Put `name` and `attach` in this wave's report, plus `orcaTab.reason`
     when `orcaTab.opened` is `false`. A failed tab never stops the chain:
     the wave already runs in the background, so report the `claude attach`
     command. If `forge launch` itself exits non-zero, fall through to the
     manual path below and report why.
   - `launcher: auto` detects Orca by asking its runtime (`orca status`),
     not `$TERM_PROGRAM`: a `claude --bg` session has no `TERM_PROGRAM`, so
     an env check would never fire on a chained launch.

   The same command covers a launch the user asks for by hand ("run the
   wave in another session", including wave 1 of a `--draft` spec): use
   `forge launch <spec-id> --wave <n>`, never a bare `claude --bg`, which
   skips the Orca tab and the duplicate-session check.

   Otherwise (`autoChain` is `false`, or the PR is open or flagged), print,
   verbatim, the command for the next wave: `/forge --dispatch <spec-id>`
   (the same spec issue this whole run has been using as parent).
3. End the session here. When it was not auto-chained, a human runs that
   command — in this terminal or a fresh one — to continue. This mirrors
   exactly the `--draft`/`--dispatch` split already described in "Modes":
   nothing about wave computation depends on which session created the spec
   or dispatched any prior wave, since the frontier is always recomputed
   fresh from the tracker.

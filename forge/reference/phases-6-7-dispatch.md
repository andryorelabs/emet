# Phases 6–7 — dispatch and per-worker implementation

Loaded in every mode. Also load `worker-prompt.md` and `tracker-<kind>.md`
(`<kind>` from `forge.config.json`'s `tracker.kind`) before Phase 6
dispatches anything. Continues in `phases-8-closeout.md` (wave close-out,
plus `reviewer-prompt.md`) and `phases-9-handoff.md` (wave close and hand off).

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

Before any claim or slot, check the wave's surfaces: write
`{"<ticket>": ["<glob>", ...]}` from each ticket's `## Allowed edit surfaces`
and run `forge surfaces --check <file | ->`. Exit 1 lists overlapping tickets;
narrow the globs or serialize one into a later wave (add a blocking edge)
before dispatching. Exit 2 is a malformed input — fix it.

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
so don't also pass a per-call `model` by default: a per-call `model`
overrides the agent's frontmatter, and pinning it in two places invites them
drifting apart. The one exception is a ticket carrying a `Model:` line
(Phase 3): pass that value as the `Agent` `model` parameter for that worker
only (the model part; an effort part, as in `opus/high`, applies only where
the dispatch supports an effort override). If `forge doctor`'s global findings flag `forge-agents` as missing,
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
Once per run, run `commands.selfCheck` on trunk (before any worker exists)
and pass each failure to every worker as a `## Known environmental failures`
section (`none` if clean), so workers neither chase nor mistake them for
their own regressions.
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

Next: Phase 8 is in `phases-8-closeout.md`.

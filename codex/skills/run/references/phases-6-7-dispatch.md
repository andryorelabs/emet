# Phases 6–7 — dispatch and per-worker implementation

Loaded in every mode. Also load `worker-prompt.md` and `tracker-<kind>.md`
(`<kind>` from `emet.config.json`'s `tracker.kind`) before Phase 6
dispatches anything. Continues in `phases-8-closeout.md` (wave close-out,
plus `reviewer-prompt.md`) and `phases-9-handoff.md` (wave close and hand off).

## Phase 6 — Dispatch

In `--dispatch` mode, this phase's parent is the `<spec-id>` passed to the
command — there's no freshly created spec issue from this run's own Phase 5
to use instead (see "Modes" in the main command file). In every other mode,
it's the spec issue Phase 5 just created.

Name the run `emet<spec-id>w<wave><HHMMSS>` (e.g. `emet20w2042651`) —
`emet status --spec` reads the spec and wave back out of that shape.

Run `git fetch <remote> <trunk>` first (`repo.remote`, `repo.trunk`; skip in
merge mode), so the trunk reference reflects landed Phase 5 edits. Then run
`emet preflight --approval spec<spec-id>` — cheap local git/filesystem hygiene (this
repo's configured `preflight.requiredFiles` and `preflight.requiredCommands`,
leftover `worktree-agent-*` branches, a dirty `.emet/worktrees/` from a run
that didn't clean up after itself, any remaining `TODO(emet):` marker in
`docs/agents/`) plus a third-party dependency gate keyed off `tracker.kind`
(the mattpocock-skills plugin always, `gh` for a `github` tracker, the Linear
MCP server for a `linear` tracker), and it fails when HEAD is not
`<remote>/<trunk>` (local `<trunk>` in `landing.mode: merge`) or a descendant of
it, naming the current branch and the fix command. It also fails while
Phase 5's `GLOSSARY.md`/`docs/adr/` edits differ from trunk, so Phase 6
refuses to dispatch until they are landed.
Fix whatever it flags before dispatching;
don't dispatch into a dirty or half-initialized repo. A failure here means a
real, verified gap — an environment quirk it merely couldn't check (e.g. no
network to validate `gh auth`) shows as a non-blocking warning instead.
The worker-slot capacity gate is relaxed on purpose: it only hard-fails at
**zero** free slots host-wide; anywhere from 1 slot up to a full free wave
prints a warning ("only N/`waveSize` free") and still lets dispatch proceed —
`acquireSlot` is per-worker, so a partially-full pool already just drops the
tickets it can't seat from this wave rather than blocking the ones it can.

Compute this wave's frontier against this repo's tracker
(`references/tracker-<kind>.md` for the literal calls) —
candidates are unassigned, in the tracker's "todo"
state, carrying the ready-for-dispatch triage label, under this spec, with no
open blocker. Sort by priority descending (`tracker.github.priorityLabels`,
or the tracker's native priority field), then `createdAt` ascending.

Before any claim or slot, check the wave's surfaces: write
`{"<ticket>": ["<glob>", ...]}` from each ticket's `## Allowed edit surfaces`
and run `emet surfaces --check <file | ->`. Exit 1 lists overlapping tickets;
narrow the globs or serialize one into a later wave (add a blocking edge)
before dispatching. Exit 2 is a malformed input — fix it.

Immediately before each survivor's `emet dispatch` call, reserve it with
`emet claims --reserve <ticket> --run <runId> --anchor <anchorPid> --surfaces
<glob>[,<glob>...]`, passing the ticket's `## Allowed edit surfaces` (the
real dispatch mutex — see `references/incidents.md` §INC-285;
it also denies surfaces that overlap a live or idle claim of another run),
then take a worker slot with `emet slots --acquire --run <runId> --anchor
<anchorPid> --ticket <ticket>` (the `concurrency.maxLiveWorkers` cap — a
single pool shared **host-wide**, by every coordinator on this machine across
every repo, not just this one; see "Concurrency"). A denied reservation, a
"no free slot", or a denial from the memory-headroom brake (distinct message —
this host is low on `MemAvailable`, not merely out of slots) all drop that
ticket from this wave; it does not get dispatched. **Never call the claims/slots mutex inline via `bun -e`** — an
untypechecked snippet with its positional arguments in the wrong order is
exactly how a real run lost its reservation silently and ended up with no
mutex at all (see `references/incidents.md`). Always go through the `emet`
CLI. If dispatch is aborted after some slots were already acquired (e.g. a
later ticket in the same batch fails its freshness re-check), release them
with `emet slots --release --run <runId>` before ending the phase —
otherwise those slots stay occupied until the wave's own
`emet cleanup --run <runId>` at close-out.

For each ticket in the batch, get its worktree lock reason _before_ the
`emet dispatch` call and put it in that worker's prompt:

```
emet lock-reason --run <runId> --ticket <ticket>
```

Never assemble that string yourself — it's the same INC-285 shape as calling
the claims/slots functions through an inline `bun -e` snippet
(`references/incidents.md`), and it carries a `slug=` field only a command
running in _your_ cwd can get right. `emet lock-reason` honors this repo's
`worktree.lockReason` override if it has one, and refuses to emit a reason
this CLI's own parser can't read back.

For each ticket, after its claim, slot and dispatch record exist, write the filled worker prompt to a file and start the worker with `emet dispatch --role worker --run <runId> --ticket <ticket> --prompt-file <file> [--model <model>] [--effort <effort>]`; start up to `concurrency.waveSize` of them in parallel, each as its own background shell command. The model is `resolveWorkerModel(config, <ticket's Model: line>)`: the ticket's `Model:` wins, else the `codex` section's worker model; pass it as `--model` (and `--effort` where the ticket sets one), otherwise `emet dispatch` resolves it itself. `emet dispatch` creates the worktree, locks it, builds the run's Codex home and starts the worker. Collect each result with `emet dispatch --wait --run <runId> --ticket <ticket> [--timeout <seconds>]`, which prints the recorded result status.

Just before each `emet dispatch` call, write the dispatch record
`.emet/runs/<runId>/dispatch/<ticket>.json` = `{"baseline": "<trunk sha>",
"surfaces": [<the ticket's globs>]}` (that sha, `git rev-parse
<remote>/<trunk>` — or local `<trunk>` when `landing.mode` is `merge` — and
never the caller's HEAD, is also the prompt's `{{expected_base}}`), and mark the ticket started yourself (`onStart`, see
`references/tracker-<kind>.md`): workers never write the tracker. A worker
that exits 42 failed its branch/base check; re-dispatch from the current trunk.

**Immediately after that batch returns, before any worker has had a chance to
commit, run `emet preflight --run <runId> --post-dispatch`** — always pass
`--run`, not the bare flag: it's how this audit attributes agent worktrees to
_this_ wave instead of a sibling coordinator's. It hard-fails on:
two worktrees claiming the same ticket, two worker branches with the same
ticket number, a worktree still unlocked 30s+ after dispatch, a worktree's
branch not matching its own lock's ticket, or fewer of this run's own
worktrees found than slots this run is holding (see `references/incidents.md`
for the real runs that exposed each of these — the last one is what closes the
gap where `emet dispatch` nests every agent worktree under
the **main checkout's** `.emet/worktrees/`, never the launching worktree's
own, when dispatched from a non-main worktree such as an Orca one). Fix
whatever it flags before proceeding to Phase 7 — don't let a bad dispatch run
unattended for a whole wave.

Keep the dispatch prompt small — **the full spec and sibling ticket bodies do
not get pasted in**. Give each worker: its own ticket body (with `Covers:`
and `## Interfaces`), the spec ID with an instruction to read only its
`## Specs` section, the spec's `## Global Constraints` verbatim, the
`emet map --for <its surface globs>` sections (`emet map --stale` exiting 1
means run `emet map --refresh` first), and the bare sibling IDs.
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
command — see `references/incidents.md`).

Do **not** instruct workers to use `LSP`: it is not available to a Codex worker. A worker that needs a real `findReferences` states the question in its handoff note and the coordinator answers it.

Include, too: **a worker never dispatches agents of its own** — no spawned agents, no forks, not even for a quick read-only lookup. Phase 7 step 6's
`code-review`-nesting prohibition below is the specific incident this came
from (`references/incidents.md`), but the rule itself is general, not
code-review-specific.

The coordinator spawns no agents either: it runs quick read-only lookups itself in the shell, and treats a worker whose JSONL has stopped growing as stalled (`emet usage --stalled`).

If this coordinator's own turn needs to end while background work (a worker process, a backgrounded shell task) is still in flight, resume with `emet dispatch --wait` for the same run, never by re-invoking `$emet:run` from Phase 0.

## Phase 7 — Per-worker implementation

Inside each worktree, in order:

1. If `.emet/handoff-<own ticket>.md` already exists in this worktree (a
   resumed session picking its own prior work back up), read it first and
   enumerate its `dead-ends:` in your first message before touching anything
   else — that's the contract, and it's checkable directly from the
   transcript. Otherwise: first `git worktree lock "$(git rev-parse
   --show-toplevel)" --reason '<the reason the dispatch prompt gave you>'`
   — before anything else, and using that exact string rather than a
   regenerated one (the coordinator produced it with `emet lock-reason` in
   Phase 6; a worker regenerating it stamps its own worktree's slug, which
   is the one value it cannot get right). Then bootstrap per
   `docs/agents/emet.md` — **use the silent/quiet flags it specifies** —
   then `git checkout -b <branchPrefix>-<n>-<slug>` (`ticket.branchPrefix`
   from `emet.config.json`) using the ticket's own id and a slug from its
   title.
   This branch is local-only and never pushed — the coordinator merges it
   locally into the wave's integration branch in Phase 8 — so its name exists
   purely for local debugging traceability ("which worker produced this
   commit"), not for any tracker automation: a tracker's own PR-linked
   automation can only match a _pushed_ branch, and this one never reaches
   the remote.
2. Run the branch/base check from `worker-prompt.md` (exit 42, no
   self-repair). You never write the tracker: the coordinator marks `onStart`
   at dispatch and posts your decisions from the handoff note and results.
3. Do not look for an LSP tool — `LSP` is not available inside a
   worker (verified: it's wired only into the coordinator's session; see
   `references/incidents.md`). Read the
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
   `## Project skills` section by invoking it as a skill; if one isn't available,
   `Read` `.claude/skills/<name>/SKILL.md` in your worktree instead. Follow
   them alongside `tdd`; where a project skill conflicts with the ticket's
   own hand-off, the ticket wins — note the conflict in a ticket comment.
   Implement with the `tdd` skill at the seams the spec/ticket already
   named, reaching for `diagnosing-bugs` if something gets stuck.
5. Write/update `.emet/handoff-<own ticket>.md` at its three fixed
   triggers — first green test, each closed dead-end, before each E2E run
   (`emet handoff --check` enforces the exact format and budget; run it
   in step 6 below). This is continuous, not a step you do once at the end.
6. Self-check with whatever fast, worktree-safe, non-agentic checks
   `docs/agents/emet.md` names for this repo (`commands.selfCheck` in
   `emet.config.json`), **plus `emet handoff --check
   .emet/handoff-<own ticket>.md`** — run them yourself, don't invoke the
   review of your own. You're already a worker; a review dispatched from
   inside a subagent is exactly what caused two workers to hang mid-review
   in the run that prompted this rule (`references/incidents.md`). The
   coordinator reviews once, in Phase 8, over the whole wave's integration
   branch, where there's no nesting and the full diff is visible at once.
7. Record real decisions in the handoff note as you make them.
8. Commit(s) using this repo's normal commit convention, with the ticket
   trailer (`commit.trailer`/`commit.trailerPosition`, `emet.config.json`)
   as the last line of the body (never the first token — see
   `docs/agents/emet.md` for why).
9. **Always report**, never silently: full report to a file, recorded with
   `emet results --run <runId> --write <ticket> --status
   <DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT> --report <path> --risk
   "<Risk: …>"`; the final message is at most 15 lines and ends with the
   `Risk:` line (`none` only after checking shared-code callers).

A worker never runs the repo's end-to-end test suite if `docs/agents/
emet.md`/`commands.fullSuite.singleton` marks it a shared/singleton
resource — that runs once per wave, in Phase 8, over the merged result. When
a worker does run its own scoped E2E, use whatever quiet,
stop-on-first-failure invocation `docs/agents/emet.md`'s
"Shared/singleton resources" names — nothing extra to pass.

Next: Phase 8 is in `phases-8-closeout.md`.

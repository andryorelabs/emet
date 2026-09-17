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

The extraction of this machinery into a standalone CLI briefly made AO-321
structurally guaranteed rather than merely possible: the audit and the
parser came along, but the `git worktree lock` command itself did not —
it lived only as a `{{bootstrap_steps}}` placeholder each target repo was
expected to fill in by hand. `forge lock-reason` (Phase 6) and bootstrap
step 0 of `reference/worker-prompt.md` close that: the coordinator asks the
CLI for the reason, the worker runs one literal command with it, and the CLI
refuses to emit a reason its own parser can't read back.

## Agent worktrees nesting under the main checkout, not the launching worktree

`isOwnAgentWorktree`'s original design assumed `Agent({isolation:
"worktree"})` always nests a dispatched agent's worktree inside the
*launching* worktree's own `.claude/worktrees/`. Three separate runs
(coordinators in `~/orca/workspaces/andryore-dev/{urchin,tern,hake}`, each a
non-main git worktree of the same repo) measured the opposite: every agent
worktree landed under the **main checkout's** `.claude/worktrees/` instead,
regardless of which worktree dispatched it. The path-prefix filter then
matched zero entries, and `forge preflight --post-dispatch` printed
`0 worktree(s) checked ... OK` — a vacuous pass, not a real one — silently
turning off all four of its enforcement gates for every Orca-launched wave.

The fix could not simply be "match the main checkout's path instead": the
prefix filter existed in the first place to stop one coordinator's audit
failing on a *sibling* coordinator's own legitimate, mid-bootstrap agent
worktree — and once every coordinator's agents nest under the same main
checkout, a path-based filter can no longer tell those two cases apart at
all. Ownership had to move from **where** a worktree lives to **which run**
it belongs to: `isAgentWorktree` now matches any `.claude/worktrees/` entry
(repo-scoped by construction, since `git worktree list` only ever lists this
repo's own worktrees), and `resolveWorktreeOwner`'s `run=` field — already
parsed out of the lock reason for other purposes — attributes each one. A new
check closes the vacuous-pass hole for good: post-dispatch compares how many
worktrees got attributed to this run against how many slots this run is
holding, and hard-fails a mismatch instead of ever printing "0 checked, OK"
again.

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

## A confabulated success with zero tool calls behind it

A worker/fork reported finishing its assigned work — a confident, specific
summary of what it had done — while its transcript showed zero tool calls and
its worktree had no commit at all. Nothing in that report distinguished it
from a real one by reading the summary alone; only checking `git -C
<worktree> log`/`status` exposed it. This is why Phase 8 treats "reported
done" and "actually done" as separate facts to verify, never one implied by
the other: a worker or fork that reports success with no commit in its
worktree did not do the work, no matter how confident the report reads.

## A background E2E run killed for "low memory" with 50+ GiB free

A background `Bash` E2E suite was killed by the harness's own low-memory
guard while the host had 50+ GiB of `MemAvailable` free and no OOM kill in
`dmesg` — the guard's signal didn't correspond to the host's actual memory
state. This is a harness reliability gap, not something a repo's own config
can fix directly, but it's why `resources.ts`'s memory-headroom brake reads
`MemAvailable` itself (via `/proc/meminfo`) rather than trusting any
higher-level "low memory" signal, and why every one of its thresholds
(`FORGE_MEM_RESERVE_GIB`, `FORGE_MEM_PER_WORKER_GIB`) is an env override a
real run can tune against what it actually observes on a given host.

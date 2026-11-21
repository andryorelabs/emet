# emet

emet is the `/emet:run` command for Claude Code (`$emet:run` on Codex CLI) plus the `emet` CLI that turns a feature request into a spec, tickets, and parallel worktree agents that implement, test and merge it unattended.

## Language

**Spec**:
The requirements document for one feature, with numbered requirements (S1..Sn), written before any ticket exists.
_Avoid_: PRD, design doc

**Ticket**:
One unit of work derived from a spec, with a `Covers:` line, interfaces, allowed edit surfaces and a context budget.
_Avoid_: task, story, card

**Wave**:
One dependency layer of tickets dispatched together; it lands on its own, or is merged into the **Spec branch** and lands with the whole **Spec**.
_Avoid_: batch, sprint, iteration

**Frontier**:
The set of tickets whose dependencies are all done, so they can be dispatched now.
_Avoid_: queue, backlog, ready list

**Tracker**:
Where specs and tickets live: GitHub Issues, Linear, or local markdown files under `.scratch/`.
_Avoid_: board, backlog

**Landing**:
How work reaches trunk: a PR, or a local merge with no PR. The unit is one **Wave** (`landing.unit: wave`) or the whole **Spec** through its **Spec branch** (`spec`, the default).
_Avoid_: ship, deploy, release

**Website**:
The public site at emet.andryore.dev: the home page and the docs, in every locale.
_Avoid_: landing, landing page (**Landing** is how a wave reaches trunk)

**Coordinator**:
The single session that runs the phases, dispatches workers, merges their branches and is the only writer of the tracker.
_Avoid_: orchestrator, manager, lead

**Worker**:
An agent in its own worktree that implements exactly one ticket and reports through its handoff and result.
_Avoid_: implementer, subagent, builder

**Reviewer**:
An agent that checks a wave's integrated result against the spec.
_Avoid_: QA, verifier

**Worktree**:
A git worktree holding one worker's isolated checkout on its own local branch. A worktree no run can be attributed to is a _foreign worktree_: emet never blocks on it and never removes it.
_Avoid_: clone, sandbox, workspace

**Integration branch**:
The branch where the coordinator merges a wave's worker branches before the wave lands or is merged into the **Spec branch**.
_Avoid_: staging branch, release branch

**Unowned worktree**:
A worker **Worktree** whose lock and **Claim** no longer name a **Run**; it is reclaimable once its ticket is **Landed** and its tree is clean.
_Avoid_: orphan worktree, stale worktree

**Claim**:
The recorded reservation of a ticket by one run, preventing a second worker from taking it.
_Avoid_: lock, assignment

**Spec branch**:
The local branch `spec/<id>` where each **Integrated** wave is merged `--no-ff`; the next wave forks from its tip and the whole branch lands once after the last wave.
_Avoid_: feature branch, release branch

**Integrated**:
Of a ticket: its wave was merged into the **Spec branch** but not yet into trunk; it counts as a closed blocker for the **Frontier** and is not **Landed**.
_Avoid_: done, merged

**Landed**:
Of a ticket: its wave was merged into trunk, as the tracker reports it.
_Avoid_: done, shipped

**Closed run**:
A run whose wave landed and was cleaned up; it counts as finished even while its session stays open.
_Avoid_: dead run, finished session

**Slot**:
One unit of the host-wide capacity pool, held only while a worker is live.
_Avoid_: seat, thread, permit

**Gate**:
An automated check that decides whether a worker's or wave's result may proceed, merge or chain.
_Avoid_: checkpoint, approval

**Hold**:
A **Gate** decision to leave a wave's pull request open because something emet can resolve on its own is missing: findings it can fix, or a check still running.
_Avoid_: pause, block

**Stop**:
A **Gate** decision that a person must rule before the run goes on.
_Avoid_: fail, abort

**Review round**:
One pass of a **Reviewer** over a wave's **Integration branch**.
_Avoid_: review cycle

**Fix round**:
One pass in which the **Coordinator** corrects the findings still open and a **Reviewer** rechecks only those findings. It has its own budget, apart from **Review rounds**.
_Avoid_: retry, rework

**Environment fault**:
A failure caused by the machine or the CI provider rather than the code under review: checks that never started, no runner available, a billing block or a provider outage.
_Avoid_: infra failure, flaky CI

**Flake**:
A check that fails and then passes on a rerun with no change to the code.
_Avoid_: intermittent failure

**Chain**:
To start a run's next **Wave** in a new session once the **Gate** allows it.
_Avoid_: handoff, relaunch

**Journal**:
The global append-only file in which emet records what it decides and does on a host, so a later report can tell launched runs from typed ones.
_Avoid_: log, audit trail, telemetry

**Baseline**:
The journal event that marks the start of a clean history; reports count only what comes after the latest one.
_Avoid_: reset, checkpoint

**After-spec step**:
What a repo does once a spec's last wave has landed: a **Release**, a **Promote**, or nothing.
_Avoid_: post-merge, cleanup

**Promote**:
Merging `develop` into `main` with a merge commit and no version tag, so a deployed application ships.
_Avoid_: deploy, publish

**Release**:
A deliberate `develop` to `main` merge-commit pull request that carries a version tag.
_Avoid_: publish, ship (a **Landing** is how a wave reaches trunk)

**After-spec rule**:
One entry of the after-spec setting that picks the **After-spec step** from the paths a **Promote** would carry; the entry without paths is the fallback.
_Avoid_: filter, route

**Deploy check**:
The command that confirms a deploy reached production after the branch that deploys was merged.
_Avoid_: health check, smoke test

**Surface**:
A glob of files a ticket is allowed to edit, enforced by the edit guard.
_Avoid_: scope, allowlist

**Mailbox**:
The per-run record of a worker's questions to its coordinator and the coordinator's replies; the escalation channel for workers whose **Agent host** has no live messaging.
_Avoid_: chat, inbox

**Context budget**:
The estimate in a ticket of how much a worker must read and write, used as a tripwire against oversized tickets.
_Avoid_: token limit, size estimate

**Handoff**:
The continuously updated note a worker keeps so the coordinator can continue or report its work.
_Avoid_: status update, summary

**Run**:
One execution of `/emet` for a spec, identified by a run id shared by its claims, slots, locks and results.
_Avoid_: session, job, pipeline

**Agent host**:
The coding-agent product a run executes in: Claude Code or Codex CLI. One adapter per host holds everything specific to it.
_Avoid_: harness, platform, client

**Legacy name**:
A pre-rename name (`forge.config.json`, `docs/agents/forge.md`, `.forge/`, `FORGE_*`, `TODO(forge):`, the `forge` lock token) that emet still reads, with one warning, until `emet migrate` renames it.
_Avoid_: deprecated name, old name

**Mascot**:
The pixel character of the optional `emet-mascot` plugin, shown beside the transcript, above the Claude Code prompt, or as a status line, and mirroring the session and the run phase.
_Avoid_: avatar

**Phase file**:
The `.emet/phase.json` record the CLI writes as a run advances, which the mascot polls to label the current phase.
_Avoid_: status file, progress file

## Relationships

- A **Spec** yields many **Tickets**; each **Ticket** covers one or more numbered requirements of its **Spec**.
- A **Wave** is the **Frontier** at one moment; its **Tickets** run in parallel, one **Worker** each.
- A **Worker** holds one **Claim**, one **Slot** and one **Worktree** while live.
- The **Coordinator** merges **Worker** branches into the **Integration branch**; a **Reviewer** and the **Gates** check it before it lands.
- The **Gate** answers a wave with merge, **Hold**, **Chain**, **Stop** or defer; a **Hold** over findings leads to a **Fix round**, and a **Hold** over an **Environment fault** never spends a fix attempt.
- When a spec's last wave has landed, the **After-spec step** is a **Release**, a **Promote** or nothing, chosen per repository; the **Journal** records each step, and a **Baseline** marks where its clean history starts.
- An **After-spec rule** is chosen by the paths a **Promote** would carry; a **Deploy check** runs only after a merge into the branch that deploys.
- A **Worker** may edit only its ticket's **Surfaces** and must keep its **Handoff** current.
- A **Claim** carries its ticket's **Surfaces**; two live **Claims** of different **Runs** never have overlapping **Surfaces**.
- Everything above belongs to one **Run**, which executes in one **Agent host**.

## Flagged ambiguities

- "Lock" means both the git worktree lock carrying a run's reason and a claim; the lock is the mechanism, the **Claim** is the concept.
- **Handoff** is a worker's note, and the `handoff` command and the part of the config named `handoff` that sets its length are about that note. Starting the next wave is **Chain**: the config keys `autoChain` and `launcher` live in the `handoff` section only for historical reasons.
- "Task" is not a **Ticket**: avoid it, since agent tooling uses it for unrelated work items.
- "Session" is one conversation in an **Agent host**, not a **Run**; a run can span several sessions.

# claude-forge

claude-forge is the global `/forge` command for Claude Code plus the `forge` CLI that turns a feature request into a spec, tickets, and parallel worktree agents that implement, test and merge it unattended.

## Language

**Spec**:
The requirements document for one feature, with numbered requirements (S1..Sn), written before any ticket exists.
_Avoid_: PRD, design doc

**Ticket**:
One unit of work derived from a spec, with a `Covers:` line, interfaces, allowed edit surfaces and a context budget.
_Avoid_: task, story, card

**Wave**:
One dependency layer of tickets dispatched together and landed as one PR.
_Avoid_: batch, sprint, iteration

**Frontier**:
The set of tickets whose dependencies are all merged, so they can be dispatched now.
_Avoid_: queue, backlog, ready list

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
A git worktree holding one worker's isolated checkout on its own local branch.
_Avoid_: clone, sandbox, workspace

**Integration branch**:
The branch where the coordinator merges a wave's worker branches before the wave's PR.
_Avoid_: staging branch, release branch

**Claim**:
The recorded reservation of a ticket by one run, preventing a second worker from taking it.
_Avoid_: lock, assignment

**Slot**:
One unit of the host-wide capacity pool, held only while a worker is live.
_Avoid_: seat, thread, permit

**Gate**:
An automated check that decides whether a worker's or wave's result may proceed, merge or chain.
_Avoid_: checkpoint, approval

**Surface**:
A glob of files a ticket is allowed to edit, enforced by the edit guard.
_Avoid_: scope, allowlist

**Context budget**:
The estimate in a ticket of how much a worker must read and write, used as a tripwire against oversized tickets.
_Avoid_: token limit, size estimate

**Handoff**:
The continuously updated note a worker keeps so the coordinator can continue or report its work.
_Avoid_: status update, summary

**Run**:
One execution of `/forge` for a spec, identified by a run id shared by its claims, slots, locks and results.
_Avoid_: session, job, pipeline

## Relationships

- A **Spec** yields many **Tickets**; each **Ticket** covers one or more numbered requirements of its **Spec**.
- A **Wave** is the **Frontier** at one moment; its **Tickets** run in parallel, one **Worker** each.
- A **Worker** holds one **Claim**, one **Slot** and one **Worktree** while live.
- The **Coordinator** merges **Worker** branches into the **Integration branch**; a **Reviewer** and the **Gates** check it before the PR.
- A **Worker** may edit only its ticket's **Surfaces** and must keep its **Handoff** current.
- Everything above belongs to one **Run**.

## Flagged ambiguities

- "Lock" means both the git worktree lock carrying a run's reason and a claim; the lock is the mechanism, the **Claim** is the concept.
- "Task" is not a **Ticket**: avoid it, since agent tooling uses it for unrelated work items.
- "Session" is a Claude Code conversation, not a **Run**; a run can span several sessions.

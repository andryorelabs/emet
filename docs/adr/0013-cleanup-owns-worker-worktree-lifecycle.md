# 0013. Cleanup owns the worker worktree lifecycle

Status: Accepted (2026-11-04)
Spec: #150 (S1-S9)

## Context

Nothing ever removes a worker's worktree: the harness only auto-removes worktrees without changes, and workers commit. It also drops the forge worktree lock when a worker exits, and `forge cleanup` identifies owners only by that lock. So `forge cleanup --run <runId>` classifies every worker branch as in use or out of scope and deletes nothing, claims leak, and coordinators fall back to the repo-wide `--all` sweep.

Preflight then fails on residue. Orca worktrees of one repo share a git-common-dir, so a coordinator sees the worktrees of every sibling run, plus its own non-worker worktrees under `.claude/worktrees/`. A squash-merged branch also decays to `conflicted` once trunk moves on, and a run whose wave finished still counts as live while its session is open. Approval artifacts live in one checkout's `.forge/`, so another worktree needs a manual copy.

## Decision

- **Owner resolution** is one rule everywhere: the forge lock, then the claim matching the branch's ticket. A non-forge lock means no owner. `forge cleanup` uses the same resolver as `forge preflight`.
- **Landed** is decided by the tracker first (GitHub: issue closed as completed; local: status done) and by git content only when the tracker answers unknown. A tracker read error is unknown, never landed. The verdict only reads the tracker, so [ADR-0005](0005-coordinator-is-the-single-tracker-writer.md) holds.
- **`forge cleanup --run <runId>`** removes each owned worktree whose ticket landed and whose tree is clean, with `git worktree remove` and never `--force`. It then deletes the worker and `worktree-agent-*` branches, releases the claim and the run's slots, and writes `<git-common-dir>/.forge/runs/<runId>/closed.json` when the sweep had no failures. A dirty or unlanded worktree is kept and reported with the command to run by hand.
- **A closed run** counts as finished for every reclaim rule even while its session is open.
- **Bare `forge cleanup`** reclaims owned worktrees of closed or dead runs whose work landed. It never touches live or idle runs or foreign worktrees. `--all` keeps its repo-wide meaning, and `--run` and `--all` stay mutually exclusive.
- **A foreign worktree** has no forge lock, no matching claim, and a branch that is neither `<branchPrefix>-*` nor `worktree-agent-*`. Preflight reports it as info and cleanup never touches it.
- **Run artifacts** that cross sessions or worktrees (`approval.json`, `tickets.json`, `materialize.json`, `closed.json`) live under `<git-common-dir>/.forge/runs/<id>/`, read there first and then from the legacy `<repoRoot>/.forge/runs/<id>/`. Results, verify and gate records stay where they are.
- **Dispatch base.** Phase 5 lands its deferred `GLOSSARY.md` and `docs/adr/` edits on trunk before Phase 6 starts, and `forge preflight` fails when HEAD is not trunk or a descendant of it. Workers therefore always branch from a trunk that contains the records their tickets cite.
- **Prompt wording exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to the cleanup paragraphs of `forge/reference/phases-8-closeout.md`, nor to the Phase 5 and Phase 6 paragraphs of `forge/reference/phases-1-5.md` and `forge/reference/phases-6-7-dispatch.md` that describe the dispatch base. They must be reworded so the prompts match the CLI.

## Consequences

- The next wave's preflight starts clean without manual `git worktree remove`.
- Two coordinators in different Orca worktrees no longer block each other on foreign or finished worktrees.
- Cleanup now reads the tracker, so a missing or unauthenticated `gh` degrades to the git-content fallback instead of removing anything.
- The no-`git worktree remove`-by-hand rule stays: removal goes through `forge cleanup`.

## Alternatives considered

- **The coordinator removes worktrees in phase 8 with a new command**: rejected because `forge cleanup` already classifies what is safe to delete, and a second removal path would duplicate that logic.
- **Keep deciding landed from git content only**: rejected because a squash-merged branch becomes `conflicted` once trunk moves on, which makes old branches permanent blockers.
- **Make preflight ignore every `.claude/worktrees/` entry it cannot attribute**: rejected because an unowned `cla-*` branch with unmerged work must still fail preflight.

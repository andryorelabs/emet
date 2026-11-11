# 0025. Cleanup deletes branches whose pull request merged

Status: Accepted (2026-11-11)
Spec: #464

## Context

[ADR-0013](0013-cleanup-owns-worker-worktree-lifecycle.md) made `emet cleanup` the owner of worker worktrees and decided "landed" by the tracker, then by git content. That leaves every branch that names no ticket outside cleanup: the wave's integration branch, release branches and fix branches. Such a branch has no tracker verdict, a squash merge makes it look `conflicted` once trunk moves on, and its worktree counts as foreign. The guard denies a forced branch delete in Bash, so each wave and each release ended with the agent asking the user to delete the branches by hand.

## Decision

- **Evidence.** A local branch is deletable when GitHub holds a merged pull request whose head branch has the same name and whose head commit is the local tip. That exact commit was merged, so the branch holds nothing else, however far trunk has moved.
- **Scope.** `emet cleanup` runs this sweep in every mode (bare, `--run`, `--all`), after its own reclaim. It skips trunk, the remote's default branch, the branch of the main worktree and the branch checked out where the command runs. Worker and scaffold branches stay with the ADR-0013 reclaim, which decides them by ticket.
- **Worktrees.** A branch checked out in a worktree goes only with that worktree, and only when the worktree sits under the Agent host's worktree directory, is unlocked and is clean. It is removed with `git worktree remove`, never `--force`. Any other checked-out branch is kept and reported. This amends ADR-0013's rule that cleanup never touches a foreign worktree.
- **Unknown is not merged.** A missing, offline or unauthenticated `gh`, or output it cannot parse, deletes nothing.
- **Merge landing.** With `landing.mode: merge` there are no pull requests, so the sweep does nothing.
- **Guard.** The guard still denies a forced branch delete in Bash. Its message now names `emet cleanup` as the way to delete merged branches.

## Consequences

- No manual branch deletion after a wave or a release; `emet cleanup --dry-run` shows what would go and the pull request that justifies it.
- Cleanup makes one `gh pr list` call per candidate branch, so it is slower in repos with many local branches.
- A branch with one extra local commit after the merge is kept, because its tip no longer matches the pull request.
- The branch checked out where cleanup runs is kept until cleanup runs from another worktree.

## Alternatives considered

- **Delete every branch that is an ancestor of trunk**: rejected because a branch just created from trunk, with no commits yet, is an ancestor and would be deleted.
- **Allow the forced branch delete in the guard for merged branches**: rejected because the guard reads only command text and cannot verify a merge.
- **Decide by squash-commit content against trunk**: rejected because it decays once trunk touches the same lines, the failure ADR-0013 already records.

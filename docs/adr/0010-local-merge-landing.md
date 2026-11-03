# 0010. Local merge landing

Status: Accepted (2026-11-03)
Spec: #106 (S13)

Amends [0004](0004-one-wave-one-dependency-layer-one-pr.md).

## Context

ADR-0004 fixes a wave as one dependency layer that lands as one PR. A repo with no remote, or one driven by the local tracker, has no PR to open: `gh` may be absent and there is no CI to wait on. Tying landing to the PR forced every repo through a forge host.

## Decision

A wave is still exactly one dependency layer, and it is one landing unit. The landing unit is a PR when `landing.mode` is `pr` (the default) and a local merge when it is `merge`. `landing.mode` is independent of `tracker.kind`.

In merge mode `forge land` merges the wave's integration branch into local trunk per `pr.mergeMethod`, never pushes, and refuses unless the main worktree is on `repo.trunk` with a clean working tree. `commands.selfCheck` on the integration branch replaces CI, and `pr.autoMerge` off or a flagged wave leaves the branch unmerged. Landed checks compare against local trunk and skip `git fetch`.

## Consequences

- Repos without a remote or `gh` can run `/forge` end to end.
- Behaviour with `landing.mode` `pr` is unchanged.
- A bad layer still reverts as a unit: one squash commit on trunk.
- Merge mode has no remote review; `selfCheck` and the reviewer agents are the only gates.

## Alternatives considered

- **Push and open a PR against a local bare remote**: rejected because it adds setup and still needs `gh` or a forge host.
- **Fast-forward each worker branch onto trunk**: rejected because it leaves intermediate states on trunk, which ADR-0004 rejects.
- **Tie merge landing to the local tracker**: rejected because a GitHub-tracked repo may also want local landing.

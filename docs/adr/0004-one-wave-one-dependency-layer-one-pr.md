# 0004. One wave = one dependency layer = one PR

Status: Accepted (2026-11-03). Amended by [0010](0010-local-merge-landing.md): the landing unit is a PR or a local merge.
Spec: #73

## Context

`/forge` dispatches tickets in waves. Tickets in a spec depend on each other, and workers in one wave run in parallel worktrees that cannot see each other's changes. A wave that mixed dependency layers would force a worker to build on code that does not exist yet, and a PR spanning layers is hard to review and to revert.

## Decision

A wave is exactly one dependency layer: the frontier of tickets whose dependencies are all merged. Workers commit to local branches, the coordinator merges them into the wave's integration branch, and that branch lands as one PR. The next wave starts from the result, chained when the previous PR is not yet merged.

## Consequences

- Tickets within a wave must be independent and have disjoint edit surfaces.
- Review happens once per layer on a coherent diff, and a bad layer reverts as a unit.
- Wall-clock time is bounded by the number of layers, not the number of tickets.
- Dependency mistakes in the spec surface early, as a worker blocked on a missing interface.

## Alternatives considered

- **One PR per ticket**: rejected because it multiplies review and CI cost and leaves intermediate states on trunk.
- **One PR for the whole spec**: rejected because the diff is too large to review and a single failure blocks everything.
- **Mixed layers per wave**: rejected because workers in one wave cannot see each other's work.

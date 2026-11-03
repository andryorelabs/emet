# 0005. The coordinator is the single tracker writer

Status: Accepted (2026-11-03)
Spec: #73

## Context

Several workers run concurrently, each against the same issue tracker. Concurrent writes to labels, states and comments race, duplicate each other and make a run impossible to reconstruct. Workers also run unattended, so a stray write cannot be caught by a human.

## Decision

Only the coordinator writes the tracker: state changes, labels and comments. Workers report through a handoff note and a result file recorded with `forge results`, and never touch the tracker, the spec issue or a sibling ticket's thread. The coordinator reads those records and posts decisions on the worker's behalf.

## Consequences

- Tracker history has one author and one ordering per run.
- Workers need no tracker credentials or tracker-specific logic.
- The handoff note and result file are the contract, so they must be complete and kept current.
- The coordinator is a bottleneck for tracker updates, accepted as cheap compared with the races.

## Alternatives considered

- **Workers write their own ticket**: rejected because of races, partial writes and the need for credentials in every worker.
- **Workers write, coordinator reconciles**: rejected because reconciliation is more complex than a single writer.
- **No tracker writes during a run, batch at the end**: rejected because progress would be invisible while a long run is live.

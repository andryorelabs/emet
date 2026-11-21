# 0038. Living specs hold current behaviour

Status: Accepted (2026-11-21)
Spec: #794 (S1, S3, S5, S6)

Amends [0037](0037-landing-per-spec.md): the last wave of a spec gains a step before its review.

## Context

`emet spec-merge` folds requirement deltas into `docs/specs/<area>.md`, but nothing ever wrote the deltas. The prompts ran it after each wave merged, so its output was never committed or reviewed, and it looked for the deltas in the current checkout's run directory, which a linked worktree does not share. A **Spec** lives in the tracker as plan and state, and once its tickets close nothing records what the system now does.

## Decision

The tracker holds plan and state: the **Spec**, its tickets and its waves. `docs/specs/<area>.md` holds current behaviour: one **Living spec** per area.

Living specs are opt-in through `specs.enabled` (default `false`). When it is on, the **Coordinator** writes a **Spec delta** per affected area from the **Spec**'s S# items on the spec's last **Wave**, runs `emet spec-merge` once on that wave's **Integration branch** before its review, and commits the result. With `landing.unit: spec` the commit travels inside `spec/<id>` to the final PR; with `wave` it is part of the last wave's PR. The review and the gates therefore see the living-spec change like any other.

`emet spec-merge` stays free of git: the coordinator commits. It reads deltas from the shared run directory under the git common dir (`emet spec-merge --spec <id> --deltas-dir` prints it), falling back to the per-checkout one. Requirements are named descriptively and carry a `Source: #<spec> S<n>` line, since S# numbers are local to one spec. A conflict is fixed once; if it persists the wave lands without the update and the report flags it.

## Consequences

A repo that opts in gets an always-current, reviewed description of its behaviour at no extra landing. The last wave carries one more coordinator step, in a reference loaded only when enabled. Which area a requirement belongs to, and whether it is added or modified, stays a judgment the coordinator makes by reading the current living spec.

## Alternatives considered

- A CLI that generates deltas mechanically: it cannot know the area or whether a requirement is new or modified.
- Running `spec-merge` inside `emet spec-branch land` through plumbing: the change would skip review.
- Keeping the merge after each wave lands: the status quo, uncommitted and unreviewed.

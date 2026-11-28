# 0037. Landing per spec

Status: Accepted (2026-11-21). Amended by [0038](0038-living-specs-hold-current-behaviour.md): the last wave of a spec gains the living-spec step. Amended (2026-11-21): the merge method of the spec PR is configurable. Amended by [0039](0039-quick-mode-lands-per-wave.md): a **Quick run** lands per wave. Amended (2026-11-28): under `spec`, preflight's Phase 5 records check accepts records that reached the spec branch through `integrate` or `sync`.
Spec: #778 (S12)
Supersedes [0004](0004-one-wave-one-dependency-layer-one-pr.md). Amends [0010](0010-local-merge-landing.md). Amends [0012](0012-develop-development-branch.md). Amends [0013](0013-cleanup-owns-worker-worktree-lifecycle.md). Amends [0025](0025-cleanup-deletes-branches-whose-pull-request-merged.md). Amends [0031](0031-after-spec-step-and-optional-setup.md).
Supersedes [0004](0004-one-wave-one-dependency-layer-one-pr.md). Amends [0010](0010-local-merge-landing.md), [0012](0012-develop-development-branch.md), [0013](0013-cleanup-owns-worker-worktree-lifecycle.md), [0025](0025-cleanup-deletes-branches-whose-pull-request-merged.md) and [0031](0031-after-spec-step-and-optional-setup.md).

## Context

[ADR-0004](0004-one-wave-one-dependency-layer-one-pr.md) lands every **Wave** on its own: one PR and one CI wait per wave. A spec with three waves costs three PRs and three CI runs, and the next wave cannot start until the previous PR merged, so the **Frontier** stalls on CI. The reasons for a wave being one dependency layer still hold; only the landing unit is too small.

## Decision

The **Landing** unit is configurable as `landing.unit`: `spec` (the default) or `wave` (today's behaviour, unchanged).

With `spec`, each wave keeps its **Reviewer**, **Gate** and `commands.selfCheck`, but the coordinator merges its **Integration branch** `--no-ff` into a local **Spec branch** `spec/<id>` instead of landing it. The ticket is then **Integrated**. The next wave forks from the tip of that branch, so the coordinator's checkout stays on `spec/<id>` and workers use `worktree.baseRef: head`. After the last wave the coordinator syncs trunk into the branch (a merge, never a rebase) and lands it once: one PR with a merge commit, or one local merge in `landing.mode: merge`, which never pushes. Each wave stays one merge commit on trunk's history, so one wave can be reverted.

The logic lives in the `emet spec-branch` commands (`ensure`, `integrate`, `status`, `sync`, `land`, `abandon`); prompts only cite them. `.emet/specs/<id>/branch.json` records the integrated waves and tickets, and the trailers `Emet-Wave` and `Emet-Tickets` on each integration commit let `status` rebuild it after a crash. **Integrated** tickets count as closed blockers for the **Frontier** in every tracker; they stay open until the final landing closes them, and **Landed** keeps meaning "on trunk". `emet gate` is unchanged: in a non-final wave `commands.selfCheck` is passed as `--ci`, and only the final landing waits for CI. `spec/<id>` is pushed after each integrated wave by default (`landing.pushSpecBranch`), without opening a PR.

Amendments to earlier decisions:

- [0010](0010-local-merge-landing.md): the local merge applies to the spec branch as the unit, not to each wave.
- [0012](0012-develop-development-branch.md): `develop` stays the trunk; its target is reached once per spec.
- [0013](0013-cleanup-owns-worker-worktree-lifecycle.md): `emet cleanup` reclaims the worker worktrees of **Integrated** tickets before the final landing.
- [0025](0025-cleanup-deletes-branches-whose-pull-request-merged.md): `spec/<id>` is deleted only after the final landing.
- [0031](0031-after-spec-step-and-optional-setup.md): the **After-spec step** runs once the spec branch has landed.

## Consequences

One PR and one CI run per spec; the frontier advances as soon as a wave passes review and `selfCheck`. A defect that only CI catches surfaces at the final landing, after later waves built on it, and a trunk conflict surfaces at the sync, where the coordinator stops. The checkout is bound to one spec at a time; a parallel spec needs another worktree. Disk loss is bounded by the push of `spec/<id>`. With the default `landing.specMergeMethod: merge` the repo must allow merge commits, which `emet doctor` checks. A trunk that allows only squash merges, such as this repo's `develop` ([0012](0012-develop-development-branch.md)), sets `landing.specMergeMethod` to `squash` or `rebase`: the spec then lands as one commit and the per-wave revert is lost. `emet doctor` also reads the trunk ruleset, and `land` waits for the PR's checks to exist and pass before it merges.

## Alternatives considered

- Keep one PR per wave and only speed up CI: the frontier still waits on every PR.
- Stack the wave PRs: each wave would still need its own review and CI, and a rebase after a squash rewrites integrated history.
- Rebase the spec branch onto trunk: it rewrites integrated history and breaks the per-wave revert.
- Squash the spec into one commit: it loses the per-wave revert.

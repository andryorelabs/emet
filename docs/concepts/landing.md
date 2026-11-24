# Landing

How a spec lands, as one pull request by default. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

Here, **Landing** means how finished work reaches trunk. It has nothing to do with the Website's home page.

## One pull request per spec

By default a spec lands as one pull request. Each wave still gets its own review, gate and self-check, but a wave that passes is not landed. The coordinator merges its integration branch with `--no-ff` into a local **Spec branch**, `spec/<id>`, and the wave's tickets become **Integrated**. The next wave forks from the tip of that branch, so later waves build on earlier ones without waiting for CI on a pull request.

After the last wave the coordinator syncs trunk into the spec branch with a merge, never a rebase, and lands it once: one pull request, or one local merge when the landing mode is `merge`, which never pushes. Every wave stays a separate merge commit on trunk's history, so one wave can still be reverted.

An **Integrated** ticket counts as a closed blocker for the **Frontier**, but it stays open until the final landing closes it. **Landed** keeps its plain meaning: on trunk.

## A wave lands alone only on request

With `landing.unit: wave`, every wave lands on its own: one pull request and one CI wait per wave, and the next wave starts only after that pull request merged. A spec with three waves then costs three pull requests. This is the behaviour before [ADR-0037](../adr/0037-landing-per-spec.md), and it stays available.

A **Quick run** always lands per wave, because it has exactly one wave. See [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## Pull request or local merge

Independent of the unit, `landing.mode` picks how work reaches trunk. `pr` opens a pull request and needs `gh`. `merge` merges locally with `emet land` or `emet spec-branch land` and never pushes, with the repository's self-check command standing in for CI. See [ADR-0010](../adr/0010-local-merge-landing.md).

## What to expect

- A defect that only CI catches surfaces at the final landing, after later waves built on it.
- A conflict with trunk surfaces at the sync, where the coordinator stops and lists the paths.
- The checkout is bound to one spec at a time; a second spec in parallel needs another worktree.
- `spec/<id>` is pushed after each integrated wave by default, without opening a pull request, so a lost disk costs at most one wave.
- Merging the spec pull request with a merge commit keeps the per-wave revert. A trunk that allows only squash merges lands the spec as one commit and loses that revert.

For the keys, see [`landing`](../reference/configuration.md#landing). For the commands, see [`emet spec-branch` and `emet land`](../reference/cli.md#planning-review-and-landing). For the decision, see [ADR-0037](../adr/0037-landing-per-spec.md).

# Quick run phases

Read this when `/emet:run --quick` starts. A **Quick run** is one interview round, one folded ticket, one approval, one worker and one landing. It keeps every review and gate. Everything not named here follows the other references.

## Stop before approval

Stop, write nothing, and recommend `/emet:run` without `--quick` when the change touches a screen, or does not fit one ticket (new surface over `sizing.inlineMaxLines`, or a context-budget tripwire fires). Reject `--quick` with `--draft` or `--dispatch`, naming both flags. `--no-promote` is accepted.

## Phases

1. Interview: one `grilling` round. No `domain-modeling`, no canvas, no frontier rounds.
2. Spec: write the `## Specs` section and exactly one ticket marked `folded`, whose `Covers:` lists every S#. Run `emet validate`, then the single plan approval, as in Phase 4.
3. Materialize as in Phase 5, then `emet approve --run spec<spec-id> --spec <file> --tickets <file> --quick`.
4. Dispatch the one worker in a worktree (Phases 6-7).
5. Close out the wave: `emet verify`; when `specs.enabled`, `${CLAUDE_PLUGIN_ROOT}/emet/reference/living-specs.md` before assess; `emet assess --base <trunk> --head <integration branch> --quick`; the reviewer unless the tier is `passive`; `emet gate`.
6. Landing: one wave as one PR, or one local merge when `landing.mode` is `merge`.
7. Run the after-spec step as in `phases-9-handoff.md`. Never run `emet chain`.

## High-risk Stop

`emet assess --quick` exits 1 when the tier is `high` (`"quickRejected": true`). Treat it as a Gate **Stop**: no auto-merge, the PR stays open, and the final report names the high-risk reasons. A person rules; never turn the run into a full run.

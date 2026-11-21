# Phase 8 — landing per spec (`landing.unit: spec`)

Replaces the per-wave landing of `phases-8-landing.md` while `emet.config.json`
has `landing.unit: spec` (the default). With `landing.unit: wave`, ignore this
file. The commands and their exit codes live in the CLI (`emet spec-branch
--help`); this file only says when to call them.

**Setup, once per spec** (Phase 6): `emet spec-branch ensure --spec <spec-id>`
creates `spec/<spec-id>` from trunk and refuses while another spec's branch is
checked out in this checkout. Worker worktrees branch from its tip, so the
harness needs `"worktree": { "baseRef": "head" }`; `emet preflight` fails and
names it otherwise.

**Each wave** ends on the spec branch, not on trunk:

1. Review as `phases-8-review.md` says, with one change: take the base from
   `emet spec-branch status --spec <spec-id>` (`tip`) before integrating, for
   `emet assess --base` and `emet review-package`, so the range holds only this
   wave.
2. Merge the wave's integration branch with `emet spec-branch integrate --spec
   <spec-id> --wave <n> --branch <integration> --tickets <id,…>`. It merges
   with `--no-ff` into `spec/<spec-id>`, records the wave, journals
   `spec.integrate` and pushes the branch when `landing.pushSpecBranch` is on.
   It opens no PR.
3. A non-final wave needs no CI: pass `--ci` to `emet gate` from
   `commands.selfCheck` run on the integration branch (on red, up to
   `pr.maxCiFixAttempts` fix rounds). With `--waves-remaining` above 0 a clean
   wave answers `chain`.
4. Do not close tickets or run `emet spec-merge` for an integrated wave: its
   tickets are integrated, not landed. Run `emet cleanup --run <runId>`; it
   reclaims their worker worktrees and keeps `spec/<spec-id>`.
5. Tickets listed as integrated by `emet spec-branch status` count as closed
   blockers when you compute the next frontier.
6. When trunk has moved, `emet spec-branch sync --spec <spec-id>` merges it into
   the spec branch and never rebases. On a conflict it aborts, leaves the branch
   unchanged and exits non-zero: stop and report the paths it lists.

**Final landing** (the last wave integrated, or `--partial`): run `emet
spec-branch land --spec <spec-id> [--partial]`. It syncs first and refuses on a
conflict.

- `landing.mode: pr`: it pushes `spec/<spec-id>`, opens one PR with one
  `Closes #<n>` line per ticket of every integrated wave and merges it with a
  merge commit, ignoring `pr.mergeMethod`. Write the PR body with the `pr` skill
  as `phases-8-landing.md` says and verify the closing lines the same way.
  Wait for CI once, with `emet ci --pr <n> --wait --rerun-flakes`, and run
  `emet gate <ticket> --ci <state> …` on its result before merging.
- `landing.mode: merge`: it merges `spec/<spec-id>` into local trunk with
  `--no-ff` and never pushes. `commands.selfCheck` on the spec branch stands in
  for CI.

After it lands, run `emet spec-merge --spec <spec-id>`, close the tickets of
every integrated wave as `phases-8-landing.md` says, then `emet cleanup --run
<runId>` as separate calls. `emet cleanup --all` deletes `spec/<spec-id>` only
now.

**Abandoning a spec**: `emet spec-branch abandon --spec <spec-id> --force` tags
the branch `abandoned/spec-<spec-id>`, deletes it and resets a local tracker's
integrated tickets to `ready-for-agent`; for GitHub and Linear it prints them
and you reset each yourself. Never run it without the human's say-so.

Anything flagged (as `phases-8-landing.md` lists) blocks `integrate` for that
wave and the final landing alike: leave the branch as it is and report.

Next: Phase 9 is in `phases-9-handoff.md`.

# Trackers and landing

Where tickets live, how a wave lands and how waves chain. Every key named here is in the [configuration reference](../reference/configuration.md); every subcommand is in the [CLI reference](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Trackers

emet works with Linear, GitHub Issues or local files, set by `tracker.kind`. `gh` is required for the `github` tracker. A Linear MCP server must be declared in `.mcp.json` (or at user scope) for the `linear` tracker; see the [dependencies reference](../reference/dependencies.md).

### Local tracker

With `tracker.kind: "local"`, specs and tickets are markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. The coordinator reads and writes them through `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` sets this up. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Landing

`landing.mode` is `"pr"` (default) or `"merge"`, independent of the tracker. In `merge` mode a wave lands as one local merge into trunk with `emet land`, with `commands.selfCheck` standing in for CI and no push. `gh` is only required when the tracker is `github` or landing is `pr`. See [ADR-0010](../adr/0010-local-merge-landing.md).

`landing.unit` picks what lands as one: `"spec"` (default) lands the whole spec at once, `"wave"` keeps the older rule that each wave lands alone. See [ADR-0037](../adr/0037-landing-per-spec.md), which supersedes [ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md).

### Spec branch

With `landing.unit: "spec"`, the coordinator creates `spec/<id>` from trunk with `emet spec-branch ensure --spec <id>`. After a wave passes review and `commands.selfCheck`, `emet spec-branch integrate` merges the wave branch into `spec/<id>` with `--no-ff` and a commit carrying the trailers `Emet-Wave` and `Emet-Tickets`. A ticket whose branch is in `spec/<id>` is **Integrated**, not **Landed**: it counts as a closed blocker for the next wave's frontier, but the tracker keeps it open until the final landing. Later waves branch from the tip of `spec/<id>`, so no wave waits for CI on a PR.

`emet spec-branch sync` merges trunk into `spec/<id>` and never rebases; on a conflict it aborts, leaves the branch unchanged and exits non-zero. `emet spec-branch land` runs the sync and then lands the branch once. In `pr` mode it pushes `spec/<id>`, opens one PR with one `Closes #N` line per ticket of every integrated wave waits for its checks and merges it with `landing.specMergeMethod` (a merge commit by default, ignoring `pr.mergeMethod`). In `merge` mode it merges `spec/<id>` into local trunk with `--no-ff` and never pushes. `--partial` lands only the waves integrated so far. `emet spec-branch abandon --spec <id> --force` tags the branch `abandoned/spec-<id>`, deletes it and sets the integrated tickets of a local tracker back to `ready-for-agent`.

The spec mode needs `worktree.baseRef: "head"` in the Claude Code settings so worker worktrees start from the spec branch; `emet preflight` and `emet doctor` check it. `emet doctor` also warns when the mode is `pr` and the repository settings or the trunk ruleset do not allow the configured `landing.specMergeMethod`.

### Landing PRs

With `landing.unit: "spec"` the PR is the spec's: one PR for every integrated wave, opened by `emet spec-branch land` after the final wave. With `landing.unit: "wave"`, one wave is one PR. The PR body carries one `Closes #N` line per ticket (the tracker's closing keyword), and the coordinator moves the tickets to in-review when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR then gets the human-decision label). After a merge, `emet tracker close` closes the tickets on a GitHub tracker, and `emet cleanup --run <runId>` frees the wave's branches, ticket claims, and worker slots. It also deletes each local branch whose PR merged at the branch's tip commit, the integration branch included.

After a wave's branches are merged together, `commands.fullSuite` runs once on the integration branch. A red run blocks the PR and `autoChain`. The gate receives the result as `--integration`. In a non-final wave of a spec landing, the coordinator passes `--ci` from `commands.selfCheck`, and only the final landing waits for CI with `emet ci --wait`; the gate then answers `chain` while waves remain.

### Quick run

`/emet:run --quick <request>` is the short path for a small, single-ticket change such as a typo or a one-line fix. Use it when the change touches no screen and fits one ticket: new surface within `sizing.inlineMaxLines` and no context-budget tripwire.

It skips the larger interview and planning: one `grilling` round, no `domain-modeling`, no canvas and no frontier rounds. The spec holds one `folded` ticket that covers every `S#`, and you give one approval. One worker then runs in a worktree, followed by `emet verify`, the living-specs step when `specs.enabled`, `emet assess --quick`, the reviewer unless the tier is `passive`, and `emet gate`. There is no `emet chain`.

A **Quick run** has one **Wave**, so it always lands per wave, as a PR or a local merge, whatever `landing.unit` says: `emet approve --quick` records `mode: "quick"`, and no spec branch is created or expected.

A high-risk diff stops it. `emet assess --quick` exits 1 when the tier is `high`; the Gate treats that as a **Stop**, so nothing is auto-merged, the PR stays open and the final report names the high-risk reasons.

Before approval, the run stops and recommends `/emet:run` without `--quick` when the change touches a screen or does not fit one ticket. `--quick` cannot be combined with `--draft` or `--dispatch`; `--no-promote` is accepted.

### Chaining waves

Later waves run in their own sessions, never in the one that ran wave 1. Two optional `emet.config.json` sections control what happens next (both validated by `emet preflight`):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge` (default `true`): wait for the PR's checks and merge; with no checks, merge at once. A failing check is fixed and pushed, up to `maxCiFixAttempts` times, then the PR is left open for a human. A wave with anything flagged is never auto-merged.
- `handoff.autoChain` (default `false`): after a clean, merged wave with more waves left, launch the next one with `claude --bg` instead of printing `/emet:run --dispatch <spec-id>`. Inspect it with `claude agents` / `claude attach emet-<spec-id>-w<n>`. Requirements on Claude Code:
  1. `claude` on PATH, with `--bg` support.
  2. A trusted workspace. `--bg` runs non-interactively, so the trust dialog never shows; open `claude` interactively in the repo once and accept it.
  3. The bypass warning accepted once in an interactive session (`skipDangerousModePermissionPrompt`), since the next wave runs in `handoff.permissionMode` (below), not in the launching session's mode.

  On the Codex host, the next wave starts as a detached `codex exec` instead (see `handoff.launcher` below), so the requirement is `codex` on PATH at `codex.minVersion` or newer, with `--json` and `--output-schema` on `codex exec`; `emet doctor` checks the flags, not the version number. Claude's trust dialog and bypass warning do not apply. Whether Codex needs a trusted workspace for a detached run is unverified in this repo's docs.

  It launches only when the PR merged and nothing was flagged, and it skips if a `emet-<spec-id>-*` session is already live (`claude agents --json`). If the launch fails, it falls back to printing `/emet:run --dispatch <spec-id>`.

- `handoff.launcher` (default `auto`): also open the wave in an Orca tab running `claude attach`. `auto` asks the Orca runtime (`orca status`), so it works from `claude --bg` sessions too, which have no `TERM_PROGRAM`; `orca` always tries, `bg` never. `launcher` applies to the Claude Code host only; on Codex `emet launch` always behaves as `bg`. The wave runs in the background either way, and a tab that fails to open never stops the chain.

  `emet launch <spec-id> --wave <n>` does the whole launch (duplicate-session check, `claude --bg`, tab) and prints `{ name, id, attach, orcaTab: { opened, reason } }`. Use it, not a bare `claude --bg`, whenever you want a wave in another session by hand.

  On the Codex Agent host, `emet launch` starts a detached `codex exec` running `$emet:run --dispatch <spec-id>` and records its thread id. It opens no Orca tab, and `codex exec resume <id>` continues the session. See the [CLI reference](../reference/cli.md#codex-host) and [Running emet on Codex](codex.md).

- `handoff.permissionMode` (default `bypassPermissions`): Claude Code only; permission mode of the chained session. On the Codex host it is ignored and the chained session uses `codex.sandbox` (default `danger-full-access`; see [Running emet on Codex](codex.md)). Not inherited from the launching session, because `auto` mode's classifier can deny a step such as `gh pr merge` and leave a wave half-finished. Your `permissions.deny` rules still apply, but the bypass warning must have been accepted once interactively (`skipDangerousModePermissionPrompt`).

## Gates, budgets and records

The phases don't decide on their own when a ticket is done, mergeable or worth retrying. They call a CLI command that reads a record on disk and prints the decision. Run records live under `.emet/runs/<run-id>/` and the review ledger under `.emet/review/`, in the main checkout, not in a worker's worktree. Every command prints its usage with `--help`. The table of commands and what each enforces is in [Gates and records](../reference/cli.md#gates-and-records).

**Budgets** (`emet.config.json`, all optional):

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`: how many times a ticket can fail `verify` before the gate answers `defer`. The ticket gets the deferred label and the rest of the wave continues. An environment fault, such as the test command exiting 126/127 or a provider outage, pauses the run without spending an attempt.
- `reviewRounds`: how many review/fix rounds a ticket gets before one escalation to the next model tier. Whatever is still open after that gets a ruling.
- `stallNudgeCap`: how many times a stalled worker gets nudged. The count never resets.

## Living specs, map and metrics

**Living specs.** Opt in with `specs.enabled`. On a spec's last wave, before its review, the coordinator writes the spec's requirement deltas, runs `emet spec-merge --spec <id>` once to merge them into `docs/specs/<area>.md` (`specs.dir`) and commits the result, so it is reviewed and lands in the same PR. It checks every area before writing anything. A conflict, or a requirement that would lose a scenario, exits 1 and leaves every file untouched; the coordinator retries once, then lands without the update and flags it.

**Codebase map.** `emet map` writes a brief of an existing codebase (stack, structure, conventions, testing, hotspots) to `docs/agents/codebase.md` (`map.path`), stamped with the commit SHA it was built from. The same commit always produces the same file. `emet map --stale` exits 1 once HEAD has moved past the stamp, and `emet preflight` warns in that case. `emet map --for <globs>` prints only the sections that match a ticket's edit surfaces. That output is the only part of the map a worker brief includes.

**Metrics.** `emet metrics --run <id>` reports tokens, API-equivalent cost and wall time per ticket, per wave and per run, read from the session transcripts. It also compares the context budget estimated per ticket with what each worker actually used. Its summary goes at the end of the run's final report.

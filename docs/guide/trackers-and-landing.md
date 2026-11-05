# Trackers and landing

Where tickets live, how a wave lands and how waves chain. Every key named here is in the [configuration reference](../reference/configuration.md); every subcommand is in the [CLI reference](../reference/cli.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Trackers

emet works with Linear, GitHub Issues or local files, set by `tracker.kind`. `gh` is required for the `github` tracker. A Linear MCP server must be declared in `.mcp.json` (or at user scope) for the `linear` tracker; see the [dependencies reference](../reference/dependencies.md).

### Local tracker

With `tracker.kind: "local"`, specs and tickets are markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. The coordinator reads and writes them through `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` sets this up. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

## Landing

`landing.mode` is `"pr"` (default) or `"merge"`, independent of the tracker. In `merge` mode a wave lands as one local merge into trunk with `emet land`, with `commands.selfCheck` standing in for CI and no push. `gh` is only required when the tracker is `github` or landing is `pr`. See [ADR-0010](../adr/0010-local-merge-landing.md).

### Landing PRs

One wave is one PR. Its body carries `Closes #N` for each ticket (the tracker's closing keyword), and the coordinator moves the tickets to in-review when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR then gets the human-decision label). After a merge, `emet cleanup --run <runId>` frees the wave's branches, ticket claims, and worker slots.

After a wave's branches are merged together, `commands.fullSuite` runs once on the integration branch. A red run blocks the PR and `autoChain`. The gate receives the result as `--integration`.

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
- `handoff.autoChain` (default `false`): after a clean, merged wave with more waves left, launch the next one with `claude --bg` instead of printing `/emet --dispatch <spec-id>`. Inspect it with `claude agents` / `claude attach emet-<spec-id>-w<n>`. Requirements:
  1. `claude` on PATH, with `--bg` support.
  2. A trusted workspace. `--bg` runs non-interactively, so the trust dialog never shows; open `claude` interactively in the repo once and accept it.
  3. The bypass warning accepted once in an interactive session (`skipDangerousModePermissionPrompt`), since the next wave runs in `handoff.permissionMode` (below), not in the launching session's mode.

  It launches only when the PR merged and nothing was flagged, and it skips if a `emet-<spec-id>-*` session is already live (`claude agents --json`). If the launch fails, it falls back to printing `/emet --dispatch <spec-id>`.

- `handoff.launcher` (default `auto`): also open the wave in an Orca tab running `claude attach`. `auto` asks the Orca runtime (`orca status`), so it works from `claude --bg` sessions too, which have no `TERM_PROGRAM`; `orca` always tries, `bg` never. The wave runs in the background either way, and a tab that fails to open never stops the chain.

  `emet launch <spec-id> --wave <n>` does the whole launch (duplicate-session check, `claude --bg`, tab) and prints `{ name, id, attach, orcaTab: { opened, reason } }`. Use it, not a bare `claude --bg`, whenever you want a wave in another session by hand.

- `handoff.permissionMode` (default `bypassPermissions`): permission mode of the chained session. Not inherited from the launching session, because `auto` mode's classifier can deny a step such as `gh pr merge` and leave a wave half-finished. Your `permissions.deny` rules still apply, but the bypass warning must have been accepted once interactively (`skipDangerousModePermissionPrompt`).

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

**Living specs.** After a wave auto-merges, `emet spec-merge --spec <id>` merges the spec's `ADDED`/`MODIFIED`/`REMOVED` requirement deltas into `docs/specs/<area>.md` (`specs.dir`). It checks every area before writing anything. A conflict, or a requirement that would lose a scenario, exits 1 and leaves every file untouched.

**Codebase map.** `emet map` writes a brief of an existing codebase (stack, structure, conventions, testing, hotspots) to `docs/agents/codebase.md` (`map.path`), stamped with the commit SHA it was built from. The same commit always produces the same file. `emet map --stale` exits 1 once HEAD has moved past the stamp, and `emet preflight` warns in that case. `emet map --for <globs>` prints only the sections that match a ticket's edit surfaces. That output is the only part of the map a worker brief includes.

**Metrics.** `emet metrics --run <id>` reports tokens, API-equivalent cost and wall time per ticket, per wave and per run, read from the session transcripts. It also compares the context budget estimated per ticket with what each worker actually used. Its summary goes at the end of the run's final report.

# Configure the tracker and landing

Choose where tickets live, how a spec lands and whether waves chain. Every key named here is in the [configuration reference](../reference/configuration.md); every subcommand is in the [CLI reference](../reference/cli.md). Terms follow [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

## Prerequisites

- emet installed and a repo with an `emet.config.json`; run `emet init` if it has none.
- For the `github` tracker or `pr` landing: `gh` on `PATH` and authenticated.
- For the `linear` tracker: a Linear MCP server declared in `.mcp.json` (or at user scope). See the [dependencies reference](../reference/dependencies.md).
- To understand what these settings change, read [Landing](../concepts/landing.md) and [Runs, waves and specs](../concepts/runs-waves-specs.md).

## Choose the tracker

:::steps

1. Set `tracker.kind` in `emet.config.json` to `"linear"`, `"github"` or `"local"`.
2. For a local tracker, run `emet init --tracker local`. Specs and tickets are then markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. The coordinator reads and writes them through `emet tracker`. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
3. For the other kinds, confirm the matching prerequisite above.

:::

## Choose how a spec lands

:::steps

1. Set `landing.mode` to `"pr"` (default) or `"merge"`. In `merge` mode a spec lands as one local merge into trunk with `emet land`, `commands.selfCheck` stands in for CI, and nothing is pushed. See [ADR-0010](../adr/0010-local-merge-landing.md).
2. Set `landing.unit` to `"spec"` (default, the whole spec lands as one) or `"wave"` (each wave lands alone). See [ADR-0037](../adr/0037-landing-per-spec.md).
3. With `landing.unit: "spec"`, set `worktree.baseRef: "head"` in the Claude Code settings so worker worktrees start from the `spec/<id>` branch. `emet preflight` and `emet doctor` check it.
4. In `pr` mode, set `landing.specMergeMethod` (a merge commit by default) to a method the repository settings and trunk ruleset allow; `emet doctor` warns when they do not.
5. To control the merge, set `pr.autoMerge` (default `true`), `pr.mergeMethod` and `pr.maxCiFixAttempts`. A wave with anything flagged is never auto-merged.

:::

The spec branch commands (`emet spec-branch ensure`, `integrate`, `sync`, `land`, `abandon`) are driven by the coordinator; their flags are in the [CLI reference](../reference/cli.md).

## Chain waves

Later waves run in their own sessions. Chaining is off by default.

:::steps

1. Set the `handoff` section in `emet.config.json`:

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. On Claude Code, make sure `claude` is on `PATH` with `--bg` support, the workspace is trusted (open `claude` interactively in the repo once and accept it), and the bypass warning was accepted once in an interactive session (`skipDangerousModePermissionPrompt`).
3. On Codex, make sure `codex` is on `PATH` at `codex.minVersion` or newer, with `--json` and `--output-schema` on `codex exec`; the next wave starts as a detached `codex exec`. See [Run emet on Codex](use-codex.md).
4. Set `handoff.launcher` (Claude Code only) to `auto`, `orca` or `bg` to choose whether the wave also opens an Orca tab. `permissionMode` is Claude Code only; on Codex the chained session uses `codex.sandbox`.
5. To start a wave in another session by hand, run `emet launch <spec-id> --wave <n>` rather than a bare `claude --bg`. It prints `{ name, id, attach, orcaTab: { opened, reason } }`.

:::

Chaining launches only when the PR merged and nothing was flagged, skips when an `emet-<spec-id>-*` session is already live, and falls back to printing `/emet:run --dispatch <spec-id>` if the launch fails. Inspect a chained wave with `claude agents` or `claude attach emet-<spec-id>-w<n>`.

## Set budgets and optional features

:::steps

1. Set the `budgets` section if the defaults do not fit:

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` is how many times a ticket can fail `verify` before it is deferred; `reviewRounds` is how many review/fix rounds a ticket gets before one escalation; `stallNudgeCap` is how many times a stalled worker is nudged. See [Review and gates](../concepts/review-and-gates.md).

2. Set `specs.enabled` to keep [living specs](../concepts/living-specs.md) in `docs/specs/` (`specs.dir`).
3. Run `emet map` to write a codebase map to `docs/agents/codebase.md` (`map.path`). `emet map --stale` exits 1 once HEAD has moved past the stamp.
4. Run `emet metrics --run <id>` after a run for tokens, cost and wall time per ticket, wave and run.

:::

For a small single-ticket change, start `/emet:run --quick <request>` instead of the full pipeline; it always lands per wave and stops on a high-risk diff.

## Check

:::steps

1. Run `emet preflight`; it validates the `tracker`, `landing`, `pr`, `handoff` and `budgets` sections and exits 2 on a malformed config.
2. Run `emet doctor .` and confirm no failure names the tracker, `gh`, the Linear MCP server or the landing settings.
3. For a local tracker, run `emet tracker frontier --spec <slug>` and confirm it lists the tickets you expect.

:::

# Configuration reference

Every key in `emet.config.json`, with its default and meaning. The source of truth is [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json). Terms follow [GLOSSARY.md](../../GLOSSARY.md). Back to the [README](../../README.md).

`emet init` writes the file. `emet preflight` and `emet doctor` validate it. A key marked prose-only is read by the `/emet` prompts (the `$emet:*` skills on Codex), not by the CLI. A key marked deprecated is still accepted. The schema also allows a free-text `"//"` key for notes (never read by any tool) and `"version"`, which is always `1`.

## pr

How a wave's PR is merged.

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge` (default `true`): wait for the PR's checks and merge; with no checks, merge at once. A failing check is fixed and pushed, up to `maxCiFixAttempts` times, then the PR is left open for a human. A wave with anything flagged is never auto-merged.
- `mergeMethod` (default `squash`): `squash`, `merge` or `rebase`, passed to `gh pr merge`.
- `maxCiFixAttempts` (default `2`, minimum `0`): how many times the coordinator may try to fix a failing check before leaving the PR open for a human.

## handoff

What happens after a wave closes, and the size limits of a worker's handoff note. Validated by `emet preflight`.

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines` (default `60`): most lines a `.emet/handoff-<ticket>.md` note may have before `emet handoff --check` fails it.
- `maxChars` (default `8000`, about 2k tokens): most characters a handoff note may have.
- `autoChain` (default `false`): after a clean, merged wave with more waves left, launch the next one instead of printing `/emet:run --dispatch <spec-id>` (`$emet:run --dispatch <spec-id>` on Codex). On Claude Code the launch is `claude --bg`; on the Codex host it is a detached `codex exec`, which needs `codex` at `codex.minVersion` or newer. The requirements below are those of Claude Code. Inspect it with `claude agents` or `claude attach emet-<spec-id>-w<n>`. Requirements:
  1. `claude` on PATH, with `--bg` support.
  2. A trusted workspace. `--bg` runs non-interactively, so the trust dialog never shows; open `claude` interactively in the repo once and accept it.
  3. The bypass warning accepted once in an interactive session (`skipDangerousModePermissionPrompt`), since the next wave runs in `handoff.permissionMode`, not in the launching session's mode.

  It launches only when the PR merged and nothing was flagged, and it skips if an `emet-<spec-id>-*` session is already live (`claude agents --json`). If the launch fails, it falls back to printing `/emet:run --dispatch <spec-id>`.

- `launcher` (default `auto`, one of `auto`, `orca`, `bg`): Claude Code only; ignored on the Codex host, where `emet launch` opens no Orca tab. Also open the wave in an Orca tab running `claude attach`. `auto` asks the Orca runtime (`orca status`), so it works from `claude --bg` sessions too, which have no `TERM_PROGRAM`; `orca` always tries; `bg` never. The wave runs in the background either way, and a tab that fails to open never stops the chain. `emet launch <spec-id> --wave <n>` does the whole launch; see [`emet launch`](cli.md#runs-workers-and-slots).
- `permissionMode` (default `bypassPermissions`, one of `bypassPermissions`, `auto`, `acceptEdits`): Claude Code only; ignored on the Codex host, where the chained session uses [`codex.sandbox`](#codex). Permission mode of the chained session. It is not inherited from the launching session, because `auto` mode's classifier can deny a step such as `gh pr merge` and leave a wave half-finished. Your `permissions.deny` rules still apply, but the bypass warning must have been accepted once interactively (`skipDangerousModePermissionPrompt`).

## budgets

All optional.

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts` (default `2`, minimum `1`): how many times a ticket can fail `verify` before the gate answers `defer`. The ticket gets the deferred label and the rest of the wave continues. An environment fault, such as the test command exiting 126/127 or a provider outage, pauses the run without spending an attempt.
- `reviewRounds` (default `2`, minimum `1`): how many review/fix rounds a ticket gets before one escalation to the next model tier. Whatever is still open after that gets a ruling.
- `stallNudgeCap` (default `6`, minimum `1`): how many times a stalled worker gets nudged. The count never resets.

## models

Model and effort per role for the Claude Code host; the Codex host reads [`codex.models`](#codex) instead. Every key is optional; omitting the section keeps worker `sonnet`/`medium` and reviewer `opus`/`medium`. Effort is one of `low`, `medium`, `high`, `xhigh`, `max`.

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model` (default `sonnet`), `worker.effort` (default `medium`): the worker. A ticket's `Model:` line overrides `worker` for that worker only.
- `reviewer.medium` and `reviewer.high` (default `opus`, `medium` each): the reviewer for each risk tier returned by `emet assess`. Raise `reviewer.high.effort` (for example to `high`) for more scrutiny on risky waves.
- `triage` (default `haiku`): the cheap model for CI-log triage and passive-tier review. A failing check is handed to an agent on this model, which returns at most about 2k tokens with `file:line` pointers.
- `escalation` (default `{ "sonnet": "opus" }`): the next model tier per model name, used when a ticket reaches its fix cap.

## agentHost

`agentHost` (default `"claude"`): the Agent host a run executes in, `"claude"` or `"codex"`. See the [Codex guide](../guide/codex.md).

## codex

Read only when `agentHost` is `"codex"`. Every key is optional. Effort is one of `low`, `medium`, `high`, `xhigh`, `max`; `ultra` is never accepted.

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: each is `{ "model", "effort", "fallback" }`. `fallback` lists the slugs tried in order when `model` is missing from the Codex models cache. The defaults are in [Models and effort](../guide/models-and-effort.md).
- `models.session`: `{ "model", "effort", "planEffort", "fallback" }` for the session that runs `$emet:run`. `planEffort` applies until the first approval.
- `effort`: when set, replaces the effort of every role.
- `minVersion` (default `0.167.0`): the oldest `codex` CLI version `emet doctor` accepts.
- `sandbox` (default `danger-full-access`): the sandbox mode passed as `-s` by `emet dispatch`, `emet review-run` and a Codex `emet launch`. `workspace-write` is also accepted but makes `.git` read-only, so workers cannot commit. Whatever the value, `emet guard` denies `git push` on Codex, and the generated overlay `config.toml` holds only the emet marketplace and plugin, trusted tables for the run's own directories, and the resolved model and effort (never your own tables). See the [Codex guide](../guide/codex.md) and [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md).

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths` (default `[]`): extra case-insensitive path substrings that force the `high` review tier in `emet assess`, on top of the built-in set (auth, security, payments, webhooks, CI, the installer, lockfiles, migrations and dangerous sinks such as raw SQL or pipe-to-shell).

## landing

- `mode` (default `pr`): `pr` opens a pull request (requires `gh`). `merge` merges the integration branch into local trunk with `emet land` and never pushes, with `commands.selfCheck` standing in for CI. Independent of the tracker. See [ADR-0010](../adr/0010-local-merge-landing.md).

## tracker

Which issue tracker `/emet` (or `$emet` on Codex) talks to. The CLI reads `kind` to decide which dependency checks apply; the rest documents the adapter the `/emet` command follows (see [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)).

- `kind` (required): `linear`, `github` or `local`. For `local`, see [Local tracker](cli.md#local-tracker) and [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).
- `transitions.onStart`, `transitions.onPrOpen`, `transitions.onPrMerge`: who writes each ticket-state transition: `worker`, `coordinator` or `automatic` (the tracker integration does it, for example Linear's GitHub integration on PR open or merge). The coordinator never writes a transition marked `automatic`.
- `github.priorityLabels`: maps a priority level (`"1"` = P0 highest to `"4"` = P3) to a GitHub label name, for example `{"1":"P0","2":"P1"}`. With none declared, tickets order by `createdAt` ascending and `emet doctor` says so.
- `github.stateLabels`: maps a workflow state (`todo`, `in-progress`, `in-review`) to a GitHub label name, for example `{"todo":"status:todo"}`. `done` and `canceled` are inferred from the issue's closed state and `state_reason`.
- `linear`: Linear-specific settings (team key, workflow-state names). Read only by the model following `docs/agents/issue-tracker.md`, never by the CLI.
- `local.idPrefix` (deprecated): local ticket ids are now `<feature-slug>-<NN>`.
- `readyLabel`, `triageLabels`, `prReference` (deprecated): label and PR-reference templates, for example `Closes #{number}` (github) or `Refs: {id}` (linear).

## preflight

- `requiredFiles` (default none): files `emet preflight` requires at the repo root before a wave dispatches, each `{ "path", "why" }`; `why` shows in the failure message. Empty means the check does not run.
- `requiredCommands` (default none): binaries that must resolve on PATH before dispatch. `emet preflight` fails with exit 1 naming any that do not, and `emet doctor` reports them. This is the repo's own list, separate from the tracker-driven [dependency checks](dependencies.md#what-checks-what); `gh` already has a dedicated check, so listing it is optional. Common additions: `rg` and `sg`.

## specs

- `dir` (default `docs/specs`): repo-relative directory of living specs, written by `emet spec-merge`.

## map

- `path` (default `docs/agents/codebase.md`): repo-relative path of the map `emet map` generates.

## concurrency

- `waveSize` (default `4`, minimum `1`): most Agent calls dispatched together in one wave.
- `maxLiveWorkers` (default `auto`): global cap shared by every `/emet` coordinator running on this host, across every repo. The slot pool lives under `~/.local/state/emet/slots`, not in any one repo. `auto` derives the cap from the host's CPU count and RAM; a positive integer pins it. A separate memory-headroom check (`EMET_MEM_RESERVE_GIB`, default 8 GiB) denies an acquire when available memory is too low, regardless of this cap. The `EMET_MAX_LIVE_WORKERS` environment variable overrides this field and also accepts `auto`.
- `runIdleThresholdMs` (default `5400000`, 90 minutes): how long a run with no live anchor still classifies as idle rather than dead, based on transcript freshness alone. The `EMET_RUN_IDLE_THRESHOLD_MS` environment variable overrides it.

See [Environment variables](cli.md#environment-variables).

## ticket

- `idPattern`: anchored regex source a ticket id must match, for example `^PROJ-\d+$`. An invalid pattern is a hard config error.
- `branchPrefix`: lowercase prefix (`^[a-z0-9-]+$`) for a worker's local branch. Branches are `<branchPrefix>-<number>-<slug>`, and `cleanup` sweeps the glob `<branchPrefix>-*`.
- `idExample` (deprecated, prose-only): one example id matching `idPattern`.
- `branchPattern` (deprecated, prose-only): full branch-name template.

## commands

All prose-only.

- `selfCheck`: commands a worker runs before considering its change done, for example `["npm run check"]`. Under `landing.mode` `merge` it stands in for CI.
- `workerScopedSuite`: command a worker runs to test only the area it touched. `emet verify` requires it to pass.
- `fullSuite.run`: command for the repo-wide suite, run once on the integration branch after a wave's branches merge. A red run blocks the PR and `autoChain`.
- `fullSuite.singleton`: `true` if only one worktree may run the suite at a time.
- `fullSuite.runInBackground`, `fullSuite.reset` (deprecated): background flag and state-reset commands.

## worktree

- `lockReason`: template for the `git worktree lock` reason a worker writes at bootstrap, filled in by `emet lock-reason`. The default is `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`. Override only to add fields: `emet lock-reason` refuses a template that drops the literal `emet` token, any of `run=`, `ticket=`, `anchor=`, `at=`, or `slug=`.
- `copyFromMain` (prose-only): paths copied from the trunk checkout into a fresh worktree before bootstrap, for example untracked env files.
- `bootstrap` (prose-only): shell commands run once in a fresh worktree before a worker starts, for example `["npm ci"]`. Run by `/emet` Phase 6, never by the CLI.
- `stateDir` (deprecated, prose-only): directory for run-local logs, for example `.emet`.

## usage

- `oversizedReadLines` (default `400`, minimum `1`): a Read with no offset or limit against a file over this many lines counts as oversized in `emet usage`.
- `stalledMinutes` (default `10`, minimum `1`): default `--minutes` threshold for `emet usage --stalled`.

## sizing

- `inlineMaxLines` (default `100`, minimum `1`): largest ticket body, in lines, kept inline in a worker prompt.

## schema

Prose-only. This repo's data-schema ownership, used by the Phase 3 conflict-avoidance rule when splitting tickets. Empty or omitted skips the rule.

- `ownedPaths`: paths that define shared schema, for example `["prisma/schema.prisma"]`. At most one worker per wave may touch them.
- `sharedDatabase` (deprecated): `true` if workers share one physical database.

## commit

Prose-only.

- `trailer`: git trailer key a worker appends to commits referencing the ticket, for example `Refs`.
- `trailerPosition`: `body` or `footer`.

## repo

- `trunk`: the branch every worker's changes merge toward, and the base of every cleanup and preflight git comparison, for example `main`.
- `remote` (default `origin`): the git remote `trunk` lives on.
- `integrationBranch` (deprecated, prose-only): optional long-lived branch a wave integrates onto before trunk.
- `commitTypes` (deprecated, prose-only): allowed Conventional Commit types for worker commits.

## design

Optional, prose-only. `null` or omitted skips the design/UI-review step.

- `canvasIndex` (deprecated): path to a design canvas file workers check before UI changes.

# Running emet on Codex

emet can run on Codex CLI as well as Claude Code. Terms follow [GLOSSARY.md](../../GLOSSARY.md); the product a run executes in is the **Agent host**. This page covers installing the Codex side, choosing the host, the single approval and the known limits. Back to the [documentation index](../README.md).

On the Codex host the pipeline is the same: interview, spec, tickets, one approval, parallel workers in worktrees, a review per wave, then landing. What changes is the plumbing. Each worker and each reviewer is its own `codex exec` process started by `emet dispatch` and `emet review-run`, and the slash commands become the `$emet:run`, `$emet:init` and `$emet:doctor` skills. The Claude Code path is untouched.

## Install

1. Install the `codex` CLI at the version in `codex.minVersion` (default `0.167.0`) or newer, and log in.
2. Install the `mattpocock-skills` plugin in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. Install the emet plugin. The repository ships `.codex-plugin/plugin.json` and the generated skills and hooks under `codex/`:

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. Install the `emet` CLI as described in [Getting started](getting-started.md), then run `emet doctor .`. On the Codex host it reports a `codex` older than `codex.minVersion`, a missing `--json` or `--output-schema` flag on `codex exec`, and a missing `mattpocock-skills` with the two commands above.

The two plugin commands in step 3 follow the pattern the spike verified for a local marketplace; their exact spelling for this repository is `unverified` until the first release.

## Choose the Agent host

Set `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

The default is `"claude"`. The `codex` section sets the models, the effort, the minimum version and the sandbox; see the [configuration reference](../reference/configuration.md#codex) and [Models and effort](models-and-effort.md). Start a run from Codex with `$emet:run`. `emet launch <spec> --wave <n>` starts a wave in a detached `codex exec` and records its thread id, so `codex exec resume <id>` continues it; no Orca tab is opened.

## The single approval

emet asks for one approval, after the plan. On Claude Code that is a prompt. On Codex it is a hook:

- Until `.emet/runs/spec<id>/approval.json` exists, `emet guard` denies every mutation (`apply_patch`, `Bash`) except writes under `.emet/runs/**/draft/**`, with the reason `not approved: send approve <id>`. Phases 1 to 4 therefore stay write-free by construction.
- You approve by sending a prompt line that is exactly `approve <id>`. The `UserPromptSubmit` hook then writes the approval file with the same hashing as `emet approve`. The same words in tool output or model text do nothing.
- The alternative is `/plan $emet:run`: approve the plan in Codex's own plan mode instead of the hook.

The gate fails closed: a missing or unreadable approval file keeps mutations denied. The guard also checks every path of an `apply_patch` against the ticket's `.emet/surface.json`.

## How a wave runs

- `emet dispatch --role worker` checks the claim and the slot, creates `.emet/worktrees/agent-<ticket>`, builds a per-run `CODEX_HOME` overlay under `.emet/runs/<run>/codex-home/` that links your auth and config instead of copying them, and starts `codex exec` with the resolved model and effort, the `codex.sandbox` mode (`workspace-write` by default), `--json` and `--output-schema`. Events are captured to `.emet/runs/<run>/codex/<ticket>.jsonl`.
- The overlay's rules allow `git add` and `git commit` and forbid `git push`. Your `~/.codex` is never written.
- `emet review-run` runs the reviewer read-only over a package from `emet review-package`; the `passive` tier starts no process.
- Usage and stall detection read the captured JSONL: token usage from `turn.completed` events, liveness from the `codex` process and the file's modification time.

## Limits and `unverified` points

- Effort `ultra` is never sent and is rejected in configuration.
- `danger-full-access` is available only by setting `codex.sandbox` to it; nothing enables it by default.
- There are no `ScheduleWakeup`, `TaskStop` or `LSP` equivalents. emet polls its own CLI instead.
- Rollout files under `~/.codex/sessions` have no stable format, so emet reads the `exec --json` output it captured itself.
- The research marks these behaviours `unverified`, and each sits behind a small function so a change in Codex touches one place: a per-run `CODEX_HOME` with linked auth, the location of the rules file in the overlay, `--dangerously-bypass-hook-trust`, the `CLAUDE_PLUGIN_ROOT` alias in hook commands, the output format of `codex plugin list`, a model loading a skill by name, and `emet dispatch` inside a nested sandbox. See [the viability research](../research/codex-viability.md).
- A model trying to forge `approval.json` has not been observed. The gate would deny the attempt, but that is `unverified`.
- Running Codex from an unattended supervisor (systemd, a container) after the launching session exits is `unverified`.
- Codex model names and prices change; the price table needs a re-check once real waves have run.

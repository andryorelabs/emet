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

Both plugin commands in step 3 were run against the real `codex` (0.167.0): in a fresh `CODEX_HOME` they exit 0 and `codex plugin list` shows `emet@emet-marketplace installed, enabled`. The local-path form, `codex plugin marketplace add <repo>`, gives the same result.

## Choose the Agent host

Set `agentHost` in `emet.config.json`:

```json
{ "agentHost": "codex" }
```

The default is `"claude"`. The `codex` section sets the models, the effort, the minimum version and the sandbox; see the [configuration reference](../reference/configuration.md#codex) and [Models and effort](models-and-effort.md). Start a run from Codex with `$emet:run`. `emet launch <spec> --wave <n>` starts a wave in a detached `codex exec` and records its thread id, so `codex exec resume <id>` continues it; no Orca tab is opened.

## The single approval

emet asks for one approval, after the plan. On Claude Code that is a prompt. On Codex it is a hook:

- Until `.emet/runs/spec<id>/approval.json` exists, `emet guard` denies every mutation (`apply_patch`, `Bash`) except writes under `.emet/runs/**/draft/**`, with the reason `not approved: send approve <id>`. The gate applies once a `.emet/runs/spec<id>/` directory exists without its `approval.json`, which is the state `/emet:run` leaves after Phase 4 materializes the spec.
- You approve by sending a prompt line that is exactly `approve <id>`. The `UserPromptSubmit` hook then writes the approval file with the same hashing as `emet approve`. The same words in tool output or model text do nothing.
- The alternative is `/plan $emet:run`: approve the plan in Codex's own plan mode instead of the hook.

Once that directory exists, the gate fails closed: a missing or unreadable approval file keeps mutations denied. The guard also checks every path of an `apply_patch` against the ticket's `.emet/surface.json`.

## How a wave runs

- `emet dispatch --role worker` checks the claim and the slot, creates `.emet/worktrees/agent-<ticket>`, builds a per-run `CODEX_HOME` overlay under `.emet/runs/<run>/codex-home/`, and starts `codex exec` with the resolved model and effort, the `codex.sandbox` mode (`danger-full-access` by default), `--json` and `--output-schema`. Events are captured to `.emet/runs/<run>/codex/<ticket>.jsonl`. The worker is identified by the `threadId` of its `thread.started` event and that JSONL path; the process id is only an auxiliary field.
- The overlay is generated, not linked. Your `auth.json` is symlinked (never copied), the emet plugin cache is linked from your Codex home when it exists, and the overlay writes its own minimal `config.toml`: the local marketplace and `[plugins."emet@emet-marketplace"] enabled = true`, a `trusted` `[projects."<dir>"]` table only for the run's own directories, and the resolved `model` and `model_reasoning_effort`. None of your `[projects]` tables or other settings are copied, and your `~/.codex` is never written.
- The overlay's `rules/default.rules` allows `git add`, `git commit`, `git status`, `git worktree`, `git -C <dir> ...` and the `emet` subcommands `dispatch`, `review-run`, `launch`, `claims`, `slots`, `results` and `handoff`, and forbids `git push`. Because the default sandbox no longer blocks writes, `emet guard` also denies any `Bash` command whose argv runs `git push`, including `git -C <dir> push` and `git --git-dir=<dir> push`, whatever the sandbox.
- `emet review-run` runs the reviewer read-only over a package from `emet review-package`; the `passive` tier starts no process.
- Models resolve against `models_cache.json` in the run home, else in your real Codex home (read only). A configured slug that is not listed is substituted and the substitution is logged; if nothing resolves, `emet review-run` fails before the model call, naming the role and the listed slugs.
- Usage and stall detection read the captured JSONL: token usage from `turn.completed` events and liveness from the file growing, so a worker in another pid namespace still reads as live. `emet preflight` and `emet cleanup` share one rule for a reclaimable unowned worktree (worker branch, ticket landed, clean tree, no foreign lock), so preflight only says to run `emet cleanup` when cleanup would act.

## What the real-Codex run showed

The [probe report](../research/codex-probe-report.md) re-ran every check against `codex-cli 0.167.0` (ChatGPT free plan, Linux) after these changes. All earlier `failed` rows are now `verified`:

- A 2-wave flow landed real commits by Codex workers on the trunk: wave 1 from `emet dispatch`, wave 2 from a session started by `emet launch <spec> --wave 2` that loaded `$emet:run` from the overlay's plugin cache. `emet review-run` ran in every flow.
- The opt-in e2e (`EMET_CODEX_E2E=1`) passes: the worker commits under `danger-full-access`, and `codex execpolicy check` answers `forbidden` for `git push origin develop` and `allow` for `git -C <dir> commit`.
- `~/.codex/config.toml` kept the same sha256 across the probe, the e2e and seven flows.

## Limits and `unverified` points

- Effort `ultra` is never sent and is rejected in configuration.
- `danger-full-access` is the default `codex.sandbox` for Codex workers and `emet launch`, because the `workspace-write` sandbox makes `.git` read-only and a worker could not commit. Set `codex.sandbox` to `"workspace-write"` to keep the sandbox; workers then cannot commit. [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) records the trade-off. The Claude path never uses it. With no sandbox, the push denial in `emet guard` and the rules file are the guard rails.
- There are no `ScheduleWakeup`, `TaskStop` or `LSP` equivalents. emet polls its own CLI instead.
- Rollout files under `~/.codex/sessions` have no stable format, so emet reads the `exec --json` output it captured itself.
- Verified against the real CLI, and still behind small functions so a Codex change touches one place: a per-run `CODEX_HOME` with linked auth, the rules file at `rules/default.rules`, `--dangerously-bypass-hook-trust`, the `CLAUDE_PLUGIN_ROOT` alias in hook commands, the output format of `codex plugin list`, a model loading a skill by name, `emet dispatch` inside a nested session, a model trying to forge `approval.json` (denied), and both `codex plugin marketplace add` forms. See [the viability research](../research/codex-viability.md).
- Still `unverified`: running Codex from an unattended supervisor under systemd or in a container (only a detached process was tested).
- Known follow-ups from the probe report: `emet init` writes Claude model names into `models` for `agentHost: "codex"`, an explicit `emet dispatch --model` is not resolved against the cache, `emet lock-reason` looks for a `claude` ancestor, and a ticket whose worker died cannot be re-dispatched into the same worktree.
- Codex model names and prices change; the price table needs a re-check once real waves have run.

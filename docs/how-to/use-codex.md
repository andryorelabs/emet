# Run emet on Codex

Run the emet pipeline on Codex CLI instead of Claude Code. Terms follow [GLOSSARY.md](../../GLOSSARY.md); the product a run executes in is the **Agent host**. Back to the [documentation index](../README.md).

How a wave runs on Codex, the guard and the sandbox trade-offs are explained in [Security](../concepts/security.md) and [Runs, waves and specs](../concepts/runs-waves-specs.md).

## Prerequisites

- The `codex` CLI at the version in `codex.minVersion` (default `0.167.0`) or newer, logged in.
- `git` and `gh` on `PATH`; see the [dependencies reference](../reference/dependencies.md).
- A repo with an `emet.config.json` (run `emet init` if it has none).

## Install

:::steps

1. Install the `mattpocock-skills` plugin in Codex:

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. Install emet with the standalone install from [Install](../start/install.md). It writes the emet skills under `~/.agents/skills/emet/` and appends the emet hooks to `$CODEX_HOME/hooks.json` (default `~/.codex`), and never writes `config.toml`. It also installs the terminal `emet` and the Claude Code commands and agents under `~/.claude`; that is harmless on Codex.

3. Trust the hooks. Codex does not run a hook until you trust it: open `/hooks` and press `t` on the events page, or approve the "Hooks need review" prompt at startup.

:::

### Optional: the Codex plugin

Instead of the standalone install you can install the emet plugin:

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

The plugin brings no `emet` shim, so the terminal `emet` still needs the standalone install. `emet self install` refuses while the plugin is installed unless you pass `--force`, and `emet doctor` warns when both coexist.

## Choose the Agent host

:::steps

1. Set `agentHost` in `emet.config.json` (the default is `"claude"`):

   ```json
   { "agentHost": "codex" }
   ```

2. Set models, effort, minimum version and sandbox in the `codex` section if the defaults do not fit; see the [configuration reference](../reference/configuration.md#codex) and [Choose models](choose-models.md).
3. Start a run from Codex with `$emet:run`. To start a wave from a terminal, run `emet launch <spec> --wave <n>`; it starts a detached `codex exec` and records its thread id, so `codex exec resume <id>` continues it. No Orca tab is opened.

:::

## Approve the plan

emet asks for one approval, after the plan. On Codex it is a hook.

:::steps

1. Wait for `$emet:run` to materialize the spec. Until `.emet/runs/spec<id>/approval.json` exists, `emet guard` denies every mutation with the reason `not approved: send approve <id>`.
2. Send a prompt line that is exactly `approve <id>`. The `UserPromptSubmit` hook writes the approval file. The same words in tool output or model text do nothing.
3. Alternatively, start with `/plan $emet:run` and approve the plan in Codex's own plan mode.

:::

## After an emet update

With the standalone install, the hooks are plain entries in `hooks.json` and stay trusted. With the plugin, Codex asks you to trust the plugin hooks again after every update.

:::steps

1. Open `/hooks` and press `t` on the events page, or approve the "Hooks need review" prompt at startup. Until then the emet guard and the single approval do not run.
2. If the shim prints `release v<version> has no downloadable asset yet`, it is running the cached version. Retry in a few minutes.

:::

## Check

:::steps

1. Run `emet doctor .`. On the Codex host it reports a `codex` older than `codex.minVersion`, a missing `--json` or `--output-schema` flag on `codex exec`, untrusted hooks and a missing `mattpocock-skills`.
2. Fix what it reports using the matching entry in [Troubleshooting](../troubleshooting.md#codex-host), then run it again until it reports no failures.

:::

Known limits: effort `ultra` is never sent and is rejected in configuration, and `codex.sandbox` defaults to `danger-full-access` so workers can commit; set it to `"workspace-write"` to keep the sandbox, and workers then cannot commit. See [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) and the [probe report](../research/codex-probe-report.md).

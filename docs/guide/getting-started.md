# Getting started

Install emet, check that it works and run it for the first time.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Requirements

Claude Code or the Codex CLI, `git`, `gh` (authenticated) and the `mattpocock-skills` plugin, on Linux or macOS. Bun is needed only for a source install; native Windows is unsupported (use WSL). The full list, with what checks each item, is in the [dependencies reference](../reference/dependencies.md).

## Install

There are two install paths.

**Plugin** (no Bun needed). Add this repo as a marketplace and install the `emet` plugin. What it ships depends on the Agent host. On Claude Code it brings `/emet:run`, the agents, the guard hooks and an `emet` shim that downloads a checksum-verified standalone binary on first use.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

On Codex, install the plugin with `codex plugin`; the steps are in [Running emet on Codex](codex.md#install). The Codex plugin ships the `$emet:run`, `$emet:init` and `$emet:doctor` skills and a hook, but no agents and no `emet` shim, so the terminal `emet` comes from `install.sh`.

**`install.sh`** (works with or without Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

With `bun` on PATH it copies the CLI source to `~/.claude/emet` and an `emet` wrapper to `~/.local/bin/emet`. Without `bun` it installs the standalone-binary shim instead (`~/.local/bin/emet`, linked to `~/.claude/emet/bin/emet`), which downloads and checksum-verifies the binary on first run (needs `curl`). Either way the commands land in `~/.claude/commands/emet/` and the agents in `~/.claude/agents/`; plugin placeholders in the prompts are rewritten to plain `~/.claude` paths. Re-running it is safe, and a file you edited is kept with the new version written beside it as `<file>.new`.

Both installs give you three entry points. On Claude Code they are the slash commands `/emet:run`, `/emet:init` and `/emet:doctor`; on Codex they are the `$emet:run`, `$emet:init` and `$emet:doctor` skills. The `emet` command in a plain terminal works only after `install.sh`; otherwise use the slash commands, or `! emet <subcommand>` inside a Claude Code or Codex session. On Claude Code the agent names differ: `emet:emet-worker` in the plugin, `emet-worker` standalone; Codex has no emet agents, because each worker is its own `codex exec` process.

Recommended order, in each repo: run the `setup-matt-pocock-skills` skill first (`/setup-matt-pocock-skills` on Claude Code; on Codex, the same skill from the `mattpocock-skills` plugin with Codex's `$` skill syntax), then `emet init`.

Verify it worked with `/emet:doctor` inside Claude Code (`$emet:doctor` on Codex), or `emet doctor .` in a terminal after `install.sh` (`selftest` needs a source install).

If `doctor` or `preflight` reports a problem, see [troubleshooting](../troubleshooting.md). Nothing is ever installed or logged in on your behalf; see the [dependencies reference](../reference/dependencies.md) for who checks what and for `EMET_SKIP_DEPENDENCY_CHECKS`.

## First run

In any git repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Inside a session, `/emet:init` does the same as `emet init`. Then, inside Claude Code (on Codex, use `$emet:run` instead of `/emet:run`):

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` leaves a `TODO(emet):` marker in the generated `docs/agents/*.md` files for anything it can't infer on its own (a shared test-database lock, schema ownership, etc.); fill those in. `emet preflight` refuses to dispatch while one remains.

## Next

- [Trackers and landing](trackers-and-landing.md): GitHub, Linear or local tickets, and how a wave lands.
- [Running emet on Codex](codex.md): install, the single approval and the limits on the Codex Agent host.
- [Models and effort](models-and-effort.md): which model and effort each role uses.
- [Fleet check](fleet.md): audit several repos at once.
- [Configuration reference](../reference/configuration.md) and [CLI reference](../reference/cli.md): every key and subcommand.

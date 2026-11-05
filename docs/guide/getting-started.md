# Getting started

Install emet, check that it works and run it for the first time.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Requirements

Claude Code, `git`, `gh` (authenticated) and the `mattpocock-skills` plugin, on Linux or macOS. Bun is needed only for a source install; native Windows is unsupported (use WSL). The full list, with what checks each item, is in the [dependencies reference](../reference/dependencies.md).

## Install

There are two install paths.

**Plugin** (no Bun needed). Add this repo as a marketplace and install the `emet` plugin; it brings `/emet:run`, the agents, the guard hooks and an `emet` shim that downloads a checksum-verified standalone binary on first use.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

**`install.sh`** (works with or without Bun):

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

With `bun` on PATH it copies the CLI source to `~/.claude/emet` and an `emet` wrapper to `~/.local/bin/emet`. Without `bun` it installs the standalone-binary shim instead (`~/.local/bin/emet`, linked to `~/.claude/emet/bin/emet`), which downloads and checksum-verifies the binary on first run (needs `curl`). Either way the command lands in `~/.claude/commands/emet.md` and the agents in `~/.claude/agents/`; plugin placeholders in the prompts are rewritten to plain `~/.claude` paths and `/emet`. Re-running it is safe, and a file you edited is kept with the new version written beside it as `<file>.new`.

Recommended order, in each repo: run `/setup-matt-pocock-skills` first, then `emet init`.

Verify it worked (`selftest` needs a source install):

```bash
emet doctor .
```

If `doctor` or `preflight` reports a problem, see [troubleshooting](../troubleshooting.md). Nothing is ever installed or logged in on your behalf; see the [dependencies reference](../reference/dependencies.md) for who checks what and for `EMET_SKIP_DEPENDENCY_CHECKS`.

## First run

In any git repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

Then, inside Claude Code:

```
/emet <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet --draft <describe the feature>      # stop after tickets are created
/emet --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`emet init` leaves a `TODO(emet):` marker in the generated `docs/agents/*.md` files for anything it can't infer on its own (a shared test-database lock, schema ownership, etc.); fill those in. `emet preflight` refuses to dispatch while one remains.

## Next

- [Trackers and landing](trackers-and-landing.md): GitHub, Linear or local tickets, and how a wave lands.
- [Models and effort](models-and-effort.md): which model and effort each role uses.
- [Fleet check](fleet.md): audit several repos at once.
- [Configuration reference](../reference/configuration.md) and [CLI reference](../reference/cli.md): every key and subcommand.

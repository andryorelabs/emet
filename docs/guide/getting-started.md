# Getting started

Install emet, check that it works and run it for the first time.

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

## Requirements

Claude Code or the Codex CLI, `git`, `gh` (authenticated) and the `mattpocock-skills` plugin, on Linux or macOS. Bun is needed only for `emet self install --from`; native Windows is unsupported (use WSL). The full list, with what checks each item, is in the [dependencies reference](../reference/dependencies.md).

## Install

Run the bootstrap script in a terminal. No Bun, no clone and no sudo are needed:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

The script refuses to run under sudo, downloads the standalone binary and `SHA256SUMS` for your platform to a temporary directory, verifies the checksum (and the attestation when `gh` is present), and only then hands off to `emet self install`. Nothing is written if a check fails. It does not edit your shell profile; if `~/.local/bin` is not on your `PATH`, add it.

`emet self install` places the binary under `~/.local/share/emet/versions/<version>/emet` and links it from `~/.local/bin/emet`. It then writes the Claude Code files: the reference prompts in `~/.claude/emet/`, the commands in `~/.claude/commands/emet/` and the agents in `~/.claude/agents/`, with the plugin placeholders rewritten to plain `~/.claude` paths. It merges the emet hooks into `~/.claude/settings.json` after a backup and leaves foreign hooks alone. When Codex is present it also writes the emet skills under `~/.agents/skills/emet/` and appends the emet hooks to `$CODEX_HOME/hooks.json` (default `~/.codex`); it never writes `config.toml`. Re-running it is safe, and a file you edited is kept with the new version written beside it as `<file>.new`.

To preview every write without making any, pass `--dry-run`. Arguments after `sh -s --` reach `emet self install`:

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

You can also pin a version, as in `sh -s -- 1.2.3`; the default is `latest`. To install from a checkout instead, run `emet self install --from <checkout>`; it needs `bun` and keeps `emet selftest` working.

### Codex

When Codex is present, `emet self install` prints a one-time step: open `/hooks` in Codex and press `t` on the events page to trust the emet hooks (or approve the "Hooks need review" prompt at startup). Until then the emet guard does not run. See [Running emet on Codex](codex.md#install).

### Auto-update

A `SessionStart` hook runs `emet self update --auto` at most once a day, detached and silent when offline. It verifies the checksum, stages the new version and swaps the symlink only when no worker slot is held; otherwise the update stays pending until the next session start. The previous version is kept for rollback. To turn it off, set `EMET_AUTO_UPDATE=0` or run `emet self update --auto off`; `emet self update --auto on` turns it back on. See [Update emet](../how-to/update-emet.md).

### Uninstall

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

It removes the versions directory, the `~/.local/bin/emet` symlink, the install state file, the Codex skills and every emet hook in both hook files, and it reverts the extras that `emet setup` recorded. A command file you edited and any foreign hooks are kept. See the [CLI reference](../reference/cli.md#setup-ledger-and-restore).

### Optional: plugins

Instead of the standalone install, or for the optional `emet-mascot`, you can install emet as a plugin. `emet self install` refuses while the emet plugin is installed and explains how to remove it; `--force` proceeds anyway, and `emet doctor` warns when both coexist. What a plugin ships depends on the Agent host. On Claude Code it brings `/emet:run`, the agents, the guard hooks and an `emet` shim that downloads a checksum-verified standalone binary on first use. The Codex plugin ships the `$emet:run`, `$emet:init` and `$emet:doctor` skills and a hook, but no agents and no `emet` shim.

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

Every install gives you the same three entry points. On Claude Code they are the slash commands `/emet:run`, `/emet:init` and `/emet:doctor`; on Codex they are the `$emet:run`, `$emet:init` and `$emet:doctor` skills. The standalone install also puts `emet` on your `PATH`, so `emet init` and `emet doctor .` work in a plain terminal; with only a plugin, use the slash commands, or `! emet <subcommand>` inside a Claude Code or Codex session. On Claude Code the agent names differ: `emet:emet-worker` in the plugin, `emet-worker` standalone; Codex has no emet agents, because each worker is its own `codex exec` process.

Recommended order, in each repo: run the `setup-matt-pocock-skills` skill first (`/setup-matt-pocock-skills` on Claude Code; on Codex, the same skill from the `mattpocock-skills` plugin with Codex's `$` skill syntax), then `emet init`.

Verify it worked with `/emet:doctor` inside Claude Code (`$emet:doctor` on Codex), or `emet doctor .` in a terminal (`selftest` needs a `--from` source install).

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

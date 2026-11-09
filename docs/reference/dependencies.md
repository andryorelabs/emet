# Dependencies

What emet needs on the machine, and which command checks each item. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Back to the [README](../../README.md).

## Required

- **[bun](https://bun.sh)**: only for source installs. The standalone binary needs no runtime.
- **`rsync`** and **`sha256sum` or `shasum`**: required by `install.sh`.
- **`git`**: required at runtime. Nearly every subcommand shells out to it.
- **`gh` CLI, authenticated**: required when the tracker is `github` or landing is `pr`. PRs always use it. With `tracker.kind: "local"` and `landing.mode: "merge"`, `gh` is not required.
- **The `mattpocock-skills` plugin** (`claude-plugins-official` marketplace): the interview, spec and ticket phases of `/emet` call skills that live there.

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **The `emet-worker` and `emet-reviewer` agents** in `~/.claude/agents/`: installed by `install.sh`. Phase 6 and Phase 8 dispatch by `subagent_type`, so either one missing breaks dispatch. See [Models & effort](../../README.md#models--effort).
- **A Linear MCP server declared in `.mcp.json` (or at user scope)**: only if the repo uses the `linear` tracker. emet verifies the declaration. Whether the connection is authenticated lives in Claude Code's own credential store and cannot be checked from here. If a run fails to read tickets, restart Claude Code and approve the connection.

None of the above is ever installed or logged in on your behalf. What differs is who checks it and how hard.

## Codex host

Only when `agentHost` is `"codex"`; see the [Codex guide](../guide/codex.md). The `emet-worker` and `emet-reviewer` agents are not used there.

- **The `codex` CLI**, logged in, at `codex.minVersion` (default `0.167.0`) or newer. `emet doctor` reports an older version and checks that `codex exec --help` lists `--json` and `--output-schema`.
- **The `mattpocock-skills` plugin** in Codex, probed with `codex plugin list`:

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **The emet Codex plugin** (`.codex-plugin/plugin.json`), which ships the `$emet:run`, `$emet:init` and `$emet:doctor` skills and the approval hook.

emet never writes your `~/.codex`: workers run with a per-run `CODEX_HOME` that links your auth and config.

## What checks what

|                                                  | `emet init`                | `emet doctor`                 | `emet preflight`                                                         |
| ------------------------------------------------ | -------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| plugin missing/disabled                          | prints the install command | reports it (once, fleet-wide) | **blocks dispatch**                                                      |
| `emet-worker`/`emet-reviewer` agent missing      | —                          | reports it (once, fleet-wide) | **blocks dispatch**                                                      |
| `gh` missing/unauthenticated (tracker: `github`) | prints what to run         | reports it                    | **blocks dispatch**                                                      |
| Linear server undeclared (tracker: `linear`)     | prints a note              | reports it                    | **blocks dispatch**                                                      |
| `claude` not on PATH, or a probe timing out      | prints a note              | reports it                    | **warns, never blocks**: this is "couldn't check", not "verified broken" |
| a flag emet relies on missing from `--help`      | —                          | reports it                    | —                                                                        |

### Flag checks

`emet doctor` checks the flags themselves, not only that the binaries exist. It reads `--help` for `gh issue view` and `gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) and `claude agents` (`--json`), and reports any flag a newer or older CLI no longer documents. A renamed flag would otherwise fail a wave midway.

### Timeouts and skipping a block

Every probe is capped at 5s so a stalled `gh auth status` (no network) cannot hang a wave. If a `preflight` block is itself wrong for your environment, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` downgrades it to a warning for that one run. Set it in your own shell, not in anything the `/emet` coordinator runs unattended. See [Environment variables](cli.md#environment-variables).

### Repo-owned binaries

A repo's `preflight.requiredCommands` (in `emet.config.json`) is a separate, repo-owned list of binaries that `emet preflight` and `emet doctor` require on PATH. It is useful for `rg` and `sg`, which the worker prompts offer as faster alternatives to reading a file whole. `gh` does not need to be listed there; the check above already covers it. See [`preflight`](configuration.md#preflight).

For failures and fixes, see [troubleshooting](../troubleshooting.md#a-dependency-check-fails).

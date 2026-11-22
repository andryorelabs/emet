# 0043. Reversible setup and a data-driven uninstall

Status: Accepted (2026-11-22)
Spec: draft #799

Amends [0031](0031-after-spec-step-and-optional-setup.md) with a preview, a **Setup ledger** and an **Uninstall**.
Amends [0001](0001-root-dev-tooling-package-separate-from-runtime.md) with one `install.sh` flag.

## Context

`emet setup` changes the user's Claude Code settings and replaces the `firecrawl-local` MCP registration with no preview, no record of the previous value and no way back. Nothing removes emet once installed: the files, the shim and the guard hooks in `~/.claude/settings.json` are cleaned up by hand. `install.sh` records a manifest of the files it installs, but the installed CLI does not ship `hooks/hooks.json`, so it cannot learn the hook list from it.

## Decision

- **Preview.** Each setup item has `plan()`, built from read-only probes, and `emet setup --dry-run` prints the planned steps and executes nothing. A parity test keeps `install()` and `plan()` in step.
- **Setup ledger.** `setup-ledger.json` under the state directory holds one entry per item that ended `installed`, with the before-state needed to undo it: the previous `model` and the deny rules actually added, the previous user-scope MCP entry read from `~/.claude.json`, the plugin ids, the files written and the global packages installed. An `already-present` item records nothing, and a second `installed` keeps the first before-state. A malformed ledger is an error, never an empty one.
- **Restore.** `emet setup --restore claude-settings` reverts the model and removes only the rules emet added, keeping a model the user changed since. `--restore firecrawl-local` re-adds the recorded entry with `claude mcp add-json`, or removes emet's when there was none. No other id is restorable.
- **Uninstall.** `emet uninstall` removes the manifest files whose hash matches, keeps and lists edited ones, removes the shim, the manifest and the guard hooks, and reverts the ledger's extras. The guard hooks are found by matching their command (`^(\S*/)?emet guard( |$)`) in any event, and a test in `tools/` ties that pattern and `install.sh`'s wiring to `hooks/hooks.json`. Global packages (brew, bun, cargo) are never removed: the commands are printed. `gh auth` is never touched. The state directory stays unless `--purge`. `--dry-run`, `--yes` and `--json` apply; without a terminal and without `--yes` it only prints the plan.
- **Wrapper.** `install.sh --uninstall` runs `emet uninstall` and does nothing else. It is the only change to `install.sh`, and the rule that `install.sh` does not change without a ticket does not apply to it.

## Consequences

- A setup change can be previewed first and undone later without losing what the user had.
- A newer guard hook is removed by an older uninstall, because the match is on the command, not on a list.
- Shared global tools survive an uninstall, at the cost of one manual command each.
- The ledger is a second record next to the **Journal**, but it holds machine changes, not run events.

## Alternatives considered

- **Copy the `.bak` file back**: rejected because it discards every edit made after setup.
- **Ship `hooks.json` with the install and read it**: rejected because it needs a second `install.sh` change and misses hooks that earlier versions wired.
- **Remove global packages on uninstall**: rejected because other projects may use them.
- **Record every item, installed or not**: rejected because an `already-present` item was not emet's to undo.

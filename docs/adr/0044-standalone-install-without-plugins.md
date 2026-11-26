# 0044. Standalone install without plugins

Status: Accepted (2026-11-23)
Spec: standalone install (spec 1 of the v0.22 plan)

Amends [0008](0008-standalone-binaries-and-plugin-distribution.md): `install.sh` is replaced by `emet self install`.
Amends [0001](0001-root-dev-tooling-package-separate-from-runtime.md): the installer is now `emet self install`, and it changes under an explicit ticket like the rest of the runtime.
Amends [0043](0043-reversible-setup-and-data-driven-uninstall.md): hook definitions now ship inside the binary, which reverses its rejected alternative "Ship `hooks.json` with the install".
Amended by [0047](0047-workflow-tagline-replaces-plugin.md): the descriptive tagline says "workflow", not "plugin".

## Context

emet installs two ways. The plugin gives the commands, agents and hooks of one **Agent host** but puts no `emet` on the terminal PATH and ties the install to that host's plugin system. `install.sh` needs a git clone, supports only Claude Code and updates nothing. Codex has no install without its plugin. The maintainer wants one primary install that works without plugins on both hosts, and keeps plugins as an option.

## Decision

- **One entry point.** `curl -fsSL https://emet.andryore.dev/install.sh | sh` runs a small POSIX script, attached to every release as `install.sh`, that downloads the platform binary, verifies it against `SHA256SUMS` (and the build attestation when `gh` is present), and runs `emet self install`. The site redirects `/install.sh` to the release asset.
- **Binary embeds the install tree.** Commands, agents, reference prompts, both hook definitions, the Codex skills and the plugin manifests are generated into the binary at build time and drift-checked. No checkout is needed.
- **`emet self install|update`.** The binary is placed at `~/.local/share/emet/versions/<v>/emet` and `~/.local/bin/emet` points at it. Claude Code files keep today's layout under `~/.claude`. Codex skills go to `~/.agents/skills` and hooks are appended to `$CODEX_HOME/hooks.json`; `config.toml` is never written, so the user trusts the hooks once with `/hooks`. Hook commands use the absolute `~/.local/bin/emet` path.
- **Auto-update.** A `SessionStart` hook runs `emet self update --auto` at most once a day. The swap waits until no worker slot is held, a failed verification keeps the current version, and `EMET_AUTO_UPDATE=0` turns it off. It does nothing for plugin installs.
- **Coexistence.** `self install` refuses when the plugin is installed unless `--force`; `emet doctor` warns about coexistence, drift, untrusted Codex hooks and a pending update.
- **Contributors.** `emet self install --from <checkout>` keeps the Bun source install and `emet selftest`.
- **`install.sh` is removed** in the same change. The `forge`-era migration it performed is not ported.
- **Plugins stay** published each release as an optional route, unchanged.

## Consequences

- A user installs and updates emet with no clone and no plugin system, on both hosts.
- The binary grows by about 220 KB.
- The hook list is known to the installed binary, so uninstall can match every emet hook command, not only `emet guard`.
- Writing hooks into `~/.claude/settings.json` and `$CODEX_HOME/hooks.json` makes emet responsible for merging without touching foreign entries.
- The Codex trust step cannot be skipped without writing `config.toml`, which emet refuses to do.

## Alternatives considered

- **Keep `install.sh` beside the new install**: rejected because two installers drift; the old one has no update path.
- **Homebrew tap**: rejected by the maintainer.
- **Write Codex trust into `config.toml`**: rejected because it edits a file that holds the user's credentials-adjacent settings and reproduces a hash recipe that can change.
- **Hooks that call `emet` from PATH**: rejected because an IDE may not have `~/.local/bin` on its PATH.
- **Phased delivery**: rejected by the maintainer in favour of one change.

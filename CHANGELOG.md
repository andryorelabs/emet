# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-05

### Added

- `/emet:init` and `/emet:doctor` plugin commands run `emet init` and
  `emet doctor .` inside Claude Code and summarize the result.
- `emet doctor` warns about `forge guard` and `emet guard` hooks in
  `~/.claude/settings.json` whose binary no longer exists, and prints a
  backup-then-`jq` command to remove them. It never edits the file.
- Mascot foundations: a phase file, the pet bundle, a mod state machine,
  the remaining phase writers and raster frames.

### Fixed

- The plugin no longer exposes a broken duplicate `/emet:emet` command;
  `commands/` is pinned to `run.md`, `init.md` and `doctor.md`.
- The next wave now launches with `/emet:run`, the command the plugin
  registers.

### Changed

- The repository moved to the `andryorelabs` GitHub organization. Release
  downloads, the README badges and the clone URL now point at
  `andryorelabs/emet`; the old `AndryOre/emet` URLs keep redirecting.
- Standalone installs rename `/emet` to `/emet:run`, matching the plugin.
  `install.sh` now installs `commands/run.md`, `init.md` and `doctor.md` to
  `~/.claude/commands/emet/`, so `/emet:run`, `/emet:init` and `/emet:doctor`
  are available without the plugin. The old `~/.claude/commands/emet.md` is
  removed when unedited; an edited copy is kept and listed in the install
  summary.

## [0.2.0] - 2026-11-05

### Changed

- The project is renamed from claude-forge to emet: the CLI is `emet`, the
  command is `/emet`, the agents are `emet-worker` and `emet-reviewer`, and the
  README carries the new brand. Existing installs and repos keep working:
  legacy names (`forge.config.json`, `.forge/`, `docs/agents/forge.md`,
  `FORGE_*`) are still read with a notice, and `emet migrate` moves a repo to
  the new names.

### Added

- `install.sh` works without Bun: it installs the standalone-binary shim as
  `~/.local/bin/emet`, rewrites plugin placeholders in the prompts it copies,
  installs `commands/run.md` as `~/.claude/commands/emet.md` and accepts
  `shasum -a 256` in place of `sha256sum`.
- README states the real requirements, both install paths and the
  `/setup-matt-pocock-skills` then `emet init` order.
- Agent guide (`AGENTS.md`), domain glossary (`GLOSSARY.md`) and architecture
  decision records under `docs/adr/`.
- Local markdown tracker on the `.scratch/` convention, with a `emet tracker`
  CLI (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`,
  `close`) and local-aware `emet validate`, `preflight` and `doctor`.
- `landing.mode` (`pr` or `merge`) and `emet land`, which lands a wave as one
  local merge without a PR; `emet cleanup` and `emet status` compare against
  local trunk in merge mode.
- Standalone `emet` binaries, `emet --version`, macOS support in CI and in the
  process-tree and memory brake, and plugin manifests with a `bin/emet` shim.
- Skills contract with `emet skill-path`, and a broader `emet doctor` covering
  skills, glossary, deprecations and double installs.
- Language-neutral `emet init` and `emet map` for JS, Go, Rust and Python repos.
- ADR-0007 to ADR-0011.
- Docs index, architecture code map, troubleshooting by symptom, a richer PR
  template and `emet/AGENTS.md` with the runtime-only rules.

### Changed

- `gh` is required only when `tracker.kind` is `github` or `landing.mode` is
  `pr`.
- `emet init` no longer selects the local tracker by default.
- ADR-0004 is amended: a wave lands as one PR or one local merge.

## [0.1.0] - 2026-11-03

### Added

- The global `/forge` command: interview, spec, tickets, one approval, then
  parallel worktree agents that implement, test and merge a feature unattended.
- The `forge` CLI with `init`, `doctor`, `preflight`, `selftest`, claims, slots,
  gates, handoff checks, results and metrics subcommands.
- The `forge-worker` and `forge-reviewer` agents.
- Trackers for Linear and GitHub Issues.
- Per-repo configuration through `forge.config.json`.
- `install.sh`, which installs the CLI, command and agents.

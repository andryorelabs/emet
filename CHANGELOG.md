# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `install.sh` works without Bun: it installs the standalone-binary shim as
  `~/.local/bin/forge`, rewrites plugin placeholders in the prompts it copies,
  installs `commands/run.md` as `~/.claude/commands/forge.md` and accepts
  `shasum -a 256` in place of `sha256sum`.
- README states the real requirements, both install paths and the
  `/setup-matt-pocock-skills` then `forge init` order.
- Agent guide (`AGENTS.md`), domain glossary (`CONTEXT.md`) and architecture
  decision records under `docs/adr/`.
- Local markdown tracker on the `.scratch/` convention, with a `forge tracker`
  CLI (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`,
  `close`) and local-aware `forge validate`, `preflight` and `doctor`.
- `landing.mode` (`pr` or `merge`) and `forge land`, which lands a wave as one
  local merge without a PR; `forge cleanup` and `forge status` compare against
  local trunk in merge mode.
- Standalone `forge` binaries, `forge --version`, macOS support in CI and in the
  process-tree and memory brake, and plugin manifests with a `bin/forge` shim.
- Skills contract with `forge skill-path`, and a broader `forge doctor` covering
  skills, glossary, deprecations and double installs.
- Language-neutral `forge init` and `forge map` for JS, Go, Rust and Python repos.
- ADR-0007 to ADR-0011.

### Changed

- `gh` is required only when `tracker.kind` is `github` or `landing.mode` is
  `pr`.
- `forge init` no longer selects the local tracker by default.
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

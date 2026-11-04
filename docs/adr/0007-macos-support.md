# 0007. macOS support

Status: Accepted (2026-11-03)
Spec: #88

Supersedes [0006](0006-linux-only-ci.md).

## Context

ADR-0006 limited CI to Linux because nobody ran forge elsewhere. Distributing forge as a plugin and standalone binaries (ADR-0008) puts it on macOS machines, where `/proc` does not exist.

## Decision

forge supports Linux and macOS. Process-tree lookups use `/proc` when present and `ps -o ppid=,comm= -p <pid>` otherwise, and the memory brake degrades without `/proc/meminfo`. CI keeps the Linux jobs and adds a macOS job that runs `bun test --cwd forge` and a compiled-binary smoke (`forge --version`). Windows is unsupported except through WSL. This supersedes ADR-0006.

## Consequences

- macOS regressions are caught in CI.
- CI cost and flake surface grow by one job, which `ci-passed` gates.
- The macOS job uses a GitHub-hosted runner, not the `CI_RUNNER` expression.

## Alternatives considered

- **Stay Linux-only**: rejected, the binaries ship for darwin.
- **Full macOS matrix for every job**: rejected, only tests and the binary smoke are platform-sensitive.
- **Native Windows**: rejected, the CLI depends on POSIX tools and paths.

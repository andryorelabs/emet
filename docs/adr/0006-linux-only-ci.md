# 0006. Linux-only CI

Status: Accepted (2026-11-03)
Spec: #73 (S10)

## Context

The forge CLI is developed and run on Linux hosts. It shells out to `git`, uses `rsync` in `install.sh`, and keeps host-wide state under `~/.local/state/forge`. A cross-platform matrix would test configurations nobody uses and triple CI cost and flake surface.

## Decision

CI runs on Linux only, on the existing `runs-on` expression (`vars.CI_RUNNER` on private repos). Workflows are hardened per S10, with a final `ci-passed` job that fails on any failure or cancellation. Other platforms are unsupported until a real user needs one.

## Consequences

- Faster, cheaper CI with fewer platform-specific failures.
- Portability regressions on macOS or Windows would not be caught.
- Supporting another platform later means a new ADR and a matrix, not a quiet edit.

## Alternatives considered

- **Linux + macOS matrix**: rejected as there are no macOS-specific users or code paths today.
- **Linux + macOS + Windows**: rejected because the CLI depends on POSIX tools and paths.

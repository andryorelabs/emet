# 0022. Codex workers run unsandboxed by default

Status: Accepted (2026-11-09)
Spec: the Codex end-to-end spec, filed 2026-11-09 (S1); amends [0021](0021-codex-support-strategy.md)

## Context

ADR-0021 chose the exec-policy allow rule for `git add` and `git commit` over `danger-full-access`, on the evidence of a spike. The real-Codex probe of spec #370 ([codex-probe-report](../research/codex-probe-report.md)) contradicts it: under `workspace-write` no worker could commit, because `.git/worktrees/<ticket>` stayed read-only even with `--add-dir`, and the same sandbox blocks `emet dispatch` itself when the coordinator is a Codex session, since that session runs inside the sandbox too. On Claude Code the same waves run with `bypassPermissions` (`handoff.permissionMode`), with the `emet guard` hook as the control.

## Decision

- The `codex.sandbox` default becomes `danger-full-access` for Codex workers, the reviewer's writable steps and launched sessions. `workspace-write` stays selectable.
- The control is the same as on Claude Code: the `emet guard` hook enforces the ticket's surfaces and the single approval, and denies `git push` in every argv form. Exec-policy rules stay as defense in depth and are checked with `codex execpolicy check`.
- The read-only reviewer keeps `-s read-only`.
- The Claude path is unchanged.

## Consequences

- Codex workers can commit and the coordinator can dispatch from inside its own session, so the flow matches Claude Code.
- A worker's shell is no longer confined by the sandbox. The guard hook is the boundary, a guardrail and not a hard wall, the same trust model as the Claude guard.
- The guard must be tested for every `git push` form; a hole there is a real exposure.
- A user who wants the old confinement sets `codex.sandbox` to `workspace-write` and accepts that workers cannot commit.

## Alternatives considered

- **Keep `workspace-write` with a wider allow rule**: rejected as the default. The probe showed commits still fail, and nested dispatch needs the coordinator out of the sandbox. Kept as a configurable value.
- **Run git and `emet` commands outside the sandbox only by rule**: rejected as the only mechanism. It depends on the model's exact command shape (`git -C <dir>` matched no rule), so it is fragile.
- **`danger-full-access` only when the user asks**: rejected. The documented flow would not work out of the box.

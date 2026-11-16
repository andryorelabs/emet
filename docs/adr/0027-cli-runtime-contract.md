# 0027. CLI runtime contract

Status: Accepted (2026-11-16)
Spec: #523 (S18, S19)

## Context

The `emet` CLI is called by the `/emet:run` and `$emet:run` prompts, by hooks and by people. The prompts branch on exit-code numbers, so those numbers cannot move. Until now each command invented its own handling of unknown flags, errors, colour and interrupts. [ADR-0024](0024-adopt-the-andryorelabs-standard.md) adopts standard v2, whose CLI rule (V39) asks for one predictable contract.

## Decision

- **Envelope**: `--json` on any command, including `--help` and `--version`, prints one envelope `{ok, data, error: {code, message, fix}}`. Human output stays the default.
- **Exit codes**: one map keeps the existing numbers: 0 clean, 1 findings, 2 config or usage error, 3 internal error. The documented command outcomes stay: `ask` exits 3 on a slice timeout and 4 when expired, and `review-package` exits 3 on an empty or non-descendant range. Module-local errors extend one `EmetError`, which carries a stable code and an exit code.
- **Unknown flags**: rejected with exit 2, naming the flag.
- **SIGINT**: exits 130.
- **Color**: honours `NO_COLOR`, `FORCE_COLOR`, `--no-color`, `TERM=dumb` and whether stdout is a TTY.
- **Update notice**: quiet and cached, and never printed under `--json` or without a TTY.
- **Top-level errors**: one line, with the stack only under `--verbose`.
- **Guard launcher**: the PreToolUse guard launcher fails closed. When it cannot run the guard, it denies the call.

## Consequences

- Prompts and scripts keep working, because no documented exit number changes.
- A caller can parse any command's `--json` output the same way.
- A mistyped flag fails loudly instead of being ignored.
- A broken guard install blocks tool calls until fixed, instead of letting them through.
- Behaviour of the CLI under these rules is a runtime change, owned by the tickets that implement spec #523, not by this ADR.

## Alternatives considered

- **Renumber exit codes into a finer map**: rejected. The prompts rely on the current numbers.
- **Envelope on `--json` of data commands only**: rejected. A caller would special-case `--help` and `--version`.
- **Fail open when the guard launcher breaks**: rejected. A guard that disappears silently protects nothing.

# 0021. Codex support strategy

Status: Proposed (2026-11-09)
Spec: #341 (S4)

## Context

emet is coupled to Claude Code at about 110 points: the plugin layout, subagent prose, session launch, transcript paths and the hook schema. A research report and a local spike on Codex CLI 0.167.0 ([codex-viability](../research/codex-viability.md)) found no blocker, but two native gaps: Codex subagents cannot get a worktree per child, and they cannot run a read-only reviewer. Both are solved by running one `codex exec` process per worker and per reviewer, owned by the `emet` CLI. This ADR introduces the term **Agent host**, the product a run executes in. Claude Code is one Agent host and Codex CLI would be another.

## Decision

- Adopt Model C: an agent-agnostic core with one adapter per Agent host. Claude Code is refactored behind the interface first, with no behaviour change. The Codex adapter follows, through a separate spec and tickets.
- On Codex, the `emet` CLI owns the processes. Workers run as `codex exec -C <worktree> --json`, the reviewer as `codex exec -s read-only`. Commits go through an exec-policy allow rule for `git add` and `git commit` with `git push` forbidden. `danger-full-access` stays a documented opt-in.
- The coordinator on Codex is the plugin skill `$emet:run`.
- The single approval on Codex is hook-emulated: a `PreToolUse` hook denies mutations until a `UserPromptSubmit` hook sees the user prompt `approve <id>` and creates the approval file. The alternative, documented and supported, is `/plan $emet:run` followed by the "Implement this plan?" prompt.
- Installed prompt wording changes only under explicit tickets (ADR-0001). `install.sh` and the runtime behaviour of the CLI do not change until that spec is approved.

This ADR stays Proposed until the follow-up spec is approved.

## Consequences

- One interface to maintain, so a third Agent host is an adapter, not a fork.
- The Claude path stays covered by the existing tests during the refactor.
- Estimated ~15 tickets in 5 waves. After wave 2 a Claude coordinator can already run Codex workers.
- `emet guard` needs an `apply_patch` shim and host detection.
- Approval on Codex is a guardrail, not a hard boundary, the same trust model as the Claude guard.
- Codex behaviour (hook trust, sandbox, rollout format) changes between releases, so the adapter pins a tested range.

## Alternatives considered

- **Model A, Codex workers under a Claude coordinator**: rejected as the end state. It is the cheapest (~4 tickets, 2 waves) and its launch code is reused by C, but Claude Code stays mandatory.
- **Model B, Codex as full host without an interface**: rejected. It forks prompts and code (~13 tickets, 4 waves) and doubles the maintenance of every change.
- **Native Codex subagents for workers**: rejected. No per-child `cwd`, inherited sandbox and no read-only child (GH#18969, GH#45482).
- **`/plan` as the primary approval**: kept as the alternative only. The user must type `/plan` and the model cannot exit plan mode itself (GH#35858).
- **`danger-full-access` as the default commit path**: rejected. The exec-policy allow rule gave the same commit result with a smaller blast radius.

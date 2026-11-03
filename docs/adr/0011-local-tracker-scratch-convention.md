# 0011. Local tracker on the .scratch convention

Status: Accepted (2026-11-03)
Spec: #106 (S13)

## Context

The first local tracker design stored tickets under a versioned `.forge/tickets/` directory with a configurable `tracker.local.idPrefix`. It was never implemented end to end, and it conflicted with the file layout of mattpocock-skills, a contracted core dependency ([0009](0009-mattpocock-skills-contracted-core-dependency.md)).

## Decision

The local tracker follows the mattpocock convention: a spec at `.scratch/<feature-slug>/spec.md` and tickets at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, with `Status:` and `Blocked by:` metadata lines and comments under `## Comments`. `.scratch/` is not versioned and the tracker root is always the main worktree's `.scratch/`. Ids are the feature slug for a spec and `<feature-slug>-<NN>` for a ticket. `forge tracker` reads and writes these files under a per-spec lock, and only the coordinator writes (ADR-0005). The `.forge/tickets` design is replaced and `tracker.local.idPrefix` is deprecated.

## Consequences

- Specs and tickets written by mattpocock skills are readable by `forge tracker` without conversion.
- Tracker state lives outside git, so it is not part of a landed diff and `forge doctor` warns if `.scratch/` is tracked.
- Linked worktrees share one tracker because the root resolves from the git common dir.

## Alternatives considered

- **Keep `.forge/tickets` versioned in the repo**: rejected because tracker churn pollutes history and diverges from the skills' layout.
- **Per-worktree `.scratch/`**: rejected because workers and the coordinator would see different state.
- **A single JSON database**: rejected because it is not human-editable and does not match the skills' convention.

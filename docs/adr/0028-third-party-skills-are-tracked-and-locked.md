# 0028. Third-party skills are tracked and locked

Status: Accepted (2026-11-18)
Spec: #601 (S8)

## Context

[ADR-0024](0024-adopt-the-andryorelabs-standard.md) kept the third-party skills under `.claude/skills/` untracked and out of `skills-lock.json`, so the lock listed only the two Module skills (`add-adr`, `cut-release`). That matches aokit standard H3 ("lock lists only Module-managed skills") and D8 ("project skills are add-adr and cut-release only"). In practice an untracked skill is not reproducible: a fresh clone or a worktree has no copy, nothing pins the version an agent read, and a changed upstream skill, including its bundled scripts, goes unreviewed.

## Decision

- The third-party skills under `.claude/skills/` are tracked in git and listed in `skills-lock.json`, each pinned to a full upstream commit SHA with a folder hash.
- This reverses the third-party exemption of ADR-0024. The lock keeps `"version": 1`, and the Module entries are unchanged.
- This deviates from aokit standard H3 and D8. The follow-up is to change the standard in aokit; until then this ADR is emet's recorded exception.
- `.claude/skills/git-commit/` stays ignored, as a personal skill.
- A skill is reviewed before it is committed: every `SKILL.md` and bundled script is read. The procedure is in [development.md](../development.md#skills-install-and-update).

## Consequences

- A fresh clone has the same skills at the same versions, and an update is a reviewable diff.
- The invariant tests check that tracked skill directories and lock keys agree, and that each hash matches its folder.
- Updating a skill is manual work: the skills CLI rewrites the lock to version 2 and blanks hashes, so the entry is restored by hand.
- The repository carries third-party text and scripts, so each one needs its license and copyright recorded.

## Alternatives considered

- **Keep them untracked (ADR-0024)**: rejected. It leaves versions unpinned and unreviewed.
- **Adopt the CLI's version 2 lock**: rejected. It blanks hashes, so integrity is no longer checked.

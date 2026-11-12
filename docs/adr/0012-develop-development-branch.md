# 0012. develop development branch

Status: Accepted (2026-11-04)
Spec: #126 (S5, S23)

Amends [0004](0004-one-wave-one-dependency-layer-one-pr.md).

## Context

All work landed directly on `main`, which is also the branch releases are cut from. With stricter ADR checks and CI hardening in place, a release candidate needs a place to accumulate and be verified before it reaches `main`. [ADR-0004](0004-one-wave-one-dependency-layer-one-pr.md) fixes the landing unit (one wave, one PR) but not the target branch; it targets trunk, and trunk was `main`.

## Decision

`develop` is the development branch and the `/forge` trunk (`repo.trunk: "develop"` in `forge.config.json`). `main` holds released history only.

- Wave PRs, Renovate PRs and feature branches target `develop` and are squash-merged, so `develop` stays linear.
- A release PR from `develop` to `main` is merged with a merge commit, so `main` keeps the squashed history and records each release as a merge. `release.yml` still requires the tag to be on `main`.
- `ci.yml` and `labels.yml` run on push to `main` and `develop`. Renovate uses `baseBranchPatterns: ["develop"]`.
- Three rulesets live under `.github/rulesets/` as code: `main` (merge commits only, required checks, signed commits, no deletion or force-push), `develop` (squash only, linear history, required checks) and `tags` (`v*` protected from update and deletion). `tools/rulesets.test.ts` asserts that every required check context matches a real job `name:` in `.github/workflows`.
- ADR-0004 is amended only in its landing target: a wave is still one dependency layer and one PR (or one local merge under [ADR-0010](0010-local-merge-landing.md)), but it now lands on `develop` rather than `main`.
- The new ADR checks (`tools/adr-invariants.test.ts`) apply as written: this record has the four sections, a dated Status line and an index row.

## Consequences

- `/forge` PRs target `develop`; a release is a deliberate `develop` to `main` merge-commit PR.
- The `develop` branch itself and the rulesets are created outside the repository by the maintainer; the apply command is in CONTRIBUTING.
- Renaming a required job in a workflow requires updating the rulesets in the same change, or `bun run test` fails.
- Two long-lived branches need the release PR to keep them in sync; `main` may carry merge commits that `develop` lacks until the next sync.

## Alternatives considered

- **Keep `main` as trunk**: rejected because there is no pre-release verification point and no way to require signed commits on release history only.
- **Squash for both branches**: rejected because squashing `develop` into `main` rewrites the relationship between the branches and causes repeated conflicts.
- **Rebase merges on `develop`**: rejected because a wave PR is one logical change and squash yields one commit with a conventional title.

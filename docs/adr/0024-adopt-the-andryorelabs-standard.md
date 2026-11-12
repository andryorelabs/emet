# 0024. Adopt the andryorelabs standard

Status: Accepted (2026-11-11)
Spec: the andryorelabs standard v1 adoption spec, filed 2026-11-11

## Context

The six andryorelabs repos (animated-fluent-emojis, snug, emet, andryore-web, jobship, aokit) had drifted apart in repo settings, community files, README shape, tooling names, CI gates and brand credit. On 2026-11-11 one session per repo audited all six and voted a shared standard, rule by rule. The technical pages live in [aokit `docs/standards`](https://github.com/andryorelabs/aokit/tree/main/docs/standards), and the public brand rules live in the brand kit of [andryore-web](https://github.com/andryorelabs/andryore-web/tree/main/docs/brand).

## Decision

- emet adopts the andryorelabs standard v1. A gap against a rule marked MUST is closed here, in emet's own run; no repo edits another.
- The standard does not replace emet's ADRs. Where a rule and an ADR disagree, the exemptions below apply.
- Names: "Andry Orellana" is the person (LICENSE, manifest author), "AndryOre" is the brand (credit line, linked to `https://andryore.dev`), and `andryorelabs` is the GitHub org.
- The Claude Code roles that default to Opus (reviewer tiers, fix-cap escalation) run on `opus` in this repo's `emet.config.json`, the same as the shipped defaults. They were set to `fable` at first and moved back to `opus` in #479.

Exemptions and rules that do not apply:

- **Merge methods on `main`**: `main` takes merge commits from `develop` and has no linear-history rule ([ADR-0012](0012-develop-development-branch.md)). `develop` follows the trunk rules (squash only).
- **npm fields and trusted publishing**: emet publishes no npm package. The same fields go on the plugin manifests.
- **Stale-name check**: "forge" stays in the legacy-name compatibility layer ([ADR-0015](0015-rename-to-emet-with-legacy-name-compatibility.md)), in ADRs and in CHANGELOG history.
- **`skills-lock.json`**: stays untracked, because the third-party skills under `.claude/skills/` are untracked too.
- **`FUNDING.yml`**: only andryore-web carries one.

## Consequences

- Live GitHub settings are applied from `.github/rulesets/*.json`, and `bun run repo-settings:check` reports drift.
- `emet init` writes a public `$schema` URL served by the Website, so a config no longer carries a machine path. The other five repos adopt it after the release that ships it.
- Script and config names match the other repos (`format:write`, `oxlint.config.ts`, `knip.jsonc`), so a habit learned in one repo holds in the next.
- Every workspace gets a coverage floor that only rises.
- A later change to the standard is voted across the repos first, then recorded here with a `Revised:` line.

## Alternatives considered

- **A shared config package**: rejected for now. It couples six release cycles for files that rarely change, and aokit already generates them for new Projects.
- **Copy the standard into every repo**: rejected. Six copies drift; one canonical text and one adoption ADR per repo do not.

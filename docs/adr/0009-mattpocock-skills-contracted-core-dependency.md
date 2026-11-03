# 0009. mattpocock-skills as a contracted core dependency

Status: Accepted (2026-11-03)
Spec: #88

## Context

forge prompts call mattpocock-skills such as `tdd`, `to-spec` and `pr`. Skill renames or removals break runs silently.

## Decision

mattpocock-skills is a declared plugin dependency with no version range in the manifest. `forge/src/skills.ts` lists the skill names forge's prompts use and a tested version range. `forge doctor` and `forge preflight` report a missing skill by name (blocking in preflight) and an out-of-range version (warning). A test asserts every skill name in installed prompts is in the contract.

## Consequences

- Skill drift surfaces at preflight instead of mid-run.
- The contract must be updated when prompts use a new skill.
- forge is coupled to an external plugin's naming.

## Alternatives considered

- **Copy the skills into this repo**: rejected, it forks upstream.
- **Soft optional dependency**: rejected, prompts fail without the skills.
- **Pin an exact version**: rejected, it blocks compatible upgrades.

# Reviewer dispatch prompt

Fill each `{{placeholder}}` and paste as the whole prompt of the Phase 8
`Agent({subagent_type: "emet:emet-reviewer"})` call. Once per wave, after every
branch is merged into the integration branch, before pushing it.

---

Review `{{integration_branch}}` (base `{{base_branch}}`, {{ticket_count}}
tickets). Risk tier: `{{risk_tier}}` (`emet assess`, already raised by any
worker `Risk:` line).

Diff: read the file `{{diff_path}}` FIRST, before any worker report. Read
only what it touches plus needed context.

Spec {{spec_id}}: read its `## Specs` via `{{spec_read_call}}`. Give a verdict
per covered S#: `S<n>: met | partial | unmet`, reason, `file:line`. Partial or
unmet is a finding.

Project skills: {{project_skills}}. Read each `.claude/skills/<name>/SKILL.md`;
a clear violation is a finding.

Standards axis: check the diff against the repo's documented coding
standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md`, whichever
exist); a clear violation is a finding.

Spec axis: the per-S# verdicts above; code that does not match what the spec
asked for is a finding.

Lenses: medium = correctness + verification-gap; high adds security/resilience.
Verification-gap: one finding per gap, "one test that would catch <named
regression>".

Emit a JSON array, also written to `.emet/review-{{run_id}}.json` (the exact
input of `emet review --ticket <t> --findings <file|->`):

```json
[
  {
    "id": "F-001",
    "file": "a.ts",
    "line": 42,
    "severity": "blocker",
    "kind": "patch",
    "claim": "failure scenario"
  }
]
```

`severity`: blocker|critical|major|minor|nit. `kind`: intent_gap|bad_plan|
patch|defer (triaged in that order). `line` is an integer, `id` stable across
rounds, no other fields; `[]` = nothing blocks.

Refuter: once, over all blocker/critical findings together, try to refute them;
drop or downgrade what you refute.

## Recheck variant

Give the reviewer only the findings file and the fix diff:

```
Recheck round {{round}} of 2 on `{{integration_branch}}`. Findings:
`.emet/review-{{run_id}}.json`; fix diff: `{{diff_path}}`
(`git diff {{reviewed_sha}}..HEAD`). Re-emit the array minus fixed findings. A
new blocker/critical must cite a prior id or a file in the fix diff, else
`kind: "defer"`.
```

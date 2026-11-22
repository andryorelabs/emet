# Reviewer dispatch prompt

Fill each `{{placeholder}}` and `emet review-run` builds it for the Phase 8 review call. Once per wave, after every
branch is merged into the integration branch, before pushing it.

---

Review `{{integration_branch}}` (base `{{base_branch}}`, {{ticket_count}}
tickets). Risk tier: `{{risk_tier}}` (`emet assess`, already raised by any
worker `Risk:` line).

Diff: read the file `{{diff_path}}` FIRST, before any worker report. Read
only what it touches plus needed context.

Spec {{spec_id}}: read its `## Specs` via `{{spec_read_call}}`. Give a verdict
per covered S#, written to the Coverage verdicts file
`.emet/coverage-{{run_id}}.json`: `[{"s": "S1", "verdict": "met", "test":
{"file": "a.test.ts", "name": "parses x"}}]`. `verdict` is `met|partial|unmet`;
`test` names the test that proves a `met`. Partial or unmet is a finding.

Project skills: {{project_skills}}. Read each `.claude/skills/<name>/SKILL.md`;
a clear violation is a finding.

Standards axis: check the diff against the repo's documented coding
standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, `AGENTS.md`, whichever
exist); a clear violation is a finding.

Spec axis: the Coverage verdicts above; code that does not match what the spec
asked for is a finding.

{{browser_verify}}

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
    "claim": "failure scenario",
    "s": "S1",
    "userOption": "S2"
  }
]
```

`severity`: blocker|critical|major|minor|nit. `kind`: intent_gap|bad_plan|
patch|defer (triaged in that order). `line` is an integer, `id` stable across
rounds. `s` (`"S<n>"`) only on a finding tied to one S#; `userOption`
(`"S<n>"`) only on a finding that contradicts a `(user option)` S#. No other
fields; `[]` = nothing blocks.

Refuter: once, over all blocker/critical findings together, try to refute them;
drop or downgrade what you refute.

## Browser axis text

The text `{{browser_verify}}` is filled with, only when `emet assess` printed
`browserVerify.run: true` (otherwise it is empty and the review runs as
before):

```
Browser axis: start `verify.browser.startCommand` from `emet.config.json` and
wait for `verify.browser.url`. Load the tool's own instructions with
`agent-browser skills get core`. Use `--session review-{{run_id}}` on every
command. Walk the pages the diff touches with `snapshot -i`, `errors` and
`console`. Write screenshots to a file, never inline, and read one only when
needed. Each UI or console error is a finding with the `file:line` of the
likely cause. Close the session and the server when done. If a command fails
twice, fall back to Chrome DevTools MCP or emit a `verification-gap` finding;
never block the wave.
```

## Recheck variant: fix round

Used under `gate.onHold: fix-and-continue`. Give the reviewer only the findings
file and the fix diff:

```
Recheck round {{round}} of {{fix_rounds}} on `{{integration_branch}}`. Findings:
`.emet/review-{{run_id}}.json`; fix diff: `{{diff_path}}`
(`git diff {{reviewed_sha}}..HEAD`). Emit a JSON array of `{id, resolved}`, one entry per
finding in the file (`resolved: true` only if the fix diff fixes it). Do not
re-emit findings; new issues are not part of a recheck.
```

Recorded with `emet review --recheck --verdicts`.

## Recheck variant: stop-mode re-review

Used under `gate.onHold: stop`. Give the reviewer only the findings file and
the fix diff:

```
Recheck round {{round}} of 2 on `{{integration_branch}}`. Findings:
`.emet/review-{{run_id}}.json`; fix diff: `{{diff_path}}`
(`git diff {{reviewed_sha}}..HEAD`). Re-emit the array minus fixed findings. A
new blocker/critical must cite a prior id or a file in the fix diff, else
`kind: "defer"`.
```

Recorded with `emet review --findings`.

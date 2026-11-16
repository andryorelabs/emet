# Rulesets and repository settings

The GitHub configuration of this repository lives here as code. A maintainer
applies it by hand; no script or workflow writes it. `bun run repo-settings:check`
reads the live configuration through `gh api` (GET only) and exits 1 naming
each key that differs from these files.

## Files

| File                                             | What it holds                                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`main.json`](main.json)                         | `main`: merge commits only, signed commits, resolved threads, no deletion or force push.                                                             |
| [`develop.json`](develop.json)                   | `develop`: squash only, linear and signed history, resolved threads, up-to-date branches, no deletion or force push.                                 |
| [`tags.json`](tags.json)                         | `v*` tags: no update, deletion or force push.                                                                                                        |
| [`../repo-settings.json`](../repo-settings.json) | Merge buttons and commit titles, description, homepage, topics, default branch, features, security and analysis, Actions token and fork-PR approval. |

`main` and `develop` both require the `CI passed`, `Validate PR title` and
`Check markdown links` checks. Each name must match a job `name:` in
`.github/workflows`; `tools/rulesets.test.ts` enforces it, together with the
invariants between the rulesets, `repo-settings.json` and
[CONTRIBUTING](../../CONTRIBUTING.md).

## Applying a ruleset

Create a ruleset:

```sh
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
```

Update an existing one: find its id with `gh api repos/{owner}/{repo}/rulesets`,
then run `gh api -X PUT repos/{owner}/{repo}/rulesets/<id> --input .github/rulesets/main.json`.

## Applying the repository settings

Each key of `repo-settings.json` maps to one place in GitHub:

| Keys                                                                                                         | Where                                                                       |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `description`, `homepage`, `default_branch`, merge buttons, commit titles, `delete_branch_on_merge`, `has_*` | `PATCH repos/{owner}/{repo}`                                                |
| `topics`                                                                                                     | `PUT repos/{owner}/{repo}/topics`                                           |
| `secret_scanning`, `secret_scanning_push_protection`                                                         | `security_and_analysis` on `PATCH repos/{owner}/{repo}`                     |
| `dependabot_alerts`                                                                                          | `PUT repos/{owner}/{repo}/vulnerability-alerts`                             |
| `dependabot_security_updates`                                                                                | `PUT repos/{owner}/{repo}/automated-security-fixes`                         |
| `private_vulnerability_reporting`                                                                            | `PUT repos/{owner}/{repo}/private-vulnerability-reporting`                  |
| `default_workflow_permissions`, `can_approve_pull_request_reviews`                                           | `PUT repos/{owner}/{repo}/actions/permissions/workflow`                     |
| `fork_pr_contributor_approval`                                                                               | `PUT repos/{owner}/{repo}/actions/permissions/fork-pr-contributor-approval` |
| `code_scanning_default_setup`                                                                                | Stays `not-configured`: the advanced `codeql.yml` workflow owns CodeQL.     |

The `description` is the short description selected in
[docs/brand/copy.md](../../docs/brand/copy.md); a test keeps the two in step.

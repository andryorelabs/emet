# Models and effort

`/emet` picks a model and a reasoning effort per role automatically; there is nothing to switch by hand mid-run. Every key is in the [configuration reference](../reference/configuration.md#models).

| Role                                           | Model                  | Effort              | Set by                                      |
| ---------------------------------------------- | ---------------------- | ------------------- | ------------------------------------------- |
| Planning (Phases 1–4)                          | Opus, via `opusplan`   | your session's      | you, once                                   |
| Coordinator, Phase 5 on                        | Sonnet, via `opusplan` | your session's      | you, once                                   |
| Workers (Phase 7)                              | Sonnet                 | `medium`            | `agents/emet-worker.md`, or `models.worker` |
| Review, `passive` tier (docs-only diff)        | none                   | —                   | `emet assess`                               |
| Review, `medium` tier (ordinary source change) | Opus                   | `medium`            | `models.reviewer.medium`                    |
| Review, `high` tier (risky paths or sinks)     | Opus                   | `medium` by default | `models.reviewer.high`                      |
| CI-log triage (Phase 8)                        | Haiku                  | —                   | `models.triage`                             |

The two agent definitions (installed by `install.sh` to `~/.claude/agents/`) pin their own `model`/`effort` in frontmatter, so the coordinator's own model/effort choice never leaks into a worker or the reviewer. `emet doctor` reports (never blocks on) either file going missing. `emet preflight` does block dispatch when `emet-worker` or `emet-reviewer` is missing, because Phase 6 and Phase 8 dispatch by `subagent_type`.

## Risk-tier routing

Phase 8 runs `emet assess --base <trunk> --head <integration branch>`, which classifies the diff deterministically and prints JSON with the tier, the reasons and the recommended reviewer model/effort:

- `passive`: docs-only diff; no reviewer is dispatched.
- `medium`: the reviewer runs on `models.reviewer.medium`.
- `high`: the diff touches auth, security, payments, webhooks, CI, the installer, lockfiles, migrations, a dangerous sink (raw SQL, pipe-to-shell and the like) or a path matching `review.highRiskPaths`. The reviewer runs on `models.reviewer.high`, and auto-merge lands the PR only with green checks and no open review finding.

A ticket that touches high-risk paths can carry a `Model:` line (for example `Model: opus` or `Model: opus/high`), which overrides `models.worker` for that worker only.

## Haiku triage

The coordinator never reads a CI log whole. A failing check is handed to an agent on `models.triage` (default `haiku`), which returns at most about 2k tokens with `file:line` pointers for the fix.

## Config

Every key is optional, and the defaults reproduce the table above:

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` is a list of extra case-insensitive path substrings that force the `high` tier. To get more scrutiny on risky waves, raise `models.reviewer.high.effort` (for example to `high`).

## Why a single reviewer

Why a single fresh-context reviewer instead of a multi-angle fan-out: no public benchmark compares the two directly, but a fan-out re-reads the whole diff once per angle and has hung for over an hour in this repo, while Anthropic and third-party reports on Opus-tier models suggest the model upgrade buys as much as the extra angles would. For a high-stakes wave, run `/code-review ultra` by hand afterward; `/emet` never dispatches that on its own.

## What you set once, yourself

`/emet` can't switch these mid-run:

- `model: "opusplan"` in `~/.claude/settings.json`: this is what makes Phases 1–4 run on Opus and Phase 5 onward run on Sonnet, with no `/model` needed. `emet doctor` warns (never edits your settings) if it's unset.
- A session effort of `medium` or `high` rather than `xhigh`: the workers and reviewer already carry their own effort regardless of yours, and a high global default mostly adds cost to the coordinator's own turns (dispatch bookkeeping, merges, reports) that don't need it.
- `permissions.defaultMode` able to run unattended (`auto`, `acceptEdits`, or `bypassPermissions`), plus `permissions.deny` rules blocking `git push * main|master` and `git push --force *`. `emet doctor` warns on both, since a wave that stalls on a permission prompt or that can force its way past the trunk branch defeats the point of running unattended.

These are starting points, not settled numbers. Opus 5.5 launched 2026-09-22, and effort/model choice for coding agents is still an active area; re-tune after a few real waves rather than treating this table as final.

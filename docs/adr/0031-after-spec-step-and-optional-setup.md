# 0031. An after-spec step per repo type, and an optional setup

Status: Accepted (2026-11-18). Amended by [0037](0037-landing-per-spec.md): the after-spec step runs after the spec branch lands.
Amended: 2026-11-19, path-based after-spec rules and a deploy check that no longer depends on the mode
Spec: the manual-work reduction spec, spec 3 of 3 (S1, S2, S7, S8)

Amends [0012](0012-develop-development-branch.md).

## Context

[ADR-0012](0012-develop-development-branch.md) makes `main` hold released history only and makes a release a deliberate `develop` to `main` merge-commit pull request. That fits a CLI, a plugin or a library. In a deployed application with a `develop` branch and no version tags, the person merges `develop` into `main` by hand after every spec so the site deploys. Of the 12 repositories that use emet, five release with tags, three are deployed applications and four work directly on `main`.

`install.sh` and the plugin install the commands and nothing else. The optional pieces, such as Engram, the mascot and the recommended Claude Code settings, are only mentioned in the docs, and a plugin has no install-time hook to offer them.

## Decision

- `handoff.afterSpec` is `release`, `promote` or `none` and defaults to `none`. `emet init` detects it: a `v*` tag plus a workflow named for releases gives `release`; a `develop` branch without those gives `promote`.
- `promote` opens a `develop` to `main` pull request, waits for CI, merges it with a merge commit and opens a sync pull request back to `develop` only if `develop` is behind. `release` opens the release pull request and stops for a person. Neither runs when CI is not green, when the last wave was flagged or left open, or when the run was started with `--no-promote`.
- `deploy.check` is an optional command that `emet deploy-check` retries until it succeeds or times out; `promote` runs it after the merge.
- `emet setup` offers the optional installs with prompts, and installs exactly what is named when there is no terminal or `--with` is given. Each step reports its own result and one failure does not stop the rest. Claude Code settings are changed only when chosen, after a backup.
- The plugin reaches `emet setup` through `/emet:setup` and a SessionStart notice shown once, because a plugin has no install hook. `install.sh` calls `emet setup` when stdin is a terminal.
- Engram stays out of the plugin's `dependencies`, which cannot be optional. `doctor` and `init` recommend it.
- **Prompt, installer and hook exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to the paragraphs of `emet/reference/phases-1-5.md` and `emet/reference/phases-9-handoff.md` that describe the after-spec step, the deploy check and the research before an interview question. The rule that `install.sh` does not change without an explicit ticket does not apply to its call to `emet setup`, and the SessionStart hook gains the one-time notice. Both are the tickets of spec 3 that own them.

## Consequences

- A deployed application reaches `main` without a manual merge, and `--no-promote` or `afterSpec: none` restores the old behaviour.
- A repository without the signals stays on `none`, so no existing repo starts merging into `main` on its own.
- A second pull request appears only when `develop` is behind `main`.
- A new user can pick the optional installs in one place, and a fresh plugin session says so once.

## Alternatives considered

- **Promote for every repo**: rejected because a repo that releases with tags must keep a person in the loop for the version.
- **Ask in each interview**: rejected because the answer is the same for a repo every time; the interview still asks when a spec needs a different outcome, through `--no-promote`.
- **Put Engram in `dependencies`**: rejected because dependencies cannot be optional.
- **A hook that runs at plugin install**: rejected because Claude Code has none.

## Amendment (2026-11-19)

### Context

Three of the repositories that use emet hold a published package or CLI and a Website that deploys from `main`, and two others work on `main` and deploy on every merge. A single `handoff.afterSpec` per repository cannot tell a Website-only spec, which should deploy without a release, from a CLI spec, which must stop at a release pull request. `deploy.check` ran only inside `promote`, so a repository whose waves already land on `main` never ran it.

### Decision

- `handoff.afterSpec` is either the string above or an ordered list of rules `{ paths?, mode }`. A rule matches when every path that promoting `develop` would carry into `main` matches one of its globs; the first match wins, the rule without `paths` is the fallback, and with no fallback the mode is `none`. A mixed set of paths therefore falls to the fallback, so a CLI change never reaches `main` without a tag.
- The paths are read when `emet promote` runs, from `origin/main...origin/develop`. Nothing about a spec's paths or start is stored. The string form ignores paths and behaves as before.
- `deploy.check` has an optional `paths` filter and is decoupled from the mode. It runs after a merge that reached the branch that deploys: a merged `promote` whose changed paths match, or the clean final wave when the trunk is `main`. It never runs in `release` mode, because the deploy waits for a person.
- `emet promote` now runs after every spec's last wave, including with `none`, and reports the rule it used and whether the deploy check should run; the prompt runs `emet deploy-check` only then.
- The prompt exception above also covers the rewritten after-spec and deploy-check paragraph of `emet/reference/phases-9-handoff.md`.

### Consequences

- A Website-only spec in a mixed repository is promoted and deployed with no release; any CLI change in `develop` sends the next promote down the release path.
- A repository on the string form changes nothing.
- A broken `git fetch` or `git diff` fails `emet promote` instead of being read as "no paths".

### Alternatives considered

- **Store the spec's start sha and changed paths**: rejected because `promote` already compares exactly what would reach `main`, which is also what the release safety needs, and it adds run state to keep in sync.
- **One `afterSpec` per directory**: rejected because the choice depends on the whole set of changed paths, not on each one.

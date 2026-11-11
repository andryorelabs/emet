# Development

How to work on emet itself. Terms follow [GLOSSARY.md](../GLOSSARY.md). Coding agents also read [AGENTS.md](../AGENTS.md); the decisions behind these rules live in [docs/adr/](adr/README.md).

## Setup

A fresh checkout needs both installs, because `emet/` stays outside the bun workspaces ([ADR-0018](adr/0018-bun-workspaces-monorepo-with-emet-outside.md)):

```sh
bun install
bun install --cwd emet
```

Use bun only. `emet selftest` runs `bunx tsc` from the installed copy, so `emet/package.json` keeps `typescript`. Dev dependencies and config live at the root or in `tools/`; `emet/` gains none ([ADR-0001](adr/0001-root-dev-tooling-package-separate-from-runtime.md)).

## Scripts

Run these from the repo root.

- `bun run check`: turbo runs each workspace's `check` and the root-only `check:root` (typecheck, lint, format check, knip, docs link check, map freshness).
- `bun run test`: turbo runs each workspace's `test` and the root-only `test:root` (`tools/` tests, then the `emet/` tests with coverage). It fails when the line or function coverage of `emet/` or `apps/site` drops below its floor in `tools/coverage-floors.json`, which `tools/coverage-gate.ts` enforces.
- `bun run fix`: format and autofix lint.
- `bun run format:write`: format only. `bun run format:check` verifies.
- `bun run lint:commits`: commitlint over the commits since the merge base with `origin/develop`.
- `bun run build:codex`: regenerate `codex/` and `.codex-plugin/`; `bun run check:codex` verifies them. Never hand-edit those paths.
- `bun run ci:local`: install, `check`, `test` and `lint:commits`, as CI does.

Do not run a build unless asked. Never loosen a tsconfig or lint setting to pass a check; fix the code ([ADR-0002](adr/0002-oxc-toolchain-and-typescript-7-typecheck.md)). Typecheck with the aliased `typescript7` by path, never bare `tsc`.

## Branches and commits

- Feature branches always; never push to `main` or `develop`. Worker branches are `cla-<n>-<slug>`; other branches use a conventional type prefix such as `feat/` or `chore/`.
- `develop` is the trunk. Wave PRs squash into `develop`; releases merge `develop` into `main` with a merge commit ([ADR-0012](adr/0012-develop-development-branch.md)).
- Commits are gitmoji plus conventional, in English, with a bullet body, for example `feat: ✨ add user authentication`. A ticket's commit body ends with `Refs: #<n>`.
- PR titles use the same conventional types as commitlint.
- Comments are JSDoc only ([ADR-0003](adr/0003-jsdoc-only-comments.md)).

## Hooks

Husky wires three Git hooks:

- `commit-msg` runs commitlint on the message.
- `pre-commit` runs lint-staged on the staged files.
- `pre-push` runs `tools/pre-push.ts`: it refuses a push to `main` or `develop`, refuses a branch name outside the allowed patterns, and runs the typecheck and format check. Tag pushes pass.

For agents, `.claude/settings.json` adds the `rm-guard` PreToolUse hook and push denies; see [security.md](security.md).

## Runners

CI runs on Linux and macOS ([ADR-0007](adr/0007-macos-support.md)); Windows is unsupported except through WSL. Most jobs run on the runner named by the `BLACKSMITH_RUNNER` repository variable and fall back to `ubuntu-latest`; a pull request from a fork always uses `ubuntu-latest`. The macOS job uses `macos-latest`. The release, site deploy, CodeQL and Scorecard workflows use `ubuntu-latest`.

Locally, the host-wide worker slot pool lives in `~/.local/state/emet/slots`, not in this repo.

## Releases

A release is a signed tag on `main`. The runbook is [how-to/cut-a-release.md](how-to/cut-a-release.md): bump `.claude-plugin/plugin.json`, run `bun run build:codex`, move the `CHANGELOG.md` section, land the release PR in `develop`, merge `develop` into `main` with a merge commit, then create the tag with `git tag -s` and verify it with `git tag -v`. Pushing the tag runs the Release workflow, which checks CI, fails when `CHANGELOG.md` has no section, or an empty one, for the tag, and publishes the standalone binaries. The `cut-release` skill walks an agent through the same steps.

## Rulesets

Branch and tag protection is kept as code in `.github/rulesets/`:

- `develop.json`: squash-only, linear history, required checks `CI passed` and `Validate PR title`.
- `main.json`: merge commits only ([ADR-0012](adr/0012-develop-development-branch.md)).
- `tags.json`: blocks deletion, update and force push on `refs/tags/v*`.

None has bypass actors. Workers never run `gh api` against repo settings. The coordinator applies the files to GitHub, and a worker that needs a change edits the JSON in its PR and says so in its handoff note.

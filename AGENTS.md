# AGENTS.md

Guide for coding agents working in emet. Terms follow [GLOSSARY.md](GLOSSARY.md).

## Layout

- `emet/`: the runtime `emet` CLI (`bin/`, `src/`, `reference/` prompts, `schema/`, `templates/`). Installed to `~/.claude/emet` by `install.sh`.
- `commands/run.md`, `agents/*.md`: prompts for the `/emet:run` plugin command (`/emet` after `install.sh`) and its worker and reviewer agents. `install.sh` rewrites them and installs `commands/run.md` as `~/.claude/commands/emet.md`. See [ADR-0008](docs/adr/0008-standalone-binaries-and-plugin-distribution.md).
- `tools/`: dev-only tests and scripts (lint plugin, invariant tests).
- `docs/agents/`: per-repo `/emet` config prose. `docs/adr/`: architecture decisions.
- Root: dev tooling config. `emet.config.json` is this repo's `/emet` config.

## Running scripts

Run from the repo root with bun.

- `bun run check`: typecheck, lint, format check, knip, docs link check.
- `bun run test`: `tools/` tests, then the `emet/` tests.
- `bun run fix`: format and autofix lint.
- build: do not run unless explicitly asked.

## Rules

- Bun only; never mix package managers. See [ADR-0001](docs/adr/0001-root-dev-tooling-package-separate-from-runtime.md).
- Dev dependencies and config live at the root or in `tools/`; `emet/` gains none. See ADR-0001.
- Never loosen a tsconfig or lint setting to pass a check; fix the code. See [ADR-0002](docs/adr/0002-oxc-toolchain-and-typescript-7-typecheck.md).
- Typecheck with the aliased `typescript7` by path, never bare `tsc`. See ADR-0002.
- `install.sh` and the runtime behaviour of the `emet` CLI must not change without an explicit ticket. See ADR-0001.
- Installed prompt markdown (`emet/reference/*.md`, `commands/run.md`, `agents/*.md`): whitespace and wrapping only, never wording. See ADR-0001.
- Workers commit to local branches; one wave is one dependency layer and lands as one PR, or as one local merge when `landing.mode` is `merge`. See [ADR-0004](docs/adr/0004-one-wave-one-dependency-layer-one-pr.md), amended by [ADR-0010](docs/adr/0010-local-merge-landing.md).
- Only the coordinator writes the tracker. See [ADR-0005](docs/adr/0005-coordinator-is-the-single-tracker-writer.md).
- CI runs on Linux and macOS; Windows is unsupported except via WSL. See [ADR-0007](docs/adr/0007-macos-support.md), which supersedes [ADR-0006](docs/adr/0006-linux-only-ci.md).
- mattpocock-skills is a contracted core dependency (`emet/src/skills.ts`). See [ADR-0009](docs/adr/0009-mattpocock-skills-contracted-core-dependency.md).

## ADRs

Decisions live in [docs/adr/](docs/adr/README.md). Read those touching your area before changing it, and flag a contradiction instead of overriding it. Add an ADR as `docs/adr/NNNN-kebab-title.md` with a row in the index; `bun run test` fails if they disagree.

## Branch and commit conventions

- Feature branches always; never push to `main` or `develop`. Worker branches are `cla-<n>-<slug>`.
- `develop` is the trunk: wave PRs squash into `develop`, releases merge `develop` into `main` with a merge commit. See [ADR-0012](docs/adr/0012-develop-development-branch.md).
- Commits are gitmoji + conventional, in English, with a bullet body: `feat: ✨ add user authentication`.
- A ticket's commit body ends with `Refs: #<n>`.
- PR titles use the same conventional types as commitlint.

## Code comments

JSDoc only (`/** */`). No `//` comments, except tool directives (`eslint-disable`, `oxlint-disable`, `@ts-expect-error`, `#__PURE__`). See [ADR-0003](docs/adr/0003-jsdoc-only-comments.md).

## Quirks

- `emet selftest` runs `bunx tsc` from the installed copy, so `emet/package.json` keeps `typescript`.
- A fresh worktree needs both `bun install` at the root and `bun install --cwd emet`.
- The host-wide worker slot pool lives in `~/.local/state/emet/slots`, not in this repo.

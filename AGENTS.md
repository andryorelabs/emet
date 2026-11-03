# AGENTS.md

Guide for coding agents working in claude-forge. Terms follow [CONTEXT.md](CONTEXT.md).

## Layout

- `forge/`: the runtime `forge` CLI (`bin/`, `src/`, `reference/` prompts, `schema/`, `templates/`). Installed to `~/.claude/forge` by `install.sh`.
- `commands/forge.md`, `agents/*.md`: installed prompts for the `/forge` command and its worker and reviewer agents.
- `tools/`: dev-only tests and scripts (lint plugin, invariant tests).
- `docs/agents/`: per-repo `/forge` config prose. `docs/adr/`: architecture decisions.
- Root: dev tooling config. `forge.config.json` is this repo's `/forge` config.

## Running scripts

Run from the repo root with bun.

- `bun run check`: typecheck, lint, format check, knip, docs link check.
- `bun run test`: `tools/` tests, then the `forge/` tests.
- `bun run fix`: format and autofix lint.
- build: do not run unless explicitly asked.

## Rules

- Bun only; never mix package managers. See [ADR-0001](docs/adr/0001-root-dev-tooling-package-separate-from-runtime.md).
- Dev dependencies and config live at the root or in `tools/`; `forge/` gains none. See ADR-0001.
- Never loosen a tsconfig or lint setting to pass a check; fix the code. See [ADR-0002](docs/adr/0002-oxc-toolchain-and-typescript-7-typecheck.md).
- Typecheck with the aliased `typescript7` by path, never bare `tsc`. See ADR-0002.
- `install.sh` and the runtime behaviour of the `forge` CLI must not change without an explicit ticket. See ADR-0001.
- Installed prompt markdown (`forge/reference/*.md`, `commands/forge.md`, `agents/*.md`): whitespace and wrapping only, never wording. See ADR-0001.
- Workers commit to local branches; one wave is one dependency layer and lands as one PR. See [ADR-0004](docs/adr/0004-one-wave-one-dependency-layer-one-pr.md).
- Only the coordinator writes the tracker. See [ADR-0005](docs/adr/0005-coordinator-is-the-single-tracker-writer.md).
- CI is Linux only. See [ADR-0006](docs/adr/0006-linux-only-ci.md).

## ADRs

Decisions live in [docs/adr/](docs/adr/README.md). Read those touching your area before changing it, and flag a contradiction instead of overriding it. Add an ADR as `docs/adr/NNNN-kebab-title.md` with a row in the index; `bun run test` fails if they disagree.

## Branch and commit conventions

- Feature branches always; never push to `main`. Worker branches are `cla-<n>-<slug>`.
- Commits are gitmoji + conventional, in English, with a bullet body: `feat: ✨ add user authentication`.
- A ticket's commit body ends with `Refs: #<n>`.
- PR titles use the same conventional types as commitlint.

## Code comments

JSDoc only (`/** */`). No `//` comments, except tool directives (`eslint-disable`, `oxlint-disable`, `@ts-expect-error`, `#__PURE__`). See [ADR-0003](docs/adr/0003-jsdoc-only-comments.md).

## Quirks

- `forge selftest` runs `bunx tsc` from the installed copy, so `forge/package.json` keeps `typescript`.
- A fresh worktree needs both `bun install` at the root and `bun install --cwd forge`.
- The host-wide worker slot pool lives in `~/.local/state/forge/slots`, not in this repo.

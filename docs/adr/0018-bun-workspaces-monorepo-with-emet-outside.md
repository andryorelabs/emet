# 0018. Bun workspaces monorepo with emet/ outside the workspaces

Status: Accepted (2026-11-06)
Spec: emet Website (S1)

## Context

The repo is one root dev-tooling package (`emet-dev`) plus the runtime package in `emet/`, with no workspaces. The Website ([ADR-0019](0019-website-on-coolify-with-astro-and-starlight.md)) needs an app of its own with its own dependencies (Astro, Tailwind, Starlight), and the maintainer's other projects (snug, animated-fluent-emojis) already host such a site as `apps/site` in a bun workspaces monorepo driven by turbo.

`emet/` cannot move. The plugin resolves `${CLAUDE_PLUGIN_ROOT}/emet/...` paths, `install.sh` copies `emet/` with rsync into `~/.claude/emet`, and the package has its own `bun.lock` and a dependency on `typescript` for `emet selftest` ([ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md), [ADR-0008](0008-standalone-binaries-and-plugin-distribution.md)).

## Decision

- The root `package.json` declares `workspaces: { packages: ["apps/*", "packages/*"], catalog: {...} }`. Shared versions live in the bun catalog.
- Turbo runs the per-workspace tasks. Root `check` and `test` call `turbo run`, with root-only tasks (`//#check:root`, `//#test:root`) for what is not a workspace (typecheck of `emet/`, lint, format, knip, docs link check, tool tests).
- `emet/` stays at the repo root and outside the workspaces. It keeps its own `bun.lock` and `bun install --cwd emet`.
- Dev dependencies of the Website live in `apps/site` and the root catalog. `emet/` gains none ([ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md)).
- One root `bun.lock` covers the workspaces; `emet/bun.lock` stays separate.

## Consequences

- A fresh worktree runs `bun install` at the root, then `bun install --cwd emet`, as before.
- CI runs workspace tasks with `--affected`, so a docs or runtime change does not rebuild the Website.
- Runtime behaviour, `install.sh`, `commands/`, `agents/` and `.claude-plugin/` are untouched.
- Adding a second app or a shared package later needs no layout change.

## Alternatives considered

- **Move `emet/` to `packages/emet`**: matches the maintainer's other repos, but breaks installed plugin paths and the `install.sh` copy, and needs a runtime ticket ADR-0001 forbids here.
- **Nx instead of turbo**: heavier, and every sibling repo already uses turbo.
- **No monorepo, `site/` with its own lockfile**: no workspace tooling, but the Website would not share the catalog, the root checks or the CI affected-graph, and it would differ from the maintainer's other repos.

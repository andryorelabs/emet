# emet/AGENTS.md

Runtime-only rules for the `emet` CLI in this directory. Everything else is in the root [AGENTS.md](../AGENTS.md); read it for repo-wide rules, scripts and conventions.

- `emet/` gains no dependencies. Dev dependencies live at the root or in `tools/`. See [ADR-0001](../docs/adr/0001-root-dev-tooling-package-separate-from-runtime.md).
- `emet/package.json` keeps `typescript`: `emet selftest` runs `bunx tsc` from the installed copy.
- A fresh worktree needs `bun install --cwd emet` as well as `bun install` at the root.
- The runtime behaviour of the CLI and `install.sh` do not change without an explicit ticket.
- Comments are JSDoc only. See [ADR-0003](../docs/adr/0003-jsdoc-only-comments.md).
- Prompt markdown in `reference/`: whitespace and wrapping only, never wording.
- Module map: [docs/architecture.md](../docs/architecture.md).

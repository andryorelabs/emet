# 0001. Root dev-tooling package separate from the runtime `forge/`

Status: Accepted (2026-11-03)
Spec: #73 (S1)

## Context

`install.sh` copies `forge/` to `~/.claude/forge`, and `forge selftest` runs `bunx tsc` from that installed copy. Whatever `forge/package.json` declares is what lands on every user's machine. Linting, formatting, dead-code detection, git hooks and commit linting are contributor concerns and would otherwise ship with the runtime.

## Decision

A root `package.json` and `bun.lock` hold dev-only tooling (oxlint, oxfmt, knip, husky, lint-staged, commitlint, the aliased TypeScript 7 compiler) and pin `"packageManager": "bun@1.4.4"`. `forge/package.json` stays the runtime and selftest package and keeps `typescript` so `forge selftest` still works from `~/.claude/forge`. Every config file and test lives at the root or in `tools/`. `forge/` gains no dev dependencies. `install.sh` is unchanged, and `forge.config.json` `worktree.bootstrap` installs both roots with `--frozen-lockfile`.

## Consequences

- The installed copy ships without any dev tooling, which a test can assert by installing into a temporary `$HOME`.
- A fresh worktree needs two installs, handled by the bootstrap step.
- Two lockfiles must be kept in sync by Renovate and cached by CI on both.

## Alternatives considered

- **Move dev tooling into `forge/package.json`**: rejected because it would ship with the installed runtime and change what `install.sh` copies.
- **Bun workspaces**: rejected because they hoist dependencies into one `node_modules` and blur the runtime boundary.
- **No root package, global tools only**: rejected because it makes checks irreproducible across machines and CI.

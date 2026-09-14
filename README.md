# claude-forge

The global `/forge` command for [Claude Code](https://claude.com/claude-code):
interview → spec → tickets → one approval → parallel worktree agents that
implement, test, and merge a feature unattended.

Runs in any git repo — bun, pnpm, npm, Go, Rust, Python — with a tracker of
Linear, GitHub Issues, or none at all. Nothing project-specific is required
beyond running `forge init` once.

## Install

```bash
git clone git@github.com:AndryOre/claude-forge.git
cd claude-forge
./install.sh
```

This copies the CLI to `~/.claude/forge`, the command to
`~/.claude/commands/forge.md`, and a `forge` wrapper to `~/.local/bin/forge`.
Re-running it is safe — it just overwrites its own previous install.

Verify it worked:

```bash
forge selftest
```

## Dependencies

- **[bun](https://bun.sh)** — required, the CLI runs on it.
- **The `mattpocock-skills` plugin** (`claude-plugins-official` marketplace)
  — `/forge`'s interview/spec/ticket phases call skills that live there.
  `forge init` checks for this and prints the exact install command if it's
  missing:
  ```
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```
- **`gh` CLI, authenticated** — only if the repo ends up using the `github`
  tracker. `forge init` checks and tells you if it's missing or not logged
  in.
- **A Linear MCP server in `.mcp.json`, authenticated** — only if the repo
  uses the `linear` tracker (autodetected from that same `.mcp.json`).

Everything above is a *check*, never an automatic install/login on your
behalf — `forge init` only ever tells you what to run.

## Use

In any git repo:

```bash
forge init          # autodetects package manager, trunk branch, tracker kind
forge preflight      # confirms the repo is dispatch-ready
```

Then, inside Claude Code:

```
/forge <describe the feature>              # full run: interview through merge
/forge --draft <describe the feature>      # stop after tickets are created
/forge --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`forge init` leaves a `TODO(forge):` marker in the generated
`docs/agents/*.md` files for anything it can't infer on its own (a shared
test-database lock, schema ownership, etc.) — fill those in; `forge
preflight` refuses to dispatch while one remains.

## What's in here

- `forge/` — the CLI (`forge init/doctor/preflight/claims/slots/cleanup/
  usage/handoff/selftest`), its schema, and the doc templates `forge init`
  fills in.
- `commands/forge.md` — the `/forge` command itself (a ~110-line router);
  everything else it needs lives in `forge/reference/`, loaded only when the
  current run's mode needs it.

## Fleet check

Already using this across several repos? `forge doctor` audits any number of
them at once, read-only:

```bash
forge doctor ~/code/*
```

Reports, per repo: valid `forge.config.json`, all four `docs/agents/*.md`
files present, zero leftover `TODO(forge):` markers, and whether the
commands in `commands.selfCheck` actually resolve.

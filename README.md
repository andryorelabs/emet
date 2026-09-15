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
- **`rsync`** — required by `install.sh` to copy the CLI into `~/.claude/forge`.
- **`git`** — required at runtime; nearly every subcommand shells out to it.
- **The `mattpocock-skills` plugin** (`claude-plugins-official` marketplace)
  — `/forge`'s interview/spec/ticket phases call skills that live there.
  ```
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```
- **`gh` CLI, authenticated** — only if the repo uses the `github` tracker.
- **A Linear MCP server declared in `.mcp.json` (or at user scope)** — only
  if the repo uses the `linear` tracker. Declaration is what gets verified;
  whether the connection is actually *authenticated* lives in Claude Code's
  own credential store and can't be checked from here — if a run fails to
  read tickets, restart Claude Code and approve the connection.

None of the above is ever installed or logged in on your behalf. What
changed is *who checks it and how hard*:

| | `forge init` | `forge doctor` | `forge preflight` |
|---|---|---|---|
| plugin missing/disabled | prints the install command | reports it (once, fleet-wide) | **blocks dispatch** |
| `gh` missing/unauthenticated (tracker: `github`) | prints what to run | reports it | **blocks dispatch** |
| Linear server undeclared (tracker: `linear`) | prints a note | reports it | **blocks dispatch** |
| `claude` not on PATH, or a probe timing out | prints a note | reports it | **warns, never blocks** — this is "couldn't check", not "verified broken" |

Every probe is capped at 5s so a stalled `gh auth status` (no network) can't
hang a wave. If a `preflight` block is itself wrong for your environment,
`FORGE_SKIP_DEPENDENCY_CHECKS=1 forge preflight` downgrades it to a warning
for that one run — set it in your own shell, not in anything the `/forge`
coordinator runs unattended.

A repo's `preflight.requiredCommands` (in `forge.config.json`) is a separate,
repo-owned list of binaries `forge preflight`/`forge doctor` require on PATH
— useful for `rg`/`sg`, which the worker prompts offer as faster alternatives
to reading a file whole. `gh` doesn't need to be listed there; the check
above already covers it.

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
  usage/handoff/lock-reason/selftest`), its schema, and the doc templates
  `forge init` fills in.
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
files present, zero leftover `TODO(forge):` markers, whether the commands in
`commands.selfCheck` actually resolve, and that repo's tracker-specific
dependency findings (`gh`, Linear — see Dependencies above). The
mattpocock-skills plugin is checked once for the whole sweep, not per repo.

# claude-forge

The global `/forge` command for [Claude Code](https://claude.com/claude-code):
interview → spec → tickets → one approval → parallel worktree agents that
implement, test, and merge a feature unattended. Each ticket is matched
against the repo's own `.claude/skills/` and carries only the skills
relevant to its task, which workers and the reviewer load in turn.

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
- **The `forge-worker` and `forge-reviewer` agents** in `~/.claude/agents/`
  — installed by `install.sh` (see "Models & effort" below); Phase 6 and
  Phase 8 dispatch by `subagent_type`, so either one missing breaks dispatch.
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
| `forge-worker`/`forge-reviewer` agent missing | — | reports it (once, fleet-wide) | **blocks dispatch** |
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
/forge <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/forge --draft <describe the feature>      # stop after tickets are created
/forge --dispatch <spec-id>                # dispatch a --draft'd spec later
```

`forge init` leaves a `TODO(forge):` marker in the generated
`docs/agents/*.md` files for anything it can't infer on its own (a shared
test-database lock, schema ownership, etc.) — fill those in; `forge
preflight` refuses to dispatch while one remains.

### Landing PRs and chaining waves

One wave is one PR. Its body carries `Closes #N` for each ticket (the
tracker's closing keyword), and the coordinator moves the tickets to in-review
when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open
when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR
then gets the human-decision label). After a merge, `forge cleanup --run
<runId>` frees the wave's branches, ticket claims, and worker slots. Later
waves run in their own sessions, never in the one that ran wave 1. Two optional
`forge.config.json` sections control
what happens next (both validated by `forge preflight`):

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": { "autoChain": false }
}
```

- `pr.autoMerge` (default `true`): wait for the PR's checks and merge; with no
  checks, merge at once. A failing check is fixed and pushed, up to
  `maxCiFixAttempts` times, then the PR is left open for a human. A wave with
  anything flagged is never auto-merged.
- `handoff.autoChain` (default `false`): after a clean, merged wave with more
  waves left, launch the next one with `claude --bg` instead of printing
  `/forge --dispatch <spec-id>`. Inspect it with `claude agents` /
  `claude attach forge-<spec-id>-w<n>`. Requirements:
  1. `claude` on PATH, with `--bg` support.
  2. A trusted workspace. `--bg` runs non-interactively, so the trust dialog
     never shows; open `claude` interactively in the repo once and accept it.
  3. The current session in an unattended permission mode (`auto`,
     `acceptEdits`, or `bypassPermissions`). The next wave inherits it via
     `--permission-mode`; see the `permissions.defaultMode` bullet under
     "Models & effort", which `forge doctor` checks.

  It launches only when the PR merged and nothing was flagged, and it skips
  if a `forge-<spec-id>-*` session is already live (`claude agents --json`).
  If the launch fails, it falls back to printing `/forge --dispatch <spec-id>`.

## What's in here

- `forge/` — the CLI (`forge init/doctor/preflight/claims/slots/cleanup/
  usage/handoff/lock-reason/guard/selftest`), its schema, and the doc
  templates `forge init` fills in. `install.sh` also wires `forge guard` in
  as a Claude Code `PreToolUse` hook (`~/.claude/settings.json`) that blocks
  a handful of known, unattended-run failure triggers (see
  `forge/src/guard.ts`) regardless of whether the current session's context
  happens to include the doc that already asks not to do them.
- `commands/forge.md` — the `/forge` command itself (a ~110-line router);
  everything else it needs lives in `forge/reference/`, loaded only when the
  current run's mode needs it.

## Models & effort

`/forge` picks a model and a reasoning effort per role automatically —
nothing to switch by hand mid-run:

| Role | Model | Effort | Set by |
|---|---|---|---|
| Planning (Phases 1–4) | Opus, via `opusplan` | your session's | you, once |
| Coordinator, Phase 5 on | Sonnet, via `opusplan` | your session's | you, once |
| Workers (Phase 7) | Sonnet | `medium` | `agents/forge-worker.md` |
| Review (Phase 8) | Opus | `medium` | `agents/forge-reviewer.md` |

The two agent definitions (installed by `install.sh` to `~/.claude/agents/`)
pin their own `model`/`effort` in frontmatter, so the coordinator's own
model/effort choice never leaks into a worker or the reviewer. `forge doctor`
reports (never blocks on) either file going missing.

Why a single fresh-context reviewer instead of a multi-angle fan-out: no
public benchmark compares the two directly, but a fan-out re-reads the whole
diff once per angle and has hung for over an hour in this repo, while
Anthropic and third-party reports on Opus-tier models suggest the model
upgrade buys as much as the extra angles would. For a high-stakes wave, run
`/code-review ultra` by hand afterward — `/forge` never dispatches that on
its own.

**What you set once, yourself** — `/forge` can't switch these mid-run:

- `model: "opusplan"` in `~/.claude/settings.json` — this is what makes
  Phases 1–4 run on Opus and Phase 5 onward run on Sonnet, with no `/model`
  needed. `forge doctor` warns (never edits your settings) if it's unset.
- A session effort of `medium` or `high` rather than `xhigh` — the workers
  and reviewer already carry their own effort regardless of yours, and a
  high global default mostly adds cost to the coordinator's own turns
  (dispatch bookkeeping, merges, reports) that don't need it.
- `permissions.defaultMode` able to run unattended (`auto`, `acceptEdits`,
  or `bypassPermissions`), plus `permissions.deny` rules blocking
  `git push * main|master` and `git push --force *` — `forge doctor` warns
  on both, since a wave that stalls on a permission prompt or that can force
  its way past the trunk branch defeats the point of running unattended.

These are starting points, not settled numbers — Opus 5.5 launched
2026-09-22, and effort/model choice for coding agents is still an active
area; re-tune after a few real waves rather than treating this table as
final.

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

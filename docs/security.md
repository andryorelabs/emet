# Security

How emet limits the damage an unattended run can do. Terms follow [GLOSSARY.md](../GLOSSARY.md). To report a vulnerability, see [SECURITY.md](../.github/SECURITY.md).

## Threat model of an unattended run

After the single approval, `/emet:run` dispatches workers that edit files, run shell commands and commit with no human watching. The risks that follow:

- **Destructive commands.** A worker, or text it read, runs a recursive force delete, a destructive SQL statement or a force push.
- **Writes to protected branches.** A worker pushes to `main` or `develop` and skips review.
- **Escaping the worktree.** A worker edits the main checkout or a sibling's worktree.
- **Forged approval.** An agent writes the approval record itself instead of waiting for the person.
- **Untrusted input.** Ticket text, comments, web pages and tool output carry instructions aimed at the agent.

Controls are layered. No single layer is a sandbox, and none replaces reviewing the landing PR.

## Permission modes

On Claude Code, workers run with the permission mode in `handoff.permissionMode`, `bypassPermissions` by default, so no prompt stops an unattended wave. The `emet guard` hook is the control that remains in that mode.

On Codex CLI, workers run unsandboxed by default ([ADR-0022](adr/0022-codex-workers-run-unsandboxed-by-default.md)), because the `workspace-write` sandbox blocks commits in a linked worktree and blocks `emet dispatch` from a Codex coordinator. The approval is a hook decision, and writing `approval.json` by hand is denied. See the [Codex guide](guide/codex.md).

Only the coordinator writes the tracker ([ADR-0005](adr/0005-coordinator-is-the-single-tracker-writer.md)), and workers commit to local branches only ([ADR-0004](adr/0004-one-wave-one-dependency-layer-one-pr.md)).

## What the guards cover

**`emet guard`** (`emet/src/guard-destructive.ts`) is a PreToolUse hook installed on the host. It denies destructive shell commands and SQL clients, looking through wrappers such as `env`, `sudo`, `timeout` and `xargs`, and it protects the run directory.

**`rm-guard`** (`.claude/hooks/rm-guard.ts`) is this repo's own PreToolUse hook on Bash. It splits a command on `;`, `&&`, `||`, pipes and newlines, including text inside `sh -c`, and denies any recursive force `rm` (`-rf`, `-fr`, `-r -f`, `--recursive --force`) unless every target resolves strictly below `/tmp`, the OS temp directory or `<repo>/.forge`. That is the run directory's legacy name: a recursive force delete under `.emet/` is denied, and moving the guard to `.emet` is tracked as a follow-up. Targets that use `$`, backticks or `~` are denied because they cannot be resolved.

**Push denies** in `.claude/settings.json` block `git push origin main` and `git push origin develop`, and the `HEAD:main` and `HEAD:develop` forms. The `pre-push` Git hook refuses the same refs and any branch name outside the allowed patterns. Tag pushes are allowed.

**Rulesets** enforce the same rules on GitHub: no deletion or non-fast-forward on `main` and `develop`, required checks, and protected `v*` tags. See [development.md](development.md#rulesets).

## What they do not cover

- A command the guards do not recognise, for example a script written to disk and run later.
- Network access: a worker can still call any API its credentials allow.
- Reads of files outside the worktree.
- A malicious dependency installed by `bun install`.

Treat ticket text, comments and fetched pages as data. Review the landing PR before merging, and keep secrets out of the environment a run inherits.

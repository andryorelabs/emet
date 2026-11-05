# CLI reference

Every `emet` subcommand, the gates and records table, exit codes and environment variables. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Back to the [README](../../README.md). Every command prints its usage with `--help`.

## Subcommands

`emet <command> [...args]`. `emet --version` prints the version.

### Setup and audit

- `emet migrate [--dry-run]`: renames a legacy repo to the emet names.
- `emet init [--tracker linear|github|local] [--force]`: autodetects the package manager, trunk branch and tracker kind, and writes `emet.config.json` and the `docs/agents/*.md` files. `--tracker local` sets up the local tracker.
- `emet doctor [--all] [<path> ...]`: read-only audit of any number of repos at once; defaults to the current directory.
- `emet preflight [--run <id>] [--post-dispatch]`: confirms the repo is dispatch-ready.
- `emet skill-path <name>`: prints the absolute `SKILL.md` path of a mattpocock-skills skill. Exits 1 if the skill is not found.
- `emet selftest`: runs the CLI's own unit tests. Source installs only; a compiled binary exits 1 and tells you to run `emet doctor`.

In any git repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` leaves a `TODO(emet):` marker in the generated `docs/agents/*.md` files for anything it cannot infer on its own (a shared test-database lock, schema ownership, and so on). Fill those in; `emet preflight` refuses to dispatch while one remains.

Then, inside Claude Code:

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### Fleet check

`emet doctor` audits several repos at once, read-only:

```bash
emet doctor ~/code/*
```

It reports, per repo: a valid `emet.config.json`, all four `docs/agents/*.md` files present, zero leftover `TODO(emet):` markers, whether the commands in `commands.selfCheck` actually resolve, and that repo's tracker-specific dependency findings (`gh`, Linear; see [dependencies](dependencies.md#what-checks-what)). The mattpocock-skills plugin and the external CLI flags (`gh`, `claude --bg`, `claude agents --json`, checked via `--help`) are checked once for the whole sweep, not per repo.

### Runs, workers and slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: reserves a ticket for a run. `--release <ticket>`, `--list` and `--prune [--dry-run]` release a claim, list claims, or prune stale ones.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: takes a worker slot from the host-wide pool in `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` and `--list` free slots or list them.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: bare, reclaims closed or dead runs whose work landed; `--run` cleans this run; `--all` is a repo-wide branch sweep. After a merge, `emet cleanup --run <runId>` frees the wave's branches, ticket claims and worker slots.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: prints the `git worktree lock` reason a worker writes at bootstrap.
- `emet launch <spec-id> --wave <n>`: starts a wave as a `claude --bg` session and opens its Orca tab per `handoff.launcher`. It does the whole launch (duplicate-session check, `claude --bg`, tab) and prints `{ name, id, attach, orcaTab: { opened, reason } }`. Use it, not a bare `claude --bg`, whenever you want a wave in another session by hand.
- `emet status [--spec <id>]`: Working / Checking / Ready / Needs-decision per wave as JSON plus a summary line. `emet status --help` documents the JSON.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: reports session usage; `--stalled` lists stalled workers.
- `emet handoff --check <path> | --render <path>`: validates or renders a worker's `.emet/handoff-<ticket>.md` note.
- `emet metrics [--run <id>]`: reports tokens, API-equivalent cost and wall time per ticket, per wave and per run, read from the session transcripts. It also compares the context budget estimated per ticket with what each worker actually used. Its summary goes at the end of the run's final report.

### Planning, review and landing

- `emet validate --spec <id> | --file <path>`: plan validation; see [Gates and records](#gates-and-records).
- `emet surfaces --check <file.json | ->`: rejects overlapping allowed-surface globs between a wave's tickets.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: see [Gates and records](#gates-and-records).
- `emet assess --base <ref> --head <ref>`: classifies a diff as `passive`, `medium` or `high` and prints JSON with the tier, the reasons and the recommended reviewer model and effort. See [Models & effort](../../README.md#models--effort) and [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: merges an integration branch into local trunk (`landing.mode` `merge`). `commands.selfCheck` stands in for CI and nothing is pushed.
- `emet spec-merge --spec <id>`: after a wave auto-merges, merges the spec's `ADDED`/`MODIFIED`/`REMOVED` requirement deltas into `docs/specs/<area>.md` (`specs.dir`). It checks every area before writing anything. A conflict, or a requirement that would lose a scenario, exits 1 and leaves every file untouched.
- `emet map [--refresh]`: writes a brief of an existing codebase (stack, structure, conventions, testing, hotspots) to `docs/agents/codebase.md` (`map.path`), stamped with the commit SHA it was built from. The same commit always produces the same file. `emet map --stale` exits 1 once HEAD has moved past the stamp, and `emet preflight` warns in that case. `emet map --for <globs>` prints only the sections that match a ticket's edit surfaces; that output is the only part of the map a worker brief includes.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: the local tracker over `.scratch/`, JSON on stdout. See [Local tracker](#local-tracker).
- `emet guard`: the Claude Code `PreToolUse` hook; reads hook JSON on stdin. `install.sh` wires it into `~/.claude/settings.json`. It blocks a handful of known, unattended-run failure triggers (see `emet/src/guard.ts`).

### Local tracker

With `tracker.kind: "local"`, specs and tickets are markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. The coordinator reads and writes them through `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` sets this up. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` is `"pr"` (default) or `"merge"`, independent of the tracker. In `merge` mode a wave lands as one local merge into trunk with `emet land`, with `commands.selfCheck` standing in for CI and no push. `gh` is only required when the tracker is `github` or landing is `pr`. See [ADR-0010](../adr/0010-local-merge-landing.md) and [`landing`](configuration.md#landing).

### Landing PRs and chaining waves

One wave is one PR. Its body carries `Closes #N` for each ticket (the tracker's closing keyword), and the coordinator moves the tickets to in-review when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR then gets the human-decision label). Later waves run in their own sessions, never in the one that ran wave 1. The `pr` and `handoff` sections control what happens next; see [`pr`](configuration.md#pr) and [`handoff`](configuration.md#handoff).

## Gates and records

The phases do not decide on their own when a ticket is done, mergeable or worth retrying. They call a CLI command that reads a record on disk and prints the decision. Run records live under `.emet/runs/<run-id>/` and the review ledger under `.emet/review/`, in the main checkout, not in a worker's worktree.

| Step              | Command                                              | What it enforces                                                                                                                                                                                                                                             |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before approval   | `emet validate --file <plan.json>`                   | Every `S#` is covered by at least one ticket and has an acceptance scenario. Every ticket covers at least one `S#`. Edit surfaces are disjoint within a wave. No dependency cycles. `emet preflight` runs it again on the approved plan.                     |
| Approval          | `emet approve --run <id> --spec <file>`              | Writes `approval.json` with the spec and ticket-list hashes. Dispatch refuses if either changed afterwards (`--check`).                                                                                                                                      |
| Ticket creation   | `emet materialize-log --run <id> --record/--lookup`  | Saves each created ticket's ID as soon as it exists, so an interrupted run never creates duplicates.                                                                                                                                                         |
| Worker done       | `emet results --run <id> --write/--read <ticket>`    | Workers write a local result file (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` or `NEEDS_CONTEXT`, plus a `Risk:` line). Only the coordinator writes to the tracker.                                                                                             |
| After each worker | `emet verify <ticket> --run <id>`                    | Checks that commits exist beyond the dispatch baseline, every changed path is inside the ticket's edit surfaces, the handoff note passes `handoff --check`, and `commands.workerScopedSuite` passes. Review and merge refuse a ticket without a pass record. |
| Review input      | `emet review-package <base> <head> --out <file>`     | Bundles the diff for the reviewer, who receives it as a file path. Exits 3 if the range is empty or not a descendant of base.                                                                                                                                |
| Review            | `emet review --ticket <t> --findings <file>`         | Keeps the findings ledger and enforces triage order (`intent_gap` → `bad_plan` → `patch` → `defer`) and the round cap. `--escalate` moves to the next model tier. `--rule`/`--rulings` record and list the "Rulings I made" for the report and the PR body.  |
| Merge or chain    | `emet gate <ticket> --tier … --ci … --integration …` | Prints `merge`, `hold`, `chain`, `stop` or `defer` as JSON with its reasons. It reads the verify record, the open findings, the risk tier, CI, the integration suite and the budgets.                                                                        |

After a wave's branches are merged together, `commands.fullSuite` runs once on the integration branch. A red run blocks the PR and `autoChain`. The gate receives the result as `--integration`. For the budgets the gate reads, see [`budgets`](configuration.md#budgets).

## Exit codes

Exit codes are meaningful across every subcommand.

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | Clean.                                                                       |
| `1`  | Findings to act on.                                                          |
| `2`  | Config or usage error; the tool never actually ran. Also an unknown command. |
| `3`  | Internal error.                                                              |

## Environment variables

User-facing variables. A variable overrides the matching config value when set.

| Variable                      | Effect                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` downgrades a dependency block to a warning for that one run. Set it in your own shell, not in anything the coordinator runs unattended. |
| `EMET_MAX_LIVE_WORKERS`       | Overrides [`concurrency.maxLiveWorkers`](configuration.md#concurrency); accepts a positive integer or `auto`.                                                                          |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | Overrides [`concurrency.runIdleThresholdMs`](configuration.md#concurrency), in milliseconds.                                                                                           |
| `EMET_STATE_DIR`              | Host-wide state directory, which holds the worker slot pool. Resolution order: `$EMET_STATE_DIR`, then `$XDG_STATE_HOME/emet`, then `~/.local/state/emet`.                             |
| `EMET_MEM_RESERVE_GIB`        | Memory headroom in GiB that must stay free; an acquire is denied when available memory is below it. Default 8. It also feeds the `auto` worker cap.                                    |
| `EMET_MEM_PER_WORKER_GIB`     | Memory in GiB assumed per worker when `maxLiveWorkers` is `auto`. Default 2. Raise it for a heavier per-worker stack, such as a browser-driven E2E suite per worktree.                 |
| `EMET_CPU_OVERSUBSCRIBE`      | CPU multiplier for the `auto` worker cap. Default 1.                                                                                                                                   |

The `auto` cap is `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. The legacy `FORGE_*` names are still read; `EMET_*` wins when both are set.

# CLI reference

Every `emet` subcommand, the gates and records table, exit codes and environment variables. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Back to the [README](../../README.md). Every command prints its usage with `--help`.

## Subcommands

Three slash commands wrap the CLI inside Claude Code: `/emet:run` (the pipeline), `/emet:init` (`emet init`) and `/emet:doctor` (`emet doctor .`). On Codex they are the `$emet:run`, `$emet:init` and `$emet:doctor` skills. A plain-terminal `emet` needs `install.sh`; otherwise run `! emet <subcommand>` inside a session.

`emet <command> [...args]`. `emet --version` prints the version.

### Setup and audit

- `emet migrate [--dry-run]`: renames a legacy repo to the emet names.
- `emet init [--tracker linear|github|local] [--after-spec release|promote|none] [--force]`: autodetects the package manager, trunk branch, tracker kind and after-spec mode (see [`handoff.afterSpec`](configuration.md#handoff)), and writes `emet.config.json` and the `docs/agents/*.md` files. `--tracker local` sets up the local tracker.
- `emet doctor [--all] [<path> ...]`: read-only audit of any number of repos at once; defaults to the current directory. For a repo that configures [`verify.browser`](configuration.md#verify) it also reports an optional `agent-browser` finding: a missing binary is `indeterminate` (an `optional:` line with an install remedy), and when the binary exists a failing `agent-browser doctor` shows as a warning. Neither is ever an error, and neither changes the exit code. A repo without `verify.browser` shows nothing.
- `emet setup [--yes] [--with <ids>] [--list] [--json]`: offers the optional installs with readline prompts: `mattpocock-skills` (default on), `engram`, `mascot`, `orca-pet`, `gh-auth`, `agent-browser` (default off; runs `bun add -g agent-browser@latest` then `agent-browser install`, never pins a version and never passes `--with-deps`, so when system libraries are missing it prints the command for you to run) and the recommended Claude Code settings (`claude-settings`, applied only when chosen, after a timestamped backup of `settings.json`). Without a TTY, or with `--yes` or `--with`, it asks nothing and installs exactly the named items; with no TTY and no `--with` it installs nothing and prints the `--list` catalog. Each step reports `installed`, `already-present`, `skipped` or `failed`; one failure does not stop the others, and the exit code is 1 if any failed. `/emet:setup` is the plugin entry and asks the same choices with `AskUserQuestion`.
- `emet fleet list [--root <dir>] [--json]`: lists the git repos with an `emet.config.json` one level under `--root` (default `~/code`), with `tracker.kind`, `handoff.autoChain` and `models.worker`. `emet fleet set <key> <value> [--root <dir>] [--dry-run]` changes one config key in every listed repo, validating through the config loader first (an invalid value changes nothing and exits 1). `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>]` opens a `/emet:run --draft <text>` session in each repo after the readiness checks of `emet chain`. See the [fleet guide](../guide/fleet.md).
- `emet preflight [--run <id>] [--post-dispatch]`: confirms the repo is dispatch-ready.
- `emet skill-path <name>`: prints the absolute `SKILL.md` path of a mattpocock-skills skill. Exits 1 if the skill is not found.
- `emet selftest`: runs the CLI's own unit tests. Source installs only; a compiled binary exits 1 and tells you to run `emet doctor`.

In any git repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

`emet init` leaves a `TODO(emet):` marker in the generated `docs/agents/*.md` files for anything it cannot infer on its own (a shared test-database lock, schema ownership, and so on). Fill those in; `emet preflight` refuses to dispatch while one remains.

Then, inside Claude Code (on Codex, use `$emet:run` with the same arguments):

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

It reports, per repo: a valid `emet.config.json`, all four `docs/agents/*.md` files present, zero leftover `TODO(emet):` markers, whether the commands in `commands.selfCheck` actually resolve, and that repo's tracker-specific dependency findings (`gh`, Linear; see [dependencies](dependencies.md#what-checks-what)). The mattpocock-skills plugin and the external CLI flags (`gh`, plus the Agent host's: `claude --bg` and `claude agents --json` on Claude Code, `codex exec --json` and `--output-schema` on Codex, checked via `--help`) are checked once for the whole sweep, not per repo.

### Runs, workers and slots

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`: reserves a ticket for a run. `--release <ticket>`, `--list` and `--prune [--dry-run]` release a claim, list claims, or prune stale ones.
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`: takes a worker slot from the host-wide pool in `~/.local/state/emet/slots`. `--release --run <id>`, `--release-index <index>` and `--list` free slots or list them.
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`: bare, reclaims closed or dead runs whose work landed; `--run` cleans this run; `--all` is a repo-wide branch sweep. After a merge, `emet cleanup --run <runId>` frees the wave's branches, ticket claims and worker slots. In every mode it also deletes each local branch whose PR merged at the branch's tip commit, together with the clean, unlocked agent worktree that holds it.
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`: prints the `git worktree lock` reason a worker writes at bootstrap.
- `emet launch <spec-id> --wave <n>`: on Claude Code, starts a wave as a `claude --bg` session and opens its Orca tab per `handoff.launcher` (on Codex see [Codex host](#codex-host)). It does the whole launch (duplicate-session check, `claude --bg`, tab) and prints `{ name, id, attach, orcaTab: { opened, reason } }`. Use it, not a bare `claude --bg`, whenever you want a wave in another session by hand.
- `emet chain --ticket <id> --spec <id> --wave <n> [gate flags]`: runs `emet gate` with the gate flags it is given and starts the next wave only when the decision is `chain`. Before launching it checks readiness (host memory headroom, free disk and inodes in the repo and `/tmp`, the `orca` CLI) and afterwards confirms the child session is listed. Any other decision, a blocking readiness problem (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) or an existing session for the same spec and wave exits 1 with the reasons and launches nothing.
- `emet status [--spec <id>] [--brief]`: Working / Checking / Ready / Needs-decision per wave as JSON plus a summary line. `--brief` prints at most three lines instead: the overall state, what is waiting on a person (if anything) and the next action. `emet status --help` documents the JSON.
- `emet run current [--json]`: prints the active run for the repo (run id, spec, wave, phase and last update), read from `.emet/phase.json`. With no active run it prints `no active run` and exits 0.
- `emet insights [--since <iso|7d|30d>] [--repo <path>] [--all] [--json] [--mark-baseline]`: reads the [event journal](../guide/journal.md) and reports runs by origin (human or auto), gate decisions by decision and reason, human interventions per run, launch outcomes and tickets closed. Unreadable lines are skipped and counted. `--mark-baseline` appends a baseline; later reports cover only events after it unless `--all` is given. An empty or missing journal prints a zero report and exits 0.
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`: reports session usage; `--stalled` lists stalled workers.
- `emet handoff --check <path> | --render <path>`: validates or renders a worker's `.emet/handoff-<ticket>.md` note.
- `emet metrics [--run <id>]`: reports tokens, API-equivalent cost and wall time per ticket, per wave and per run, read from the session transcripts. It also compares the context budget estimated per ticket with what each worker actually used. Its summary goes at the end of the run's final report.

### Planning, review and landing

- `emet promote --spec <id> [--dry-run] [--no-promote] [--hold]`: the after-spec step, per [`handoff.afterSpec`](configuration.md#handoff). In `promote` mode it opens a `develop` to `main` pull request titled `chore: 🔖 promote develop`, waits with `emet ci --pr <n> --wait`, merges it with a merge commit only when the state is `pass`, then opens and merges a `main` to `develop` sync pull request only if `develop` is behind `main`. It appends one `promote` event with the pull request number, `merged`, `rule` and `reason` to the journal. `afterSpec` may be a rule list; the mode is then chosen from the paths promoting `develop` would carry (see [`handoff.afterSpec`](configuration.md#handoff)), and a failing `git fetch` or `git diff` makes the command exit 1 before any pull request opens. The printed outcome carries `rule` (the matched rule index, or `null` for the string form or no match), `reason`, and `deployCheck: { run, reason }`, which says whether the coordinator should run `emet deploy-check`. In `release` mode it merges nothing and leaves the release pull request to a person. `emet promote --spec <id> --hold` writes the marker `<run dir>/runs/<id>/no-promote` and prints `{"held":true}`; while it exists, `emet promote --spec <id>` exits 0 with a `skipped` note and opens no pull request, so `--no-promote` survives across a spec's sessions. With `afterSpec` `none`, with `--no-promote`, with a held spec, or when the spec's last wave was left open or flagged, it exits 0 with a `skipped` note; it still runs after a clean final wave so the outcome carries the `deployCheck` decision (on trunk `main` the deploy check runs whatever the mode). A CI that is not `pass` merges nothing and exits 1. `--dry-run` opens no pull request.
- `emet deploy-check [--json]`: runs `deploy.check.command` until it exits 0, up to `retries` attempts or `timeoutSeconds`, waiting `intervalSeconds` between them, and prints `state: ok | failed | timeout` with `attempts`. Exit `0` ok, `1` failed, `3` timeout. With no `deploy.check` configured it exits 0 with `skipped: "no deploy check configured"`. The coordinator runs it only when the `emet promote` outcome has `deployCheck.run` true. See [`deploy`](configuration.md#deploy).
- `emet validate --spec <id> | --file <path>`: plan validation; see [Gates and records](#gates-and-records).
- `emet surfaces --check <file.json | ->`: rejects overlapping allowed-surface globs between a wave's tickets.
- `emet approve --run <id>`, `emet materialize-log`, `emet results`, `emet verify`, `emet review-package`, `emet review`, `emet gate`: see [Gates and records](#gates-and-records).
- `emet assess --base <ref> --head <ref>`: classifies a diff as `passive`, `medium` or `high` and prints JSON with the tier, the reasons and the recommended reviewer model and effort, plus `browserVerify: { run, reason }`: `run` is `true` only when the tier has a reviewer, [`verify.browser`](configuration.md#verify) is configured, the `agent-browser` binary is on PATH and, when `paths` is set, a changed path matches; otherwise `reason` names the first failed condition. See [Models & effort](../../README.md#models--effort) and [`review`](configuration.md#review).
- `emet land --spec <s> --branch <integration> --tickets <id,...>`: merges an integration branch into local trunk (`landing.mode` `merge`). `commands.selfCheck` stands in for CI and nothing is pushed.
- `emet spec-merge --spec <id>`: after a wave auto-merges, merges the spec's `ADDED`/`MODIFIED`/`REMOVED` requirement deltas into `docs/specs/<area>.md` (`specs.dir`). It checks every area before writing anything. A conflict, or a requirement that would lose a scenario, exits 1 and leaves every file untouched.
- `emet map [--refresh]`: writes a brief of an existing codebase (stack, structure, conventions, testing, hotspots) to `docs/agents/codebase.md` (`map.path`), stamped with the commit SHA it was built from. The same commit always produces the same file. `emet map --stale` exits 1 once HEAD has moved past the stamp, and `emet preflight` warns in that case. `emet map --for <globs>` prints only the sections that match a ticket's edit surfaces; that output is the only part of the map a worker brief includes.
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`: the local tracker over `.scratch/`, JSON on stdout. See [Local tracker](#local-tracker).
- `emet guard`: the Claude Code `PreToolUse` hook; reads hook JSON on stdin (the Codex form is under [Codex host](#codex-host)). `install.sh` wires it into `~/.claude/settings.json`. It blocks a handful of known, unattended-run failure triggers (see `emet/src/guard.ts`).

### Local tracker

With `tracker.kind: "local"`, specs and tickets are markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. The coordinator reads and writes them through `emet tracker` (`create-spec`, `create-ticket`, `read`, `frontier`, `set-state`, `comment`, `close`). `emet init --tracker local` sets this up. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` is `"pr"` (default) or `"merge"`, independent of the tracker. In `merge` mode a wave lands as one local merge into trunk with `emet land`, with `commands.selfCheck` standing in for CI and no push. `gh` is only required when the tracker is `github` or landing is `pr`. See [ADR-0010](../adr/0010-local-merge-landing.md) and [`landing`](configuration.md#landing).

### Landing PRs and chaining waves

One wave is one PR. Its body carries one `Closes #N` line per ticket (the tracker's closing keyword), and the coordinator moves the tickets to in-review when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR then gets the human-decision label). Later waves run in their own sessions, never in the one that ran wave 1. The `pr` and `handoff` sections control what happens next; see [`pr`](configuration.md#pr) and [`handoff`](configuration.md#handoff).

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` polls the PR's checks until they finish or the timeout (default 30) passes. With `--rerun-flakes` it reruns each failed check once through `gh run rerun --failed`; a check that passes on the rerun is a Flake. It prints `state: pass | fail | env-fault | timeout`, the failed checks and `flakeReruns`, and never merges. A PR with no checks is `pass` with `noChecks: true`. Exit `0` pass, `1` fail or env-fault, `3` timeout. `env-fault` means checks that ended `STARTUP_FAILURE` or stayed queued too long: a CI that never ran, not a code failure.

With `tracker.kind: "github"`, `emet tracker close <ticket>... [--pr <n>]` closes each ticket (`CLA-<n>`, `#<n>` or a bare number) with `gh issue close --reason completed`, verifies its state and reports `closed` or `already-closed`. `--pr` adds the comment "Landed in #<n>". It exits `1` if any ticket failed, after processing the rest. Linear tickets are confirmed Done by the coordinator through the Linear MCP.

### Codex host

These commands serve the Codex Agent host (`agentHost` `"codex"`); see the [Codex guide](../guide/codex.md).

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: after checking the claim and the slot, creates `.emet/worktrees/agent-<ticket>`, builds a per-run `CODEX_HOME` overlay and starts the worker as a detached `codex exec`. `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` blocks until it exits and prints the recorded result status.
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: runs the reviewer as a read-only `codex exec` over a package from `emet review-package` and prints findings JSON for `emet review --findings`. The `passive` tier starts no process.
- `emet launch <spec-id> --wave <n>`: on this host, starts a detached `codex exec` running `$emet:run --dispatch <spec>` and records its thread id. No Orca tab is opened, and `codex exec resume <id>` continues the session.
- `emet guard`: with `EMET_AGENT_HOST=codex` it reads Codex hook input, checks `apply_patch` paths against `.emet/surface.json` and keeps the approval gate closed until a prompt line `approve <id>`.

## Gates and records

The phases do not decide on their own when a ticket is done, mergeable or worth retrying. They call a CLI command that reads a record on disk and prints the decision. Run records live under `.emet/runs/<run-id>/` and the review ledger under `.emet/review/`, in the main checkout, not in a worker's worktree.

| Step              | Command                                              | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before approval   | `emet validate --file <plan.json>`                   | Every `S#` is covered by at least one ticket and has an acceptance scenario. Every ticket covers at least one `S#`. Edit surfaces are disjoint within a wave. No dependency cycles. `emet preflight` runs it again on the approved plan.                                                                                                                                                                                                                                                                  |
| Approval          | `emet approve --run <id> --spec <file>`              | Writes `approval.json` with the spec and ticket-list hashes. Dispatch refuses if either changed afterwards (`--check`).                                                                                                                                                                                                                                                                                                                                                                                   |
| Ticket creation   | `emet materialize-log --run <id> --record/--lookup`  | Saves each created ticket's ID as soon as it exists, so an interrupted run never creates duplicates.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Worker done       | `emet results --run <id> --write/--read <ticket>`    | Workers write a local result file (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` or `NEEDS_CONTEXT`, plus a `Risk:` line). Only the coordinator writes to the tracker.                                                                                                                                                                                                                                                                                                                                          |
| After each worker | `emet verify <ticket> --run <id>`                    | Checks that commits exist beyond the dispatch baseline, every changed path is inside the ticket's edit surfaces, the handoff note passes `handoff --check`, and `commands.workerScopedSuite` passes. Review and merge refuse a ticket without a pass record.                                                                                                                                                                                                                                              |
| Review input      | `emet review-package <base> <head> --out <file>`     | Bundles the diff for the reviewer, who receives it as a file path. Exits 3 if the range is empty or not a descendant of base.                                                                                                                                                                                                                                                                                                                                                                             |
| Review            | `emet review --ticket <t> --findings <file>`         | Keeps the findings ledger and enforces triage order (`intent_gap` → `bad_plan` → `patch` → `defer`) and the round cap. `--recheck --verdicts <file>` ends a fix round: only findings open when it began are evaluated, a finding becomes `resolved` only through a verdict, and the recheck counts against `budgets.fixRounds` (exit 1 naming the cap when used up). `--escalate` moves to the next model tier. `--rule`/`--rulings` record and list the "Rulings I made" for the report and the PR body. |
| Merge or chain    | `emet gate <ticket> --tier … --ci … --integration …` | Prints `merge`, `hold`, `chain`, `stop` or `defer` as JSON with its reasons. It reads the verify record, the open findings, the risk tier, CI, the integration suite and the budgets. A `hold` carries `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` or `report-infrastructure`. `--no-record` keeps the decision out of the journal. See [`gate`](configuration.md#gate).                                                                                                                     |

After a wave's branches are merged together, `commands.fullSuite` runs once on the integration branch. A red run blocks the PR and `autoChain`. The gate receives the result as `--integration`. For the budgets the gate reads, see [`budgets`](configuration.md#budgets).

## Exit codes

Exit codes are meaningful across every subcommand.

| Code | Meaning                                                                      |
| ---- | ---------------------------------------------------------------------------- |
| `0`  | Clean.                                                                       |
| `1`  | Findings to act on.                                                          |
| `2`  | Config or usage error; the tool never actually ran. Also an unknown command. |
| `3`  | Internal error.                                                              |

An unknown flag also exits `2` and names the flag. Ctrl-C exits `130`.

## Global flags

Every command accepts these; each command's own flags are listed by `emet <command> --help`.

| Flag         | Effect                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `--json`     | Prints one envelope `{ok, data, error: {code, message, fix}}` on stdout, for `--help` and `--version` too.      |
| `--no-color` | Disables ANSI color. Color also honours `NO_COLOR`, `FORCE_COLOR`, `TERM=dumb` and whether the output is a TTY. |
| `--verbose`  | Prints the stack of an unexpected error. Without it the top-level catch prints a one-line error.                |
| `--help`     | Prints the command's usage.                                                                                     |

`emet --version` prints the version; `emet --version --json` prints `{"ok": true, "data": {"version": ...}, "error": null}`. Under `--json` a failing command exits with its usual code and prints `ok: false` with an error `code` of `findings`, `usage`, `internal`, `slice-timeout`, `expired`, `bad-range` or `exit-<n>`; whatever the command printed on stdout is the envelope's `data`.

On a TTY, `emet` prints a one-line notice on stderr when a newer release is known. It checks at most once a day, caches the answer, never waits on the network, and stays silent under `--json` or without a TTY.

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
| `EMET_AGENT_HOST`             | `codex` makes `emet guard` read Codex hook input. Set by the Codex hooks; leave it unset on Claude Code.                                                                               |

The `auto` cap is `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. The legacy `FORGE_*` names are still read; `EMET_*` wins when both are set.

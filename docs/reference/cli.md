# CLI reference

Every `emet` subcommand, the gates and records, exit codes and environment variables. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Back to the [README](../../README.md). Every command prints its usage with `--help`.

## Subcommands

Three slash commands wrap the CLI inside Claude Code: `/emet:run` (the pipeline), `/emet:init` (`emet init`) and `/emet:doctor` (`emet doctor .`). On Codex they are the `$emet:run`, `$emet:init` and `$emet:doctor` skills. A plain-terminal `emet` needs `emet self install`; otherwise run `! emet <subcommand>` inside a session.

`emet <command> [...args]`. `emet --version` prints the version.

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

## Setup and audit

### `emet migrate`

Renames a legacy repo to the emet names.

- `--dry-run`

### `emet init`

Autodetects the package manager, trunk branch, tracker kind and after-spec mode (see [`handoff.afterSpec`](configuration.md#handoff)). It sets [`schema.ownedPaths`](configuration.md#schema) when it finds a Prisma schema (`prisma/schema.prisma` or a `prisma/schema/` folder) or a Drizzle migrations folder (`drizzle/` next to a `drizzle.config.*`), and writes `emet.config.json` and the `docs/agents/*.md` files.

- `--tracker linear|github|local`: `--tracker local` sets up the local tracker.
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

Read-only audit of any number of repos at once; defaults to the current directory.

- `--all`
- `<path> ...`: the repos to audit.

For a repo that configures [`verify.browser`](configuration.md#verify) it also reports an optional `agent-browser` finding: a missing binary is `indeterminate` (an `optional:` line with an install remedy), and when the binary exists a failing `agent-browser doctor` shows as a warning. Neither is ever an error, and neither changes the exit code. A repo without `verify.browser` shows nothing.

#### Fleet check

`emet doctor` audits several repos at once, read-only:

```bash
emet doctor ~/code/*
```

It reports, per repo: a valid `emet.config.json`, all four `docs/agents/*.md` files present, zero leftover `TODO(emet):` markers, whether the commands in `commands.selfCheck` actually resolve, and that repo's tracker-specific dependency findings (`gh`, Linear; see [dependencies](dependencies.md#what-checks-what)).

The mattpocock-skills plugin and the external CLI flags are checked once for the whole sweep, not per repo. These are `gh`, plus the Agent host's: `claude --bg` and `claude agents --json` on Claude Code, `codex exec --json` and `--output-schema` on Codex, checked via `--help`.

### `emet setup`

Offers the optional installs with readline prompts.

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`: combinable with `--with`, `--yes` and `--json`. It prints each chosen item's planned steps, or `already-present`, and changes nothing: it runs no command, writes no file and no ledger entry, and exits 0.
- `--restore <id>`: undoes one of the two items that can be restored; see [Setup ledger and restore](#setup-ledger-and-restore).

Without a TTY, or with `--yes` or `--with`, it asks nothing and installs exactly the named items; with no TTY and no `--with` it installs nothing and prints the `--list` catalog. Each step reports `installed`, `already-present`, `skipped` or `failed`; one failure does not stop the others, and the exit code is 1 if any failed. `/emet:setup` is the plugin entry and asks the same choices with `AskUserQuestion`. Every `installed` item is recorded in the Setup ledger.

The items:

- `mattpocock-skills` (default on), `engram`, `mascot`, `orca-pet` and `gh-auth`.
- `agent-browser` (default off): runs `bun add -g agent-browser@latest` then `agent-browser install`, and writes `~/.agent-browser/config.json` with `contentBoundaries: true` and `maxOutput: 50000` only when that file does not exist. It then runs `agent-browser doctor` and prints a warning if it fails. It never pins a version and never passes `--with-deps`, so when system libraries are missing it prints the command for you to run.
- `context7` (default off): runs `bun add -g ctx7@latest`, then `ctx7 setup --cli --claude --yes`, and `ctx7 setup --cli --codex --yes` only when `codex` is on PATH. It installs the `ctx7` CLI and its `find-docs` skill, not the MCP server, never pins a version, and prints the command to run by hand when a `ctx7 setup` step fails. `ctx7` sends anonymous usage events unless `CTX7_TELEMETRY_DISABLED=1` is set, and a `CONTEXT7_API_KEY` in the environment takes precedence over the account saved by `ctx7 login`.
- `firecrawl-local` (default off): needs `cargo`, and runs `cargo install firecrawl-local` when the binary is missing. It then registers a user-scope Claude Code MCP server with `FIRECRAWL_CLOUD=search` and `--public-only`, replacing an earlier registration with other settings. Scrape, crawl and map run on the machine, only web search goes to Firecrawl Cloud, and private addresses are blocked.
  - It passes the newest Chrome that `agent-browser` downloaded as `FIRECRAWL_CHROME_PATH`.
  - On Linux where AppArmor restricts unprivileged user namespaces it prints an AppArmor profile and the `sudo` commands to load it, because Firecrawl Local never runs Chrome without its sandbox.
  - Without a usable Chrome, pages that render with JavaScript come back empty.
- `claude-settings`: the recommended Claude Code settings, applied only when chosen, after a timestamped backup of `settings.json`.

#### Setup ledger and restore

`emet setup` records every item that ends `installed` in `setup-ledger.json` under the state directory, as `{ id, at, undo }`. An `already-present` item records nothing, and a second `installed` of the same id keeps the first entry's before-state. Ledger writes are atomic, and a malformed ledger is an error naming its path, never read as empty.

The undo records hold what is needed to revert:

- `claude-settings`: the previous `model` (or none), the deny rules it actually added and the backup path.
- `firecrawl-local`: the previous user-scope MCP entry (read from `~/.claude.json` before `claude mcp remove` runs) and whether emet ran `cargo install`.
- Plugins: the plugin id.
- `orca-pet`: the written files.
- `agent-browser`: the bun global (and the config file, when emet created it).
- `context7`: the bun global.
- `engram`: the brew formula and plugin.

`emet setup --restore <id>` accepts only `claude-settings` and `firecrawl-local`; any other id exits 2.

- `claude-settings` restores the previous `model` (or deletes the key when there was none) and removes only the deny rules emet added, after a timestamped backup. When the current `model` is not the one setup set, it keeps it and prints a warning.
- `firecrawl-local` runs `claude mcp remove firecrawl-local -s user`, then `claude mcp add-json firecrawl-local '<previous json>' -s user` when an entry was recorded.

A successful restore removes the ledger entry; an id with no entry prints `nothing to restore for <id>` and exits 1.

`emet uninstall` reverts every ledger entry the same way: `claude-settings` and `firecrawl-local` as in `--restore`, plugins with `claude plugin uninstall <id>`, `orca-pet` files and an emet-created agent-browser config by deleting them. For brew, bun and cargo globals it prints the removal command (for example `bun remove -g ctx7`) and never runs it, and it never touches `gh auth`. Each reverted entry leaves the ledger, and one failing extra does not stop the others.

### `emet self install`

The standalone install: `emet self install [latest|X.Y.Z]`.

- `--dry-run`: lists every write and writes nothing.
- `--force`: proceeds although the emet plugin is installed; without it the command refuses while the plugin is installed.
- `--from <checkout>`: reproduces a Bun source install. The CLI source is copied to `~/.claude/emet` and `~/.local/bin/emet` becomes a wrapper that runs `bun` on it, so `emet selftest` works; it fails without `bun`. Contributors use `emet self install --from .`.

It places the binary at `~/.local/share/emet/versions/<v>/emet` with the symlink `~/.local/bin/emet`, writes the reference prompts and `.install-manifest.json` to `~/.claude/emet/`, the commands to `~/.claude/commands/emet/` and the agents to `~/.claude/agents/`.

It merges the emet hooks into `~/.claude/settings.json` (with a backup, foreign hooks untouched) and, when Codex is present, writes the skills under `~/.agents/skills` and appends the hooks to `$CODEX_HOME/hooks.json` (default `~/.codex`; `config.toml` is never written, so approve the hooks once with `/hooks`).

A second run changes nothing; an edited file is kept and the new version lands beside it as `<file>.new`. The one-line install script from [Install](../start/install.md) downloads the release binary, verifies `SHA256SUMS` and runs this command.

### `emet self update`

`emet self update [latest|X.Y.Z]` downloads the release, verifies `SHA256SUMS` (and the attestation when `gh` is present) and stages it. The swap of the symlink and installed files happens only when no worker slot is held; otherwise it stays pending until the next session start. A failure leaves the current version untouched and is recorded in the journal. The previous version is kept for rollback and older ones are pruned. It does nothing for plugin installs.

- `--auto [off|on]`: what the `SessionStart` hook runs. It runs at most once a day, detached and silent when offline; `off` or `on` toggles it. `EMET_AUTO_UPDATE=0` also disables it.

### `emet uninstall`

Removes an `emet self install` install and what `emet setup` added. It first builds the whole plan, then runs it.

- `--dry-run`: prints the plan and changes nothing.
- `--yes`: skips the confirmation. With a TTY and no `--yes` it asks once, and with no TTY and no `--yes` it prints the plan, changes nothing and exits 0.
- `--purge`: also removes the state directory (`EMET_STATE_DIR`, else `XDG_STATE_HOME/emet`) and `~/.emet`; without it both stay.
- `--json`: prints the result as JSON.

What it removes:

- Every file in the install manifest whose hash still matches the recorded one, plus its `.new` sibling; edited files stay and are listed.
- The shim `~/.local/bin/emet`, only when it is the install's wrapper or a symlink into `~/.claude/emet` or `~/.local/share/emet/versions`, then the manifest and the directories left empty.
- From `~/.claude/settings.json` and from `$CODEX_HOME/hooks.json` (default `~/.codex`), every emet hook command in any event (`emet guard`, `emet setup --notice`, `emet whats-new --hook` and `emet self update --auto`). It keeps every other hook and drops groups and events left empty.
- The Codex skills under `~/.agents/skills/emet/` that still match this emet (edited ones stay and are listed), the versions directory `~/.local/share/emet/versions` and the install state `~/.local/share/emet/install.json`.
- The Setup ledger's extras (see [Setup ledger and restore](#setup-ledger-and-restore)).

When an install backup (`.pre-emet-guard-backup.`) holds exactly what remains, its bytes are restored; when nothing remains the file is removed; otherwise a timestamped backup is written first.

Without a manifest or install state (a plugin install) it skips the files and prints `claude plugin uninstall emet@emet-marketplace`; when `codex` is on PATH it also prints how to remove the Codex plugin. It exits 1 when any step failed or a file it must read (manifest, settings, ledger) is unreadable, and names that path.

### `emet whats-new`

Prints a one-time notice after emet updates.

- `--hook`: the form the `SessionStart` hook runs.

### `emet fleet`

Works across the git repos with an `emet.config.json` one level under `--root` (default `~/code`). See the [fleet guide](../how-to/check-a-fleet.md).

- `emet fleet list [--root <dir>] [--json]`: lists the repos with `tracker.kind`, `handoff.autoChain` and `models.worker`.
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`: changes one config key in every listed repo, validating through the config loader first (an invalid value changes nothing and exits 1).
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`: opens a `/emet:run --draft <text>` session in each repo after the readiness checks of `emet chain`. `--dry-run` prints the planned launches without starting a session.
- `emet fleet status [--json]`: reads the global journal and prints, per repo, the latest state of each session within the last 24 hours (`ended` excluded).

`fleet status` prints one line `<repo>: <b> blocked, <w> working, <i> idle` per repo, blocked repos first. `--json` prints `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`. It exits 0 also when there are no sessions.

### `emet preflight`

Confirms the repo is dispatch-ready.

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` prints the absolute `SKILL.md` path of a mattpocock-skills skill. Exits 1 if the skill is not found.

### `emet selftest`

Runs the CLI's own unit tests. Source installs only; a compiled binary exits 1 and tells you to run `emet doctor`.

## Runs, workers and slots

### `emet claims`

Reserves a ticket for a run: `emet claims --reserve <ticket> --run <id> --anchor <pid>`.

- `--release <ticket>`: releases a claim.
- `--list`: lists claims.
- `--prune [--dry-run]`: prunes stale claims.

### `emet slots`

Takes a worker slot from the host-wide pool in `~/.local/state/emet/slots`: `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`.

- `--release --run <id>`: frees the run's slots.
- `--release-index <index>`: frees one slot.
- `--list`: lists the slots.

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`. Bare, it reclaims closed or dead runs whose work landed. After a merge, `emet cleanup --run <runId>` frees the wave's branches, ticket claims and worker slots.

- `--run <id>`: cleans this run.
- `--all`: a repo-wide branch sweep.
- `--dry-run`
- `--force`

In every mode it also deletes each local branch whose PR merged at the branch's tip commit, together with the clean, unlocked agent worktree that holds it.

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` prints the `git worktree lock` reason a worker writes at bootstrap.

### `emet launch`

`emet launch <spec-id> --wave <n>`: on Claude Code, starts a wave as a `claude --bg` session and opens its Orca tab per `handoff.launcher` (on Codex see [Codex host](#codex-host)). It does the whole launch (duplicate-session check, `claude --bg`, tab) and prints `{ name, id, attach, orcaTab: { opened, reason } }`. Use it, not a bare `claude --bg`, whenever you want a wave in another session by hand.

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` runs `emet gate` with the gate flags it is given and starts the next wave only when the decision is `chain`.

Before launching it checks readiness (host memory headroom, free disk and inodes in the repo and `/tmp`, the `orca` CLI) and afterwards confirms the child session is listed. Any other decision, a blocking readiness problem (`low-memory`, `low-disk`, `low-inodes`, `orca-unavailable`) or an existing session for the same spec and wave exits 1 with the reasons and launches nothing.

### `emet status`

`emet status [--spec <id>] [--brief]` prints Working / Checking / Ready / Needs-decision per wave as JSON plus a summary line. `emet status --help` documents the JSON.

- `--spec <id>`
- `--brief`: prints at most three lines instead: the overall state, what is waiting on a person (if anything) and the next action.

The JSON also carries `sessions: [{sessionId, state, blocked, since, runId}]`: the latest attention state of each emet-owned session of this repo within the last 24 hours, `ended` sessions excluded. `blocked` is true when `state` is `needs-decision`, and `since` is the time of that state. Any blocked session makes the overall `state` `needs-decision`, also when no wave is active; the summary line names how many sessions are blocked and `--brief` lists them on the line for what waits on a person.

### `emet run`

`emet run current [--json]` prints the active run for the repo (run id, spec, wave, phase and last update), read from `.emet/phase.json`. With no active run it prints `no active run` and exits 0.

### `emet memory`

Searches and saves lessons in [Engram](https://github.com/Gentleman-Programming/engram).

- `emet memory search --json <query> [--limit <n>]`: searches for lessons from earlier runs. It searches with `match_mode: "any"` (`--limit` defaults to 5, maximum 20), keeps only notes whose topic key starts with `emet/<repo>/lessons/`, and prints `{available: true, results: [{id, topicKey, title, content}]}` with `content` truncated to 2000 characters. `<repo>` is the last path segment of `git remote get-url <repo.remote>` without `.git`, else the main worktree's basename.
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`: reads 1 to 5 lesson bullets (`- ` lines of at most 300 characters each) from stdin and appends them as a `## <runId> — <outcome> (<date>)` section to the note with topic key `emet/<repo>/lessons/<key>`, or starts that note. A note over 20000 characters drops its oldest sections. It prints `{available: true, saved: true, topicKey}`.

Both subcommands talk to Engram by spawning `engram mcp --tools=agent` in the repo root; the Engram plugin is not required. They never pass a `project` to Engram.

Exit codes: `2` for bad usage (no subcommand, a missing query, no bullets, more than 5 bullets, a bullet over 300 characters, an unknown outcome, a bad key). Every Engram problem (not on PATH, a failed handshake, a tool error, a timeout, malformed JSON) exits `0`.

- Before a successful handshake the output is `{available: false, reason}`.
- After it, the output is `{available: true, results: [], reason}` for `search` or `{available: true, saved: false, reason}` for `save`.
- `memory.enabled: "off"` prints `{available: false, reason: "memory.enabled is off"}` and spawns nothing. See [`memory`](configuration.md#memory).

### `emet insights`

Reads the [event journal](../concepts/attention-and-journal.md) and reports runs by origin (human or auto), gate decisions by decision and reason, human interventions per run, launch outcomes and tickets closed. Unreadable lines are skipped and counted. An empty or missing journal prints a zero report and exits 0.

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`: appends a baseline; later reports cover only events after it unless `--all` is given.

### `emet usage`

Reports session usage.

- `--session <id>` or `--file <path>`
- `--stalled [--minutes N]`: lists stalled workers.
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` validates or renders a worker's `.emet/handoff-<ticket>.md` note.

- `--check <path>`: validates the note. A passing check prints `missing skills: …` when the `missing` list is not empty.
- `--expect-skills a,b` (check only): fails the check for each named skill that is in neither the `loaded` nor the `missing` list.
- `--render <path>`: renders the note.

The note may carry a `skills:` section, written `skills: none` or `skills: loaded: a, b; missing: c`. It is required only when `state` is `done`, and any other value fails the check.

### `emet metrics`

`emet metrics [--run <id>]` reports tokens, API-equivalent cost and wall time per ticket, per wave and per run, read from the session transcripts. It also compares the context budget estimated per ticket with what each worker actually used. Its summary goes at the end of the run's final report.

### `emet ask`

The worker mailbox: asks the coordinator, or waits for the reply.

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`: sends the question.
- `--wait <n>`: waits for the reply.
- `--slice <seconds>`

With `--wait`, exit `0` is a reply, `3` a slice timeout and `4` expired.

### `emet inbox`

`emet inbox --run <id>` lists the open worker questions as JSON.

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` answers a worker question.

## Planning, review and landing

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` is the after-spec step, per [`handoff.afterSpec`](configuration.md#handoff).

- `--dry-run`: opens no pull request.
- `--no-promote`: skips the step.
- `--hold`: writes the marker `<run dir>/runs/<id>/no-promote` and prints `{"held":true}`. While it exists, `emet promote --spec <id>` exits 0 with a `skipped` note and opens no pull request, so `--no-promote` survives across a spec's sessions.

In `promote` mode it opens a `develop` to `main` pull request titled `chore: 🔖 promote develop`, waits with `emet ci --pr <n> --wait`, and merges it with a merge commit only when the state is `pass`. Then, only if `develop` is behind `main`, it opens a `main` to `develop` sync pull request, waits for its checks the same way and merges it with a merge commit only when the state is `pass`. A sync pull request whose state is `fail`, `timeout` or `env-fault`, or whose merge is rejected, stays open and never changes the promote result.

It appends one `promote` event with the pull request number, `merged`, `syncPrNumber`, `syncMerged`, `syncReason`, `rule` and `reason` to the journal. `afterSpec` may be a rule list; the mode is then chosen from the paths promoting `develop` would carry (see [`handoff.afterSpec`](configuration.md#handoff)), and a failing `git fetch` or `git diff` makes the command exit 1 before any pull request opens.

The printed outcome carries:

- `rule`: the matched rule index, or `null` for the string form or no match.
- `reason`.
- `syncPrNumber`: `null` when no sync pull request opened.
- `syncMerged` and `syncReason`: a sentence saying why a sync pull request was left open, else `null`.
- `deployCheck: { run, reason }`: says whether the coordinator should run `emet deploy-check`.

In `release` mode it merges nothing and leaves the release pull request to a person. With `afterSpec` `none`, with `--no-promote`, with a held spec, or when the spec's last wave was left open or flagged, it exits 0 with a `skipped` note. It still runs after a clean final wave so the outcome carries the `deployCheck` decision (on trunk `main` the deploy check runs whatever the mode). A CI that is not `pass` merges nothing and exits 1.

### `emet deploy-check`

Runs `deploy.check.command` until it exits 0, up to `retries` attempts or `timeoutSeconds`, waiting `intervalSeconds` between them, and prints `state: ok | failed | timeout` with `attempts`.

- `--json`

Exit `0` ok, `1` failed, `3` timeout. With no `deploy.check` configured it exits 0 with `skipped: "no deploy check configured"`. The coordinator runs it only when the `emet promote` outcome has `deployCheck.run` true. See [`deploy`](configuration.md#deploy).

### `emet surfaces`

`emet surfaces --check <file.json | ->` rejects overlapping allowed-surface globs between a wave's tickets.

### `emet assess`

`emet assess --base <ref> --head <ref>` classifies a diff as `passive`, `medium` or `high` and prints JSON with the tier, the reasons and the recommended reviewer model and effort. See [Models & effort](../../README.md#models--effort) and [`review`](configuration.md#review).

- `--quick`: the JSON also carries `"quickRejected": true|false` and the command exits 1 when the tier is `high` (a **Stop** for a **Quick run**: no auto-merge, the PR stays open), 0 otherwise. Without `--quick` the output and exit codes are unchanged.

The JSON also carries two decisions:

- `browserVerify: { run, reason }`: `run` is `true` only when the tier has a reviewer, [`verify.browser`](configuration.md#verify) is configured, the `agent-browser` binary is on PATH and, when `paths` is set, a changed path matches. Otherwise `reason` names the first failed condition.
- `dualReview: { run, reason }`: `run` is `true` only when the tier is `high`, `agentHost` is `claude`, [`review.dual`](configuration.md#review) is not `off` and the `codex` binary is on PATH. Otherwise `reason` names the first failed condition.

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` merges an integration branch into local trunk (`landing.mode` `merge`). `commands.selfCheck` stands in for CI and nothing is pushed.

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` manages the spec branch `spec/<id>` of `landing.unit: spec` (see [`landing`](configuration.md#landing)). All print JSON.

- `ensure`: creates the branch from trunk (idempotent), writes `.emet/specs/<id>/branch.json` and refuses when another spec's branch is checked out.
- `integrate --wave <n> --branch <integration> --tickets a,b`: merges the wave branch into `spec/<id>` with `--no-ff` and the trailers `Emet-Wave` and `Emet-Tickets`, records the wave, appends `spec.integrate` and, when `landing.pushSpecBranch` is true, pushes the branch without opening a PR.
- `status`: prints `branch`, `tip`, the integrated waves and tickets and `behindTrunk`, and rebuilds `branch.json` from the trailers when a wave is missing.
- `sync`: merges trunk into the branch, never rebases, and on a conflict aborts, lists the paths and exits non-zero.
- `land [--partial]`: syncs, then in `pr` mode pushes the branch, opens one PR with a `Closes` line per ticket, waits for its checks and merges it with `landing.specMergeMethod` (a merge commit by default, ignoring `pr.mergeMethod`). In `merge` mode it merges into local trunk with `--no-ff` and never pushes. It appends `spec.land`.
- `abandon --force`: tags `abandoned/spec-<id>`, deletes the branch, appends `spec.abandon` and resets the integrated tickets of a local tracker to `ready-for-agent`; without `--force` it refuses.

`emet tracker frontier` counts tickets listed in `branch.json` as closed blockers, and `emet status` gains `specBranch` (`branch`, `tip`, `integratedWaves`).

### `emet spec-merge`

`emet spec-merge --spec <id>` merges the spec's `ADDED`/`MODIFIED`/`REMOVED` requirement deltas into `docs/specs/<area>.md` (`specs.dir`).

- `--deltas-dir`: prints the directory the deltas go in.

With `specs.enabled` on, the coordinator writes the deltas and runs it once per spec, on the last wave's integration branch before its review, then commits the result. It checks every area before writing anything. A conflict, or a requirement that would lose a scenario, exits 1 and leaves every file untouched. With `specs.enabled` off it merges nothing and exits 0.

### `emet map`

`emet map [--refresh]` writes a brief of an existing codebase (stack, structure, conventions, testing, hotspots) to `docs/agents/codebase.md` (`map.path`), stamped with the commit SHA it was built from. The same commit always produces the same file.

- `--refresh`
- `--stale`: exits 1 once HEAD has moved past the stamp, and `emet preflight` warns in that case.
- `--for <globs>`: prints only the sections that match a ticket's edit surfaces; that output is the only part of the map a worker brief includes.

### `emet guard`

The Claude Code `PreToolUse` hook; reads hook JSON on stdin (the Codex form is under [Codex host](#codex-host)). `emet self install` wires it into `~/.claude/settings.json`. It blocks a handful of known, unattended-run failure triggers (see `emet/src/guard.ts`).

## Local tracker

With `tracker.kind: "local"`, specs and tickets are markdown files under the main worktree's `.scratch/` (not versioned): `.scratch/<slug>/spec.md` and `.scratch/<slug>/issues/<NN>-<slug>.md`, each with `Status:` and `Blocked by:` lines and comments under `## Comments`. `emet init --tracker local` sets this up. See [ADR-0011](../adr/0011-local-tracker-scratch-convention.md).

`landing.mode` is `"pr"` (default) or `"merge"`, independent of the tracker. In `merge` mode a wave lands as one local merge into trunk with `emet land`, with `commands.selfCheck` standing in for CI and no push. With `landing.unit: "spec"` (default) the whole spec lands once through `emet spec-branch land`. `gh` is only required when the tracker is `github` or landing is `pr`. See [ADR-0010](../adr/0010-local-merge-landing.md) and [`landing`](configuration.md#landing).

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` is the local tracker over `.scratch/`, JSON on stdout. The coordinator reads and writes specs and tickets through it.

#### `emet tracker close`

With `tracker.kind: "github"`, `emet tracker close <ticket>... [--pr <n>]` closes each ticket (`CLA-<n>`, `#<n>` or a bare number) with `gh issue close --reason completed`, verifies its state and reports `closed` or `already-closed`.

- `--pr <n>`: adds the comment "Landed in #<n>".

For each distinct parent of a `closed` or `already-closed` ticket it then reads `gh issue view <spec> --json state,subIssuesSummary`. When the spec is open and `subIssuesSummary.completed` equals a non-zero `total`, it closes the spec with `gh issue close --reason completed` and the comment "All <total> tickets landed.", then verifies it.

The output gains `specs`, one `{ spec, outcome, detail? }` per distinct parent with outcome `closed`, `open`, `already-closed` or `failed`. A ticket without a parent adds none, and a failed spec read or close never changes a ticket result. It exits `1` if any ticket or spec failed, after processing the rest. Linear tickets are confirmed Done by the coordinator through the Linear MCP.

## Landing PRs and chaining waves

With `landing.unit: "wave"`, one wave is one PR; with `"spec"`, one PR covers every integrated wave. Its body carries one `Closes #N` line per ticket (the tracker's closing keyword), and the coordinator moves the tickets to in-review when it opens the PR. The PR is then merged per `pr.autoMerge`, or left open when the wave was flagged, `autoMerge` is `false`, or CI fixes ran out (the PR then gets the human-decision label). Later waves run in their own sessions, never in the one that ran wave 1. The `pr` and `handoff` sections control what happens next; see [`pr`](configuration.md#pr) and [`handoff`](configuration.md#handoff).

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` polls the PR's checks until they finish or the timeout (default 30) passes. It prints `state: pass | fail | env-fault | timeout`, the failed checks and `flakeReruns`, and never merges.

- `--rerun-flakes`: reruns each failed check once through `gh run rerun --failed`; a check that passes on the rerun is a Flake.
- `--timeout-minutes <m>`

A PR with no checks is `pass` with `noChecks: true`. Exit `0` pass, `1` fail or env-fault, `3` timeout. `env-fault` means checks that ended `STARTUP_FAILURE` or stayed queued too long: a CI that never ran, not a code failure.

## Codex host

These commands serve the Codex Agent host (`agentHost` `"codex"`); see the [Codex guide](../how-to/use-codex.md).

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: after checking the claim and the slot, creates `.emet/worktrees/agent-<ticket>`, builds a per-run `CODEX_HOME` overlay and starts the worker as a detached `codex exec`.

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`: blocks until it exits and prints the recorded result status.

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` runs the reviewer as a read-only `codex exec` over a package from `emet review-package` and prints findings JSON for `emet review --findings`. The `passive` tier starts no process.

- `--browser-verify true|false`: defaults to `false`. With `true` the prompt ends with the Browser axis, with `--session review-<run>` filled from `--run`, so the Codex reviewer verifies the UI as the Claude reviewer does (pass it when `emet assess` printed `browserVerify.run: true`; see [`verify`](configuration.md#verify)). Without the flag the prompt is unchanged, and a value other than `true` or `false` exits 2 with the usage line.
- `--coverage-out <file>`: also writes the Codex reviewer's Coverage verdicts to `<file>` as a JSON array (stdout still prints only the findings); use it on the Codex host, where one reviewer runs.

Findings may carry the optional `s` and `userOption` fields described under `emet review`.

### `emet launch` on Codex

`emet launch <spec-id> --wave <n>` starts a detached `codex exec` running `$emet:run --dispatch <spec>` and records its thread id. No Orca tab is opened, and `codex exec resume <id>` continues the session.

### `emet guard` on Codex

With `EMET_AGENT_HOST=codex`, `emet guard` reads Codex hook input, checks `apply_patch` paths against `.emet/surface.json` and keeps the approval gate closed until a prompt line `approve <id>`.

## Gates and records

The phases do not decide on their own when a ticket is done, mergeable or worth retrying. They call a CLI command that reads a record on disk and prints the decision. Run records live under `.emet/runs/<run-id>/` and the review ledger under `.emet/review/`, in the main checkout, not in a worker's worktree. The commands below are listed in pipeline order.

### `emet validate`

Before approval: `emet validate --spec <id> | --file <plan.json>` runs plan validation.

- Every `S#` is covered by at least one ticket and has an acceptance scenario.
- Every ticket covers at least one `S#`.
- Edit surfaces are disjoint within a wave.
- There are no dependency cycles.
- With [`validate.coupledSurfaces`](configuration.md#validate), a `coupled-surface-split` error when a ticket touching a pair's `source` is in an earlier wave than a ticket touching its `dependents` (exit 1).
- An empty ticket list is a `no-tickets` error (exit 1, "plan has no tickets; write one folded ticket"), with or without `S#` items. A plan with one ticket marked `folded: true` that covers every `S#` passes.

`emet preflight` runs it again on the approved plan.

### `emet approve`

Approval: `emet approve --run <id> --spec <file>` writes `approval.json` with the spec and ticket-list hashes. Dispatch refuses if either changed afterwards (`--check`).

- `--quick`: also writes `"mode": "quick"`, which makes the landing unit `wave` for that run. Without it the field is absent and older records still pass `--check`.

### `emet materialize-log`

Ticket creation: `emet materialize-log --run <id> --record/--lookup` saves each created ticket's ID as soon as it exists, so an interrupted run never creates duplicates.

### `emet results`

Worker done: `emet results --run <id> --write/--read <ticket>`. Workers write a local result file (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` or `NEEDS_CONTEXT`, plus a `Risk:` line). Only the coordinator writes to the tracker.

### `emet verify`

After each worker: `emet verify <ticket> --run <id>` checks that commits exist beyond the dispatch baseline, every changed path is inside the ticket's edit surfaces, the handoff note passes `handoff --check`, and `commands.workerScopedSuite` passes. Review and merge refuse a ticket without a pass record.

### `emet review-package`

Review input: `emet review-package <base> <head> --out <file>` bundles the diff for the reviewer, who receives it as a file path. Exits 3 if the range is empty or not a descendant of base.

### `emet review`

Review: `emet review --ticket <t> --findings <file>` keeps the findings ledger and enforces triage order (`intent_gap` → `bad_plan` → `patch` → `defer`) and the round cap.

- `--base <ref>`: resolves `<ref>` to a sha on the first round and stores it; later rounds reuse it, and a different sha exits 2 naming the stored one. A finding on a line the diff `<base>..HEAD` did not add or change is stored with `preexisting: true`, and `emet gate` does not count it as blocking.
- `--findings <file>`: findings accept the optional `s: "S<n>"` (the requirement concerned), `userOption: "S<n>"` and `agreement: "both"` or `"single"`. A `userOption` finding contradicts a `(user option)` requirement: it is always blocking, even when pre-existing, and under `gate.onHold: fix-and-continue` it holds with `next: fix-findings`. A non-string `userOption` exits 2.
- `--coverage <file or -> [--expect S1,S3]`: stores a JSON array of Coverage verdicts `{s, verdict, test:{file,name}}` (`verdict`: `met`, `partial`, `unmet`) as the ledger's `coverage`, replacing the previous one, and uses no review round. It opens a `VG-S<n>` finding (major, `patch`) for each `met` whose `test` is missing, whose file does not exist or does not contain `test.name`, and for each `--expect` S# with no verdict. A `VG-` finding closes only when a later `--coverage` no longer produces it or a recheck verdict resolves it, never by being absent from a `--findings` round. It prints `{coverage, open}` and exits 1 while any finding is open; it runs no tests.
- `--merge <a.json> <b.json>` (no `--ticket`): prints one merged findings array for `--findings -`. Two findings pair when they share `s` or share `file` with lines at most 3 apart, and a pair keeps the first file's `id`, the higher severity and `agreement: "both"`. An unpaired finding gets `agreement: "single"`, with a colliding id from the second file prefixed `X-`; a `userOption` finding is never dropped.
- `--recheck --verdicts <file>`: ends a fix round. Only findings open when it began are evaluated, a finding becomes `resolved` only through a verdict, and the recheck counts against `budgets.fixRounds` (exit 1 naming the cap when used up).
- `--escalate`: moves to the next model tier.
- `--rule` and `--rulings`: record and list the "Rulings I made" for the report and the PR body.

### `emet gate`

Merge or chain: `emet gate <ticket> --tier … --ci … --integration …` prints `merge`, `hold`, `chain`, `stop` or `defer` as JSON with its reasons. It reads the verify record, the open findings, the risk tier, CI, the integration suite and the budgets. A `hold` carries `next`: `fix-findings`, `rerun-failed-specs`, `rerun-ci` or `report-infrastructure`. See [`gate`](configuration.md#gate).

- `--no-record`: keeps the decision out of the journal.

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
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` disables `emet self update --auto`: it exits 0 without a network call. Same as `emet self update --auto off`.                                                     |
| `EMET_AGENT_HOST`             | `codex` makes `emet guard` read Codex hook input. Set by the Codex hooks; leave it unset on Claude Code.                                                                               |

The `auto` cap is `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`. The legacy `FORGE_*` names are still read; `EMET_*` wins when both are set.

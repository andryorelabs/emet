# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.20.0] - 2026-11-22

### Added

- `emet guard` records a `session.attention` journal event, `{sessionId, state, from, trigger}`, when an emet-owned session changes state between `working`, `idle`, `needs-decision` and `ended`. An event is appended only when the state differs from the session's last recorded one. The journal never stores notification text, prompts or tool input, and recording never changes a guard verdict, stdout or exit code.
- `hooks/hooks.json` and `install.sh` wire the `Notification`, `PermissionRequest`, `SessionEnd` and `UserPromptSubmit` hook events to `emet guard --event <Event>`. `install.sh` stays idempotent. `codex/hooks.json` is unchanged.
- `emet status` JSON gains `sessions: [{sessionId, state, blocked, since, runId}]`, the latest state of each session of the repo in the last 24 hours, excluding `ended`. A blocked session makes the overall state `needs-decision` and is named in the summary line and in `--brief`.
- `emet fleet status [--json]` prints the latest session states per repo from the global journal, blocked repos first.
- On a transition into `needs-decision`, emet raises one alert: an unread mark and comment on the repo's Orca worktree when Orca is reachable, otherwise `notify-send` when it is on PATH. `attention.alert` (boolean, default `true`) is added to the config schemas and turns it off.
- `docs/reference/cli.md`, `docs/reference/configuration.md` and `docs/guide/fleet.md` document the session attention features, in all nine locales.

## [0.19.0] - 2026-11-22

### Added

- `emet memory search --json <query> [--limit <n>]` and `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` read and write Lessons in Engram. `search` keeps the notes whose topic key starts with `emet/<repo>/lessons/` and prints their full content, `save` appends one section per run to the note for the spec or quick run from 1 to 5 bullets on stdin. Both print one JSON object, exit 0 on every Engram problem and exit 2 only on bad usage.
- `memory.enabled` (`auto` or `off`, default `auto`) is added to the config schemas. `off` never spawns `engram`.
- Phase 1 searches memory for prior Lessons before the first interview round and writes the relevant ones under `## Prior lessons` in the plan file. The wave and quick hand-offs save the run's Lessons before the final report. `--draft` saves nothing.
- `docs/reference/cli.md` and `docs/reference/configuration.md` document `emet memory` and `memory.enabled`, in all nine locales.

### Changed

- The Codex build rejects `mcp__engram` in a generated reference, so Engram tool names never reach the Codex plugin.
- `/emet:run` prompts gain the memory steps above; with no `engram` on PATH, or `memory.enabled: "off"`, each step is a one-line note and the run goes on as in 0.18.0.

## [0.18.0] - 2026-11-22

### Added

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` stores Coverage verdicts in the ledger. A `met` verdict whose test is missing or not found in the working tree, and an expected S# with no verdict, each open a `VG-S<n>` finding.
- `emet review --base <ref>` stores the review base on the first round and marks a finding on a line the wave did not touch as `preexisting`. `emet gate` never counts a pre-existing finding as blocking.
- Findings accept the optional fields `s`, `userOption` and `agreement`. An open finding with `userOption` blocks at every tier and severity, and the gate answers `hold` with `next: "fix-findings"`. Phase 2 writes an S# that comes from an option the user chose as `(user option)`.
- `emet review --merge <a.json> <b.json>` merges two findings arrays into one. Findings pair when they share `s`, or share `file` with lines at most 3 apart, and each gets `agreement: "both"` or `"single"`.
- `emet assess` prints `dualReview: {run, reason}`, and `review.dual` (`auto` or `off`, default `auto`) is added to the config schemas. On the Claude host with `codex` on PATH, a `high` wave runs a Dual review: `emet:emet-reviewer` and `emet review-run --tier high --coverage-out <file>` in parallel, then `emet review --merge`.
- `emet review-run --coverage-out <file>` writes the Codex reviewer's Coverage verdicts, and its output schema accepts nullable `s` and `userOption`.
- `docs/reference/cli.md` and `docs/reference/configuration.md` document the review changes, in all nine locales.

### Changed

- The reviewer prompt and `agents/emet-reviewer.md` ask for a Coverage verdicts file, `.emet/coverage-<run>.json`, instead of a prose `S<n>: met | partial | unmet` line. Phase 8 records the verdicts with `emet review --coverage` and lists pre-existing findings in the wave report without fixing them.
- Without `--base`, `--coverage`, `--merge` or a Dual review, every command behaves as on 0.17.0.

## [0.17.0] - 2026-11-22

### Added

- `/emet:run --quick <change>` runs a Quick run for a change that fits one ticket: one interview round, a spec with one folded ticket, one approval, one worker, review, and the Landing of that single Wave as a PR (or a local merge), with no `emet chain`. It stops before approval and recommends `/emet:run` without `--quick` when the change touches a screen or does not fit one ticket, and it is rejected together with `--draft` or `--dispatch`. `--no-promote` is accepted. The steps live in the new `emet/reference/phases-quick.md`. See ADR-0039.
- `emet assess --quick` prints the usual JSON plus `"quickRejected"`, and exits `1` when the tier is `high`. A Quick run treats that as a Gate Stop: no auto-merge, the PR stays open, and the final report names the high-risk reasons. Without `--quick`, the output and exit codes are unchanged.
- `emet approve --quick` writes `"mode": "quick"` into `approval.json`. Records written before this change still pass `--check`.
- `resolveLandingUnit(config, runId, root)` returns `wave` for a quick-approved run and `config.landing.unit` otherwise. `emet landed`, `emet status` and `emet preflight` read the landing unit through it, so a Quick run never expects a spec branch.
- `emet validate` reports a `no-tickets` error when a plan has no tickets and says to write one folded ticket.
- `docs/reference/cli.md` and `docs/guide/trackers-and-landing.md` document the Quick run, in all nine locales.

### Changed

- The fast-path sentence in `phases-1-5.md` now says to write one ticket marked `folded` for a request below the threshold, instead of writing no tickets.
- `emet preflight --approval <run>` resolves the landing unit from that run's approval record when `--run` is absent.

## [0.16.0] - 2026-11-21

### Added

- Living specs, off by default. With `specs.enabled: true`, on a spec's last wave the coordinator writes the spec's `ADDED`/`MODIFIED`/`REMOVED` requirement deltas, runs `emet spec-merge --spec <id>` once on that wave's integration branch before its review, and commits the updated `docs/specs/<area>.md`, so the change is reviewed and lands in the same PR. A new reference, `living-specs.md`, gives the delta format and the retry rule. See ADR-0038.
- `specs.enabled` (default `false`) in the config and both schema copies. `emet init` writes `"specs": { "dir": "docs/specs", "enabled": false }`.
- `emet doctor` warns, only when `specs.enabled` is `true`, if `specs.dir` is gitignored or is a file. A missing `specs.dir` is not a warning.
- `emet spec-merge --spec <id> --deltas-dir` creates and prints the shared deltas directory, `<git common dir>/.emet/runs/<id>/spec-deltas`, and exits `0` without merging.
- `landing.specMergeMethod` accepts `merge` (default), `squash` and `rebase`, so a spec lands on a trunk that allows only squash merges. `emet doctor` warns when the repository settings or the trunk ruleset disallow the configured method. See ADR-0037.
- `bun run check:codex` fails on a file in a generated `codex/` directory that has no source.

### Changed

- With `specs.enabled` off, `emet spec-merge` prints `specs.enabled is false; nothing merged` and exits `0`. It reads deltas from the shared run dir under the git common dir, falling back to the per-checkout `.emet/runs/<id>/spec-deltas/`.
- The Phase 8 prompts no longer run `emet spec-merge` after a wave or spec lands; `phases-8-review.md` loads `living-specs.md` on the last wave instead.
- `emet spec-branch land` waits for the PR's checks with the same poller as `emet ci`, polling through a PR that has no checks yet, and merges with `landing.specMergeMethod`.

### Fixed

- `emet spec-branch land` no longer merges before GitHub has registered any checks.
- `emet setup` lists the Claude plugins once instead of up to three times, and its quiet probes time out instead of hanging.
- `emet doctor` lists the installed plugins once per run.
- `bun run lint` and `bun run fix` generate the Astro types for the site first, so they pass on a fresh checkout.

## [0.15.0] - 2026-11-21

### Changed

- `landing.unit` defaults to `spec`: a spec's waves are integrated into the branch `spec/<id>` with `emet spec-branch` and the spec lands once, as one PR (or one local merge in `landing.mode: merge`), instead of one PR per wave. Set `"landing": { "unit": "wave" }` to keep the old behaviour. `spec` mode needs `worktree.baseRef: "head"` in the Claude Code settings. See ADR-0037.
- The journal gains the kinds `spec.integrate`, `spec.land` and `spec.abandon`, and `emet status` gains `specBranch`.

## [0.14.5] - 2026-11-21

### Added

- `emet handoff --check` parses a `skills:` section in a worker's handoff note (`none`, or `loaded: a, b; missing: c`). It is required when `state` is `done`. `--expect-skills a,b` fails the check for each named skill that is in neither list and prints the missing ones.
- The dispatch record carries an optional `skills` array, and `emet verify` passes it to `emet handoff --check` as `--expect-skills`. A record without `skills` still parses.
- ADR-0036 lets a ticket change the wording of an installed prompt when it names the paragraphs, and the same pull request raises the byte ceilings.

### Changed

- The Phase 8 prompt is split into `phases-8-review.md` and `phases-8-landing.md`. `install.sh` retires the old `phases-8-closeout.md`: an edited or pre-manifest copy moves to `phases-8-closeout.md.retired`, an unedited copy is deleted.
- The worker prompt tells the worker to write the `skills:` line before its final handoff.
- The architecture page, the CLI reference and their nine translations describe the two Phase 8 files and `--expect-skills`.

## [0.14.4] - 2026-11-20

### Added

- `emet doctor` on the Codex host warns when the emet plugin is enabled in `$CODEX_HOME/config.toml` but Codex has not trusted any of its hooks, so the emet guard does not run. The warning does not change the exit code.

### Fixed

- When the release asset for the plugin's version cannot be downloaded yet, `bin/emet` runs the newest cached binary for every command, not only `emet guard`, and prints one notice that the release may still be publishing. With `EMET_PREFETCH=1` it prints the notice and exits `0` without running it. A checksum mismatch or a missing `SHA256SUMS` still never falls back, and the download staging directory is removed before the fallback runs.

## [0.14.3] - 2026-11-20

### Added

- `emet fleet launch --dry-run` runs the readiness checks and prints `would launch <name>` for each repo without starting a session.

### Fixed

- `emet migrate` removes untracked legacy `.forge/` run files that differ from their `.emet/` copy and keeps the `.emet/` one, so it finishes in repos with leftover logs. Every conflict it cannot resolve is listed together with the manual step, and a git failure inside a repo is treated as a conflict instead of deleting the file.
- The test preload removes its `emet-test-state-*` directory when the run ends, so `bun test` no longer leaves one temp directory per run.

## [0.14.2] - 2026-11-20

### Fixed

- `emet promote` waits for the sync pull request's checks and merges it only when they pass, instead of merging it at once. A sync pull request that fails, times out or is rejected stays open without failing the promote, and the outcome and journal event carry `syncMerged` and `syncReason`.

## [0.14.1] - 2026-11-20

### Added

- `emet tracker close` closes the parent spec issue of a GitHub ticket when its last sub-issue is closed, and reports each spec in a new `specs` field. A failed spec read or close exits `1`.
- The spec closes even when GitHub's sub-issue summary has not caught up yet: the sub-issues of the spec are counted one by one, including the tickets closed in the same call.

## [0.14.0] - 2026-11-20

### Added

- `emet init` sets `schema.ownedPaths` when it finds a Prisma schema
  (`prisma/schema.prisma` or `prisma/schema/`) or a Drizzle migrations folder, and drops
  the schema-ownership `TODO(emet):` marker.
- The `agent-browser` setup item writes `~/.agent-browser/config.json`
  (`contentBoundaries` and `maxOutput`) when it does not exist, and runs
  `agent-browser doctor` after the install. See ADR-0035.
- `emet setup` prints an AppArmor profile for the Chrome that `agent-browser`
  downloaded, and the `sudo` commands to load it, when the host restricts unprivileged
  user namespaces. It never runs `sudo`.

### Changed

- The `firecrawl-local` setup item registers the MCP server with
  `FIRECRAWL_CLOUD=search` instead of `off`, replaces an earlier registration, and
  passes the newest `agent-browser` Chrome as `FIRECRAWL_CHROME_PATH`. See ADR-0035.

### Fixed

- `emet setup` registers the `firecrawl-local` MCP server with the server name
  first, so the registration is parsed correctly.
- `emet --help` lists every command in the registry (setup, fleet, insights, chain,
  promote, whats-new, deploy-check, ci, run).
- Tests no longer write to the real journal under `~/.local/state/emet`.

## [0.13.0] - 2026-11-20

### Added

- `emet setup` offers `context7` and `firecrawl-local` items (both off by default).
  `context7` installs the `ctx7` CLI and its `find-docs` skill. `firecrawl-local`
  builds Firecrawl Local with `cargo` and registers it as a local-only MCP server
  (`FIRECRAWL_CLOUD=off`, `--public-only`). See ADR-0034.
- `emet review-run --browser-verify true|false` passes the browser axis to the
  Codex reviewer.
- `validate.coupledSurfaces` in `emet.config.json` and the `coupled-surface-split`
  error of `emet validate` keep a page and its translations in one wave. See
  ADR-0033.

## [0.12.0] - 2026-11-20

### Added

- `verify.browser` in `emet.config.json` (`startCommand`, `url`, optional
  `paths`) opts a repository into browser verification of UI changes with
  `agent-browser`. The config schema and its parser validate every field.
- `emet assess` prints `browserVerify: { run, reason }`. The browser axis runs
  only when the wave has a reviewer, `verify.browser` is configured,
  `agent-browser` is on PATH and a changed path matches `paths`.
- `emet setup` offers an `agent-browser` item (off by default) that installs the
  latest release and its browser.
- `emet doctor` reports an optional agent-browser finding for a repository that
  configures `verify.browser`. A missing binary or a failing `agent-browser
  doctor` is a note or a warning and never changes the exit code.
- The reviewer prompt gains a Browser axis, filled only when `browserVerify.run`
  is true, and the worker prompt gains one optional line for browser checks.
  See ADR-0032.

## [0.11.1] - 2026-11-19

### Fixed

- On native Windows (Git Bash) and on any unsupported OS or architecture,
  `bin/emet` exits 0 instead of failing, so the PreToolUse guard no longer
  blocks every tool call. Only the session-start prefetch prints one notice.
- `install.sh` refuses to run on `MINGW*`, `MSYS*` and `CYGWIN*` before it
  writes anything.
- The Codex hooks carry a `commandWindows` override, so Codex on Windows
  (PowerShell) no longer errors on every event.

## [0.11.0] - 2026-11-19

### Added

- `emet whats-new` prints a one-line notice linking to the release notes the
  first time emet runs after an update, then records the running version. With
  `--hook` it emits the line as a `systemMessage` JSON object for session
  hooks.

## [0.10.0] - 2026-11-19

### Added

- `handoff.afterSpec` accepts an ordered list of `{ paths?, mode }` rules, so a
  repository with a CLI and a Website can release the CLI and promote the
  Website. The mode is chosen from the paths promoting `develop` would carry
  into `main`.
- `deploy.check.paths` limits the deploy check to promotes that touched the
  listed globs.
- `emet promote` prints and journals `rule` and `reason`, and prints
  `deployCheck: { run, reason }`.

### Changed

- The deploy check no longer depends on `afterSpec`: it runs after a clean final
  wave on trunk `main`, and after a merged promote on `develop`. The coordinator
  runs `emet promote` after every spec, also under `afterSpec` `none`.

## [0.9.1] - 2026-11-19

### Fixed

- `emet setup` accepts `--data-dir`, so the plugin's SessionStart hook no longer
  fails with `unknown flag --data-dir`.

## [0.9.0] - 2026-11-19

### Added

- `emet gate` applies a fix-and-continue policy: a held wave runs fix rounds
  until the findings resolve or `budgets.fixRounds` (default 2) runs out, then
  stops. `gate.onHold` selects `fix-and-continue` (default) or `stop`.
  `emet review --recheck` resolves a finding only through a reviewer verdict.
- `emet ci --wait` polls a pull request's checks, reruns flaky jobs, and reports
  `pass`, `fail`, `env-fault` or `timeout`. `emet tracker close` closes GitHub
  tickets idempotently, and `emet chain` runs gate, readiness, launch and
  verify as one step.
- An event journal records gate decisions, interventions, launches, ticket
  closes and cleanups, with size-based rotation. `emet insights` summarises it
  (`--mark-baseline` resets the baseline), `emet run current` shows the active
  spec and wave, and `emet status --brief` prints a one-line state.
- `language.conversation` and `language.artifacts` config keys.
- `handoff.afterSpec` (`release`, `promote` or `none`, detected by `emet init`,
  or set with `emet init --after-spec`), `deploy.check` and `interview.research`
  config keys.
- `emet promote` opens the `develop` to `main` pull request once the final wave
  is idle, merges it when checks pass, and syncs `main` back when `develop`
  is behind. `--no-promote` holds a spec for all its sessions.
- `emet deploy-check` retries a deploy check command and kills hung commands.
- `emet fleet list | set | launch` runs specs across several repos.
- `emet setup` and `/emet:setup` install optional companions from a catalog
  after backing up Claude settings. A SessionStart hook shows a one-time
  notice, and `install.sh` runs setup on a TTY.
- `emet doctor` and `emet init` recommend Engram without ever counting it as
  an unsatisfied dependency.

### Changed

- The installed prompts and docs describe the gate policy, `emet ci`,
  `emet chain`, the journal, the after-spec step, fleet and setup. Phase 8
  adds a wave summary and a push notification, and `emet insights` replaces the
  `/retro` pointer.

### Fixed

- `--no-promote` is persisted as a marker under the git common dir, so a
  chained `/emet:run --dispatch` session for the last wave no longer promotes
  `develop` into `main`.

## [0.8.6] - 2026-11-17

### Fixed

- The release workflow installs Chromium before it re-runs the checks on the
  tag, as the CI test job does, so the verification no longer stops at the
  `tools/` coverage floor. v0.8.5 was tagged but never published because of
  this; its changes ship in this release.

## [0.8.5] - 2026-11-17

### Changed

- The coverage gate enforces a per-file floor of 97% lines and 98% functions
  for `emet/`, `apps/site` and `tools/`, with reasoned exceptions in
  `tools/coverage-exceptions.ts`. The coverage manifest walks `emet/src`
  recursively, `tools/` is gated, the totals in `tools/coverage-floors.json`
  rise to the measured values.
- The PreToolUse guard fails closed: when `bin/emet` cannot resolve the emet
  binary, the hook exits 2 and blocks the tool call, with a message that says
  how to recover. The Stop and SubagentStop hooks still exit 1.
- The plugin manifests carry an author email, license, homepage, repository and
  bugs URL, and the Codex skill descriptions say when to use each skill.

### Fixed

- `emet doctor` exits with code 3 when an unexpected error escapes, instead of 0. A non-zero exit code set earlier is kept.
- `emet cleanup --all --force` reclaims the worktree and the branches of a dead
  run's worker, including the worktrees under `.claude/worktrees/`. A live or
  idle owner, and a lock that names no run, stay protected.
- The edit guard matches a surface written literally, such as
  `src/app/[locale]/page.tsx`. `[` and `]` in a surface are no longer a
  character class.
- `emet preflight --post-dispatch` fails when a ticket that still holds a claim
  or a slot has lost its worker worktree, and tells the coordinator to
  re-dispatch it instead of resuming it.
- The compiled `emet` binary no longer loads a `.env` file from the current
  directory.
- The Website drops the inline style attributes on the home page, gives the
  home labels AA contrast in light mode, and names the search button with its
  visible text from the first paint. The docs images are served from the
  site's own origin under `repo-assets` instead of
  `raw.githubusercontent.com`, and `astro dev` serves them too.

## [0.8.4] - 2026-11-15

### Changed

- The home page header is now two edge groups, with the wordmark and Docs on
  the left and search, GitHub stars, theme and language on the right. Its
  controls and the release pill are translucent glass over the sky, and the
  duplicate What's new link is gone from the home header and menu.

## [0.8.3] - 2026-11-15

### Fixed

- `/docs/` and each locale's `/docs/` now answer with a 301 to the
  getting-started page instead of a meta-refresh stub that flashed an unstyled
  page.

## [0.8.2] - 2026-11-11

### Fixed

- `emet cleanup` keeps a `worktree-<name>` scaffold branch while the worktree
  `<name>` still exists, so a session working there on another branch keeps
  the branch its host expects.

## [0.8.1] - 2026-11-11

### Added

- `emet cleanup` deletes the `worktree-<name>` scaffold branches the Agent host
  leaves behind, when nothing has them checked out and trunk already contains
  their tip.

### Fixed

- The guard denies a forced branch delete in every spelling that pairs a
  delete flag with a force flag, not only the capital flag.

## [0.8.0] - 2026-11-11

### Added

- `emet cleanup` deletes each local branch whose pull request merged at the
  branch's tip commit, in every mode, together with the clean, unlocked agent
  worktree that holds it. Integration, release and fix branches no longer wait
  for a manual delete.
- `bun run translations:status` lists the Website translations that are behind
  their source.

### Changed

- The guard's denial of a forced branch delete points at `emet cleanup`.
- The release runbook covers the `whats-new` translations.

## [0.7.0] - 2026-11-11

### Added

- The Website serves the config schema at
  `https://emet.andryore.dev/schema/emet.config.schema.json`.
- `docs/development.md` and `docs/security.md`.
- A coverage floor per workspace that `bun run test` enforces.

### Changed

- `emet init` writes the public `$schema` URL into `emet.config.json` instead of
  a local path.
- Release tags are signed, and the Release workflow fails when the CHANGELOG
  section for the tag is missing or empty.
- The repo follows the andryorelabs standard v1: rulesets as code, community
  files, README layout and standard script names (`format:write`,
  `lint:commits`).

## [0.6.1] - 2026-11-10

### Fixed

- Two processes reclaiming the same stale lock at once can no longer both enter
  the critical section; claims, the Mailbox, the tracker and `acquireLock` share
  one guarded reclaim.
- Concurrent `emet tracker create-ticket` calls no longer fail intermittently.

## [0.6.0] - 2026-11-10

### Added

- A Mailbox for Codex workers: `emet ask` records a question (and polls with
  `--wait`), `emet inbox` lists open questions and `emet reply` answers one, so
  a worker no longer escalates through a handoff note.
- `emet dispatch --wait` prints `question <ticket> <id>` while a live worker has
  an open question, and never classifies that worker as stalled.
- `emet claims --reserve` stores the ticket's edit surfaces and denies a
  reservation that overlaps another run's surfaces.

### Fixed

- `emet dispatch --wait` reads results from the git-common-dir run directory,
  where `emet results --write` writes them.

## [0.5.2] - 2026-11-10

### Changed

- The not-affiliated notice names OpenAI as well as Anthropic.
- The home page install tabs say Claude Code, and the run command has a Codex
  tab with `$emet:run`.
- The guides label host-specific steps: what each plugin ships, the
  `/emet:*` commands versus the `$emet:*` skills, `/setup-matt-pocock-skills`,
  updating and auto-update, and the generated `codex/` files.

### Fixed

- `emet doctor`, `emet init`, `emet dependencies` and `emet preflight` no
  longer give Claude-only advice on the Codex host, and doctor no longer warns
  about the Codex plugin and `install.sh` together.
- `emet init --force` keeps `agentHost` and the `codex` section of the existing
  config instead of turning a Codex repo into a Claude Code one.

## [0.5.1] - 2026-11-10

### Changed

- The README, landing, banner, guides and share images name Codex alongside
  Claude Code.

## [0.5.0] - 2026-11-10

### Added

- The Website home page: painted hero, how it works, features, about, closing
  panel, header and footer, with English strings in `apps/site/src/i18n/ui/en.ts`.
- The Website docs at `/docs/`: Starlight pages built from an allowlist of
  repository docs and this changelog, with Pagefind search, link rewriting to
  site pages or GitHub, and an English fallback notice for missing or stale
  translations.
- `docs/how-to/update-emet.md`: how to update the plugins and turn on
  marketplace auto-update.
- Codex as an Agent host: `agentHost` in `emet.config.json`, `emet dispatch`
  and `emet review-run` start each worker and reviewer as a `codex exec`
  process, the `$emet:run`, `$emet:init` and `$emet:doctor` skills and the
  Codex plugin manifest, and the opt-in end-to-end test (`EMET_CODEX_E2E=1`).
- `docs/guide/codex.md`, the Codex guide, published on the Website.

### Changed

- The Codex `codex.sandbox` default is `danger-full-access` (`workspace-write` is
  still accepted), passed by `emet dispatch`, `emet review-run` and a Codex
  `emet launch`; `emet guard` on Codex denies every push form.
- The per-run Codex overlay writes its own minimal `config.toml` instead of
  linking yours, and its rules allow the `-C` forms and the coordination
  subcommands while pushing stays forbidden.
- Codex workers are identified by their `threadId` and JSONL path, not their pid.
- The Codex guide reports the real-Codex results: every previous `failed` row is
  `verified`, the `unverified` list shrinks to unattended supervision, and the
  probe report lists the remaining follow-ups.

### Fixed

- `emet cleanup` reclaims landed unowned worktrees.
- The Codex Agent host resolves by default, so `emet preflight`, `doctor`,
  `cleanup`, `status` and `usage` accept `agentHost: "codex"`.
- Codex model resolution reads `models_cache.json` from the run home or your
  real Codex home.

## [0.4.0] - 2026-11-06

### Added

- `emet-mascot` `position` option (`pane`, `band` or `status`); `pane` is the
  default and falls back to the band when it cannot dock.
- A "Mascot (optional)" section in the README.

### Changed

- `emet-mascot` frames are snapped to the six mascot colours instead of
  blurred by a resize, so the pixel art is crisp in the terminal.
- `emet-mascot` 0.2.0: the default `size` is now `small`.
- `docs/how-to/orca-pet.md` is now `docs/how-to/mascot.md`, covering the mod
  and the Orca pet.

## [0.3.0] - 2026-11-05

### Added

- `/emet:init` and `/emet:doctor` plugin commands run `emet init` and
  `emet doctor .` inside Claude Code and summarize the result.
- `emet doctor` warns about `forge guard` and `emet guard` hooks in
  `~/.claude/settings.json` whose binary no longer exists, and prints a
  backup-then-`jq` command to remove them. It never edits the file.
- Mascot foundations: a phase file, the pet bundle, a mod state machine,
  the remaining phase writers and raster frames.
- `emet-mascot`, an optional plugin that shows a pixel mascot above the prompt
  and mirrors the session and the `emet` run phase. It is listed in the
  marketplace, with a how-to for the Orca pet and ADR-0016.

### Fixed

- The plugin no longer exposes a broken duplicate `/emet:emet` command;
  `commands/` is pinned to `run.md`, `init.md` and `doctor.md`.
- The next wave now launches with `/emet:run`, the command the plugin
  registers.

### Changed

- The repository moved to the `andryorelabs` GitHub organization. Release
  downloads, the README badges and the clone URL now point at
  `andryorelabs/emet`; the old `AndryOre/emet` URLs keep redirecting.
- Standalone installs rename `/emet` to `/emet:run`, matching the plugin.
  `install.sh` now installs `commands/run.md`, `init.md` and `doctor.md` to
  `~/.claude/commands/emet/`, so `/emet:run`, `/emet:init` and `/emet:doctor`
  are available without the plugin. The old `~/.claude/commands/emet.md` is
  removed when unedited; an edited copy is kept and listed in the install
  summary.

## [0.2.0] - 2026-11-05

### Changed

- The project is renamed from claude-forge to emet: the CLI is `emet`, the
  command is `/emet`, the agents are `emet-worker` and `emet-reviewer`, and the
  README carries the new brand. Existing installs and repos keep working:
  legacy names (`forge.config.json`, `.forge/`, `docs/agents/forge.md`,
  `FORGE_*`) are still read with a notice, and `emet migrate` moves a repo to
  the new names.

### Added

- `install.sh` works without Bun: it installs the standalone-binary shim as
  `~/.local/bin/emet`, rewrites plugin placeholders in the prompts it copies,
  installs `commands/run.md` as `~/.claude/commands/emet.md` and accepts
  `shasum -a 256` in place of `sha256sum`.
- README states the real requirements, both install paths and the
  `/setup-matt-pocock-skills` then `emet init` order.
- Agent guide (`AGENTS.md`), domain glossary (`GLOSSARY.md`) and architecture
  decision records under `docs/adr/`.
- Local markdown tracker on the `.scratch/` convention, with a `emet tracker`
  CLI (`create-spec`, `create-ticket`, `frontier`, `set-state`, `comment`,
  `close`) and local-aware `emet validate`, `preflight` and `doctor`.
- `landing.mode` (`pr` or `merge`) and `emet land`, which lands a wave as one
  local merge without a PR; `emet cleanup` and `emet status` compare against
  local trunk in merge mode.
- Standalone `emet` binaries, `emet --version`, macOS support in CI and in the
  process-tree and memory brake, and plugin manifests with a `bin/emet` shim.
- Skills contract with `emet skill-path`, and a broader `emet doctor` covering
  skills, glossary, deprecations and double installs.
- Language-neutral `emet init` and `emet map` for JS, Go, Rust and Python repos.
- ADR-0007 to ADR-0011.
- Docs index, architecture code map, troubleshooting by symptom, a richer PR
  template and `emet/AGENTS.md` with the runtime-only rules.

### Changed

- `gh` is required only when `tracker.kind` is `github` or `landing.mode` is
  `pr`.
- `emet init` no longer selects the local tracker by default.
- ADR-0004 is amended: a wave lands as one PR or one local merge.

## [0.1.0] - 2026-11-03

### Added

- The global `/forge` command: interview, spec, tickets, one approval, then
  parallel worktree agents that implement, test and merge a feature unattended.
- The `forge` CLI with `init`, `doctor`, `preflight`, `selftest`, claims, slots,
  gates, handoff checks, results and metrics subcommands.
- The `forge-worker` and `forge-reviewer` agents.
- Trackers for Linear and GitHub Issues.
- Per-repo configuration through `forge.config.json`.
- `install.sh`, which installs the CLI, command and agents.

[Unreleased]: https://github.com/andryorelabs/emet/compare/v0.20.0...HEAD
[0.20.0]: https://github.com/andryorelabs/emet/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/andryorelabs/emet/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/andryorelabs/emet/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/andryorelabs/emet/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/andryorelabs/emet/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/andryorelabs/emet/compare/v0.14.5...v0.15.0
[0.14.5]: https://github.com/andryorelabs/emet/compare/v0.14.4...v0.14.5
[0.14.4]: https://github.com/andryorelabs/emet/compare/v0.14.3...v0.14.4
[0.14.3]: https://github.com/andryorelabs/emet/compare/v0.14.2...v0.14.3
[0.14.2]: https://github.com/andryorelabs/emet/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/andryorelabs/emet/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/andryorelabs/emet/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/andryorelabs/emet/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/andryorelabs/emet/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/andryorelabs/emet/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/andryorelabs/emet/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/andryorelabs/emet/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/andryorelabs/emet/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/andryorelabs/emet/compare/v0.8.6...v0.9.0
[0.8.6]: https://github.com/andryorelabs/emet/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/andryorelabs/emet/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/andryorelabs/emet/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/andryorelabs/emet/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/andryorelabs/emet/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/andryorelabs/emet/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/andryorelabs/emet/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/andryorelabs/emet/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/andryorelabs/emet/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/andryorelabs/emet/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/andryorelabs/emet/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/andryorelabs/emet/compare/20c1d29f407842ea6f26eab3338f883ee3701258...v0.5.1
[0.5.0]: https://github.com/andryorelabs/emet/compare/v0.4.0...20c1d29f407842ea6f26eab3338f883ee3701258
[0.4.0]: https://github.com/andryorelabs/emet/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/andryorelabs/emet/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/andryorelabs/emet/compare/9360b4ff9d22c1de31f1f0a18350023b29e0425c...v0.2.0
[0.1.0]: https://github.com/andryorelabs/emet/tree/9360b4ff9d22c1de31f1f0a18350023b29e0425c

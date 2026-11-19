# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/andryorelabs/emet/compare/v0.9.1...HEAD
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

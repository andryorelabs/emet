# Architecture

A code map of `emet/src` and how the `/emet` prompts drive it. Terms follow [GLOSSARY.md](../../GLOSSARY.md); decisions behind the shape live in [docs/adr](../adr/README.md). For problems, see [troubleshooting](../troubleshooting.md).

- [Shape](#shape)
- [How the prompts drive the CLI](#how-the-prompts-drive-the-cli)
- [Module map](#module-map)
- [Prompt layout](#prompt-layout)
- [Distribution](#distribution)
- [See also](#see-also)

## Shape

There are two halves. The prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`, and the generated `codex/skills/**` and `codex/hooks.json` for Codex) tell the agent what to do in each phase. The `emet` CLI (`emet/bin/emet.ts` and `emet/src/`) does everything that must be deterministic: checks, claims, slots, gates, tracker writes and landing. The prompts never re-implement a check the CLI already makes.

`emet/bin/emet.ts` is a thin dispatcher: it reads the first argument and hands off to one subcommand module, which reads the rest of `process.argv` itself. Exit codes are meaningful across subcommands.

## How the prompts drive the CLI

`commands/run.md` is a short router. It loads one `emet/reference/` phase file at a time, so a compaction never drops the rules for the current phase.

| Phase                                  | Prompt                                                                                        | CLI calls                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 interview, spec, tickets, approval | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 dispatch and workers               | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 review, gate, landing, closeout      | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 handoff and chaining                 | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

The coordinator is the single tracker writer (ADR-0005): workers report through a handoff note and `emet results`, and the coordinator posts them. `emet guard` runs as a `PreToolUse` hook and blocks known unattended-run failure triggers.

## Module map

Each module has a `*.test.ts` beside it. `tools/architecture-map.test.ts` fails when a non-test module of `emet/src` is missing from this list.

**Setup, install and audit**

- `init.ts` writes the config and the doc skeleton; `config.ts` reads `emet.config.json` (the legacy `forge.config.json` is still read); `names.ts` resolves a name to its current or legacy spelling.
- `doctor.ts` is the fleet sweep; `preflight.ts` checks dispatch hygiene; `dependencies.ts` and `skills.ts` (the mattpocock-skills contract) check what a run needs; `map.ts` writes the codebase brief; `plugin-detect.ts` reports which plugins are installed.
- `setup.ts` installs the optional extras, `setupledger.ts` records each change so it can be undone, and `settingsapply.ts` holds the recommended Claude Code settings.
- `self.ts`, `self-install.ts`, `self-source.ts`, `self-types.ts`, `self-update.ts`, `self-host-claude.ts` and `self-host-codex.ts` implement `emet self`: install, source installs, updates and the per-host files. `hooks-merge.ts` merges the emet hooks into the host settings, `uninstall.ts` undoes an install from the ledger, `migrate.ts` moves legacy names, `update-notice.ts` and `whats-new.ts` tell the person about new releases, and `embedded-tree.generated.ts` holds the files embedded in the compiled binary.
- `assets.ts` reads those embedded files.

**Run state**

- `claims.ts` holds ticket reservations, `slots.ts` the worker slot pool, `resources.ts` host facts, `runs.ts` liveness and `runcurrent.ts` the current run of a checkout.
- `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `mergedpr.ts` and `landed.ts` manage worktrees, locks and the cleanup of branches that landed.
- `status.ts` reports waves and sessions, `launch.ts` and `chain.ts` start runs and the next wave unattended, `fleet.ts` works across repos, and `phase.ts` records the current phase.
- `signals.ts` cleans up on an interrupt.

**Tracker and specs**

- `tracker.ts` and `tracker-files.ts` (the local `.scratch/` tracker) read and write tickets, `ticketclose.ts` closes them, `validate.ts` checks spec coverage, `approve.ts` records the approval and `surfaces.ts` finds edit-surface overlap.
- `specmerge.ts` folds spec deltas into the living specs; `specbranch.ts`, `speclanding.ts` and `specabandon.ts` manage the `spec/<id>` branch; `landing-unit.ts` resolves whether a run lands per spec or per wave; `afterspec.ts` and `promote.ts` run the after-spec step.

**Worker handoff**

- `handoff.ts`, `results.ts` and `materializelog.ts` carry what a worker reports to the coordinator, and `mailbox.ts` is the CLI-owned mailbox for Codex workers.

**Review and landing**

- `verify.ts`, `reviewpackage.ts`, `review.ts` (the findings ledger), `review-run.ts` (the Codex reviewer), `assess.ts` (the risk classifier), `gate.ts`, `land.ts` and `ci.ts` check, review and land a wave. `deploycheck.ts` runs the post-deploy check.

**Journal, attention and reporting**

- `journal.ts` appends events and `insights.ts` reads them; `attention.ts` records the attention state of a session and `attention-alert.ts` raises the alert; `metrics.ts` and `usage.ts` report cost and results.
- `memory.ts` and `engram-client.ts` search and save lessons in Engram.

**Safety**

- `guard.ts`, `guard-destructive.ts` and `guard-codex.ts` are the guard hooks.

**Command plumbing and shared helpers**

- `commands.ts` describes the commands and their flags, `flags.ts` the flags every command accepts, `envelope.ts` the `--json` output, `errors.ts` the error codes, `exit-codes.ts` and `exit-code.ts` the exit codes, `env.ts` the environment view, `color.ts` and `banner.ts` the terminal output, and `present.ts`, `narrow.ts` and `optional.ts` small narrowing helpers.
- `test-preload.ts` and `expect-rejection.ts` support the tests.

Host-specific values sit behind the `AgentHost` interface in `agenthost.ts`: `agenthost-claude.ts` is the Claude Code adapter and `agenthost-codex.ts` the Codex one, chosen by `agentHost` in the config. The Codex side adds `codex-models.ts` (model resolution), `codex-home.ts` (per-run `CODEX_HOME` overlay), `codex-process.ts` and `codex-session.ts` (process runner and hand-off), `codex-usage.ts` (usage from `exec --json`), `guard-codex.ts` (hook input and the approval gate) and `dispatch.ts`. See the [Codex guide](../how-to/use-codex.md).

## Prompt layout

`commands/run.md` (about 130 lines) is the `/emet` router on Claude Code; on Codex the generated `codex/skills/**` and `codex/hooks.json` play that role. Each file in `emet/reference/` is one phase group (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `phases-9-handoff.md`), loaded only when the current run's mode needs it. A test fails if any of them grows past 20,000 bytes, so one file cannot take over the context after compaction. The phases tell the coordinator to re-read the relevant section before each fix or review round. `emet self install` deletes a leftover `phases-8-closeout.md` that still matches the install manifest and otherwise moves it aside as `phases-8-closeout.md.retired`; that file is split into `phases-8-review.md` (review and gate) and `phases-8-landing.md` (landing and close-out). `phases-8-spec-landing.md` holds the rules for `landing.unit: spec`: integrating each wave into `spec/<id>`, syncing trunk and landing the spec once. `emet self install` also merges the emet hooks, `emet guard` as the `PreToolUse` hook among them, into `~/.claude/settings.json`.

## Distribution

`emet self install` places the standalone binary, writes the rewritten prompts under `~/.claude/` and, with `--from <checkout>`, copies the `emet/` source to `~/.claude/emet`. The Codex plugin is described by `.codex-plugin/plugin.json`, generated with `bun run build:codex` together with `codex/skills/**` and `codex/hooks.json`. The Claude Code plugin path ships a shim that downloads a checksum-verified standalone binary built by `tools/build-binaries.ts`. See [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md).

## See also

- [Getting started](../start/install.md) and [Trackers and landing](../how-to/configure-tracker.md)
- [Configuration reference](../reference/configuration.md), [CLI reference](../reference/cli.md) and [Dependencies](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) and [emet/AGENTS.md](../../emet/AGENTS.md)
- [Documentation index](../README.md)

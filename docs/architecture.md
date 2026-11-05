# Architecture

A code map of `emet/src` and how the `/emet` prompts drive it. Terms follow [GLOSSARY.md](../GLOSSARY.md); decisions behind the shape live in [docs/adr](adr/README.md). For problems, see [troubleshooting](troubleshooting.md).

- [Shape](#shape)
- [How the prompts drive the CLI](#how-the-prompts-drive-the-cli)
- [Module map](#module-map)
- [Prompt layout](#prompt-layout)
- [Distribution](#distribution)
- [See also](#see-also)

## Shape

There are two halves. The prompts (`commands/run.md`, `agents/*.md`, `emet/reference/*.md`) tell Claude what to do in each phase. The `emet` CLI (`emet/bin/emet.ts` and `emet/src/`) does everything that must be deterministic: checks, claims, slots, gates, tracker writes and landing. The prompts never re-implement a check the CLI already makes.

`emet/bin/emet.ts` is a thin dispatcher: it reads the first argument and hands off to one subcommand module, which reads the rest of `process.argv` itself. Exit codes are meaningful across subcommands.

## How the prompts drive the CLI

`commands/run.md` is a short router. It loads one `emet/reference/` phase file at a time, so a compaction never drops the rules for the current phase.

| Phase                                  | Prompt                                       | CLI calls                                                                     |
| -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 interview, spec, tickets, approval | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 dispatch and workers               | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 review, gate, landing, closeout      | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 handoff and chaining                 | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

The coordinator is the single tracker writer (ADR-0005): workers report through a handoff note and `emet results`, and the coordinator posts them. `emet guard` runs as a `PreToolUse` hook and blocks known unattended-run failure triggers.

## Module map

Each module has a `*.test.ts` beside it.

| Area            | Modules                                                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup and audit | `init.ts` (config and doc skeleton), `config.ts` (`emet.config.json`, legacy `forge.config.json` still read), `doctor.ts` (fleet sweep), `preflight.ts` (dispatch hygiene), `dependencies.ts`, `skills.ts` (mattpocock-skills contract), `map.ts` (codebase brief) |
| Run state       | `claims.ts` (ticket reservations), `slots.ts` (worker slot pool), `resources.ts` (host facts), `runs.ts` (liveness), `locks.ts`, `lockreason.ts`, `proctree.ts`, `worktrees.ts`, `cleanup.ts`, `status.ts`, `launch.ts`                                            |
| Tracker         | `tracker.ts`, `tracker-files.ts` (local `.scratch/` tracker), `validate.ts` (spec coverage), `specmerge.ts`, `approve.ts`, `surfaces.ts` (edit-surface overlap)                                                                                                    |
| Worker handoff  | `handoff.ts`, `results.ts`, `materializelog.ts`                                                                                                                                                                                                                    |
| Review and land | `verify.ts`, `reviewpackage.ts`, `review.ts` (findings ledger), `assess.ts` (risk classifier), `gate.ts`, `land.ts`                                                                                                                                                |
| Reporting       | `metrics.ts`, `usage.ts`                                                                                                                                                                                                                                           |
| Safety          | `guard.ts`, `guard-destructive.ts`                                                                                                                                                                                                                                 |
| Shared helpers  | `narrow.ts`, `optional.ts`, `assets.ts` (embedded files in compiled binaries)                                                                                                                                                                                      |

## Prompt layout

`commands/run.md` (about 130 lines) is the `/emet` router. Each file in `emet/reference/` is one phase group (`phases-1-5.md`, `phases-6-7-dispatch.md`, `phases-8-closeout.md`, `phases-9-handoff.md`), loaded only when the current run's mode needs it. A test fails if any of them grows past 20,000 bytes, so one file cannot take over the context after compaction. The phases tell the coordinator to re-read the relevant section before each fix or review round. `install.sh` moves an old single `phases-6-9.md` aside as `phases-6-9.md.retired` when you edited it or it predates the install manifest, and deletes it otherwise. `install.sh` also wires `emet guard` into `~/.claude/settings.json` as the `PreToolUse` hook.

## Distribution

`install.sh` copies `emet/` to `~/.claude/emet` and rewrites the prompts. The plugin path ships a shim that downloads a checksum-verified standalone binary built by `tools/build-binaries.ts`. See [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md).

## See also

- [Getting started](guide/getting-started.md) and [Trackers and landing](guide/trackers-and-landing.md)
- [Configuration reference](reference/configuration.md), [CLI reference](reference/cli.md) and [Dependencies](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) and [emet/AGENTS.md](../emet/AGENTS.md)
- [Documentation index](README.md)

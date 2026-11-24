# Troubleshooting

Fix the failures of `emet doctor` and `emet preflight`, grouped by what you see, each with the cause and the steps to fix it. Terms follow [GLOSSARY.md](../GLOSSARY.md). For how the checks fit together, see [architecture](concepts/architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

A repo that still has only `forge.config.json`, `.forge/` or `FORGE_*` variables keeps working: `emet` reads the legacy names, prints one stderr line naming each legacy file, and `emet migrate` renames them.

- [Prerequisites](#prerequisites)
- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [A dependency check fails](#a-dependency-check-fails)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [An installed file is missing or was edited since install](#an-installed-file-is-missing-or-was-edited-since-install)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [No free worker slots](#no-free-worker-slots)
- [Expected locked worktrees, found fewer](#expected-locked-worktrees-found-fewer)
- [A ticket is claimed by several worktrees or branches](#a-ticket-is-claimed-by-several-worktrees-or-branches)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [Codex host](#codex-host)
- [Check](#check)
- [See also](#see-also)

## Prerequisites

- `emet` on `PATH`; see [Install](start/install.md).
- A shell at the repo root with the problem.
- The exact message from `emet doctor .` or `emet preflight`: find it in the list above.

## no emet.config.json

**Symptom:** `emet doctor` prints `no emet.config.json — run "emet init" here`.

**Cause:** The repo has no `/emet` config yet.

**Fix:**

1. Run `emet init` at the repo root.
2. Review the generated config and fill the `docs/agents/` files.

## emet.config.json is malformed

**Symptom:** `emet.config.json is malformed: <reason>`; `emet preflight` exits 2.

**Cause:** The config is strict JSON and is validated against `emet/schema/emet.config.schema.json`. Comments and trailing commas are rejected.

**Fix:**

1. Correct the field named in the reason.
2. Or regenerate the config with `emet init --force`.

## docs/agents still has TODO(emet) markers

**Symptom:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` also reports a missing `docs/agents/<file>`.

**Cause:** `emet init` leaves a marker wherever it cannot detect a value.

**Fix:**

1. Fill each marked line, or resolve them and run `emet init --force`.
2. Run `emet preflight`; it refuses to dispatch while one marker remains.

## A dependency check fails

**Symptom:** `dependency: ...` lines in `emet doctor`, or a blocking dependency failure in `emet preflight` (for example `gh` missing or unauthenticated, or the mattpocock-skills plugin absent or at an untested version).

**Cause:** `/emet` needs `git`, `gh` and the mattpocock-skills plugin; see `emet/src/dependencies.ts` and `emet/src/skills.ts`.

**Fix:**

1. Install or authenticate the tool, or run the `setup-matt-pocock-skills` skill (`/setup-matt-pocock-skills` on Claude Code, the same skill via Codex's `$` syntax on Codex).
2. If a check is wrong for your environment, run `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` to downgrade it to a warning.

## no longer documents a flag in --help

**Symptom:** `<tool> no longer documents <flags> in --help — emet relies on it`, or `could not be run — cannot verify <flags>`.

**Cause:** `emet doctor` checks the flags `emet` depends on, not only that the binary exists. The installed version dropped or renamed one.

**Fix:** Install a version of the tool that still documents the flag.

## An installed file is missing or was edited since install

**Symptom:** `~/<path> is missing — re-run emet self install` or `~/<path> was edited since install`.

**Cause:** The installed copy no longer matches the install manifest.

**Fix:**

1. Re-run `emet self install` (from a source checkout, `emet self install --from .`).
2. If a pending `.new` file exists beside an edited file, merge it or delete it.

## Stop hook error: forge: No such file or directory

**Symptom:** Claude Code prints `Stop hook error: … forge: No such file or directory` (or the same for `emet`) at the end of every turn.

**Cause:** `~/.claude/settings.json` still has a `forge guard` or `emet guard` hook whose binary was moved or removed.

**Fix:**

1. Run `emet doctor .`. It lists each dead guard hook with its event.
2. Run the one `cp … && jq …` command it prints; it backs up `settings.json` and removes only those hooks. Doctor never edits the file itself.

## No free worker slots

**Symptom:** `No free worker slots at all: 0 free out of N`, or `only K/N worker slot(s) free`.

**Cause:** Every slot in `~/.local/state/emet/slots` is held by a live or idle run, so the wave cannot dispatch fully.

**Fix:**

1. Run `emet status` to see who holds each slot.
2. Wait for a run to free a slot, or run `emet cleanup --run <runId>` for a run you know is finished.

## Expected locked worktrees, found fewer

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Symptom:** `Expected N locked worktree(s) for run <id>, found M`.

**Cause:** Workers did not claim their worktree with the lock reason, or `isolation: "worktree"` placed them elsewhere. See [`incidents.md`](../emet/reference/incidents.md).

**Fix:**

1. Run `git worktree list --porcelain` and look at the locked entries.
2. Run `emet lock-reason` for the expected reason format and re-lock a worker's worktree with it.

## A ticket is claimed by several worktrees or branches

**Symptom:** `<ticket> is claimed by N worktrees`, `has N branches`, or `is checked out on branch ..., but its own lock names ticket ...`.

**Cause:** A retry or a mis-routed shell left a duplicate.

**Fix:**

1. Keep the canonical worktree or branch.
2. Delete or re-lock the rest.
3. Re-run `emet preflight`.

## requiredCommands not on PATH

**Symptom:** `preflight.requiredCommands not on PATH: <names>`.

**Cause:** `preflight.requiredCommands` in `emet.config.json` lists binaries the repo needs.

**Fix:**

1. Install the named binaries.
2. Or remove them from `preflight.requiredCommands` if they are no longer needed.

## Codex host

These apply when `agentHost` is `"codex"`. See [Running emet on Codex](how-to/use-codex.md).

**A `codex` older than `codex.minVersion`.** `emet doctor .` reports it. Install the `codex` CLI at the version in `codex.minVersion` (default `0.167.0`) or newer, then run `emet doctor .` again.

**A missing `--json` or `--output-schema` flag.** `emet doctor .` reports a `codex exec` that does not document either flag, and emet relies on both to start workers and reviewers. Install a `codex` version that still documents them.

**A configured model is not listed.** emet resolves models against `models_cache.json` in the run home, else in your real Codex home (read only). A slug that is not listed is substituted and the substitution is logged. If nothing resolves, `emet review-run` fails before the model call, naming the role and the listed slugs. Set a listed slug in `codex.models`; see the [configuration reference](reference/configuration.md#codex).

## Check

1. Run `emet doctor .` and confirm it reports no failure for the problem you fixed.
2. Run `emet preflight` and confirm it exits 0.

## See also

- [Documentation index](README.md)
- [README](../README.md)
- [Getting started](start/install.md)
- [Configuration reference](reference/configuration.md)
- [Dependencies reference](reference/dependencies.md)

# Troubleshooting

Failures of `emet doctor` and `emet preflight`, grouped by what you see, each with the cause and a fix. Terms follow [GLOSSARY.md](../GLOSSARY.md). For how the checks fit together, see [architecture](architecture.md).

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

A repo that still has only `forge.config.json`, `.forge/` or `FORGE_*` variables keeps working: `emet` reads the legacy names, prints one stderr line naming each legacy file, and `emet migrate` renames them.

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [A dependency check fails](#a-dependency-check-fails)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [An installed file is missing or was edited since install](#an-installed-file-is-missing-or-was-edited-since-install)
- [No free worker slots](#no-free-worker-slots)
- [Expected locked worktrees, found fewer](#expected-locked-worktrees-found-fewer)
- [A ticket is claimed by several worktrees or branches](#a-ticket-is-claimed-by-several-worktrees-or-branches)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [See also](#see-also)

## no emet.config.json

**Symptom:** `emet doctor` prints `no emet.config.json — run "emet init" here`.

**Cause:** The repo has no `/emet` config yet.

**Fix:** Run `emet init` at the repo root, then review the generated config and fill the `docs/agents/` files.

## emet.config.json is malformed

**Symptom:** `emet.config.json is malformed: <reason>`; `emet preflight` exits 2.

**Cause:** The config is strict JSON and is validated against `emet/schema/emet.config.schema.json`. Comments and trailing commas are rejected.

**Fix:** Correct the field named in the reason, or regenerate with `emet init --force`.

## docs/agents still has TODO(emet) markers

**Symptom:** `docs/agents/ still has N TODO(emet): marker(s)`; `emet doctor` also reports a missing `docs/agents/<file>`.

**Cause:** `emet init` leaves a marker wherever it cannot detect a value.

**Fix:** Fill each marked line, or resolve them and run `emet init --force`. Preflight refuses to dispatch while one remains.

## A dependency check fails

**Symptom:** `dependency: ...` lines in `emet doctor`, or a blocking dependency failure in `emet preflight` (for example `gh` missing or unauthenticated, or the mattpocock-skills plugin absent or at an untested version).

**Cause:** `/emet` needs `git`, `gh` and the mattpocock-skills plugin; see `emet/src/dependencies.ts` and `emet/src/skills.ts`.

**Fix:** Install or authenticate the tool, or run `/setup-matt-pocock-skills`. If a check is wrong for your environment, `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` downgrades it to a warning.

## no longer documents a flag in --help

**Symptom:** `<tool> no longer documents <flags> in --help — emet relies on it`, or `could not be run — cannot verify <flags>`.

**Cause:** `emet doctor` checks the flags `emet` depends on, not only that the binary exists. The installed version dropped or renamed one.

**Fix:** Install a version of the tool that still documents the flag.

## An installed file is missing or was edited since install

**Symptom:** `~/<path> is missing — re-run install.sh` or `~/<path> was edited since install`.

**Cause:** The installed copy no longer matches the install manifest.

**Fix:** Re-run `install.sh`. If a pending `.new` file exists beside an edited file, merge it or delete it.

## No free worker slots

**Symptom:** `No free worker slots at all: 0 free out of N`, or `only K/N worker slot(s) free`.

**Cause:** Every slot in `~/.local/state/emet/slots` is held by a live or idle run, so the wave cannot dispatch fully.

**Fix:** Wait for a run to free a slot, or run `emet cleanup --run <runId>` for a run you know is finished. `emet status` shows who holds what.

## Expected locked worktrees, found fewer

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**Symptom:** `Expected N locked worktree(s) for run <id>, found M`.

**Cause:** Workers did not claim their worktree with the lock reason, or `isolation: "worktree"` placed them elsewhere. See [`incidents.md`](../emet/reference/incidents.md).

**Fix:** Check `git worktree list --porcelain` for the locked entries, and `emet lock-reason` for the expected reason format.

## A ticket is claimed by several worktrees or branches

**Symptom:** `<ticket> is claimed by N worktrees`, `has N branches`, or `is checked out on branch ..., but its own lock names ticket ...`.

**Cause:** A retry or a mis-routed shell left a duplicate.

**Fix:** Keep the canonical worktree or branch, delete or re-lock the rest, then re-run `emet preflight`.

## requiredCommands not on PATH

**Symptom:** `preflight.requiredCommands not on PATH: <names>`.

**Cause:** `preflight.requiredCommands` in `emet.config.json` lists binaries the repo needs.

**Fix:** Install the named binaries, or remove them from the config if they are no longer needed.

## See also

- [Documentation index](README.md)
- [README](../README.md)
- [Getting started](guide/getting-started.md)
- [Configuration reference](reference/configuration.md)
- [Dependencies reference](reference/dependencies.md)

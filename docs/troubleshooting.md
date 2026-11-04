# Troubleshooting

Failures of `forge doctor` and `forge preflight`, grouped by what you see, each with the cause and a fix. Terms follow [GLOSSARY.md](../GLOSSARY.md). For how the checks fit together, see [architecture](architecture.md).

- [no forge.config.json](#no-forgeconfigjson)
- [forge.config.json is malformed](#forgeconfigjson-is-malformed)
- [docs/agents still has TODO(forge) markers](#docsagents-still-has-todoforge-markers)
- [A dependency check fails](#a-dependency-check-fails)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [An installed file is missing or was edited since install](#an-installed-file-is-missing-or-was-edited-since-install)
- [No free worker slots](#no-free-worker-slots)
- [Expected locked worktrees, found fewer](#expected-locked-worktrees-found-fewer)
- [A ticket is claimed by several worktrees or branches](#a-ticket-is-claimed-by-several-worktrees-or-branches)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [See also](#see-also)

## no forge.config.json

**Symptom:** `forge doctor` prints `no forge.config.json — run "forge init" here`.

**Cause:** The repo has no `/forge` config yet.

**Fix:** Run `forge init` at the repo root, then review the generated config and fill the `docs/agents/` files.

## forge.config.json is malformed

**Symptom:** `forge.config.json is malformed: <reason>`; `forge preflight` exits 2.

**Cause:** The config is strict JSON and is validated against `forge/schema/forge.config.schema.json`. Comments and trailing commas are rejected.

**Fix:** Correct the field named in the reason, or regenerate with `forge init --force`.

## docs/agents still has TODO(forge) markers

**Symptom:** `docs/agents/ still has N TODO(forge): marker(s)`; `forge doctor` also reports a missing `docs/agents/<file>`.

**Cause:** `forge init` leaves a marker wherever it cannot detect a value.

**Fix:** Fill each marked line, or resolve them and run `forge init --force`. Preflight refuses to dispatch while one remains.

## A dependency check fails

**Symptom:** `dependency: ...` lines in `forge doctor`, or a blocking dependency failure in `forge preflight` (for example `gh` missing or unauthenticated, or the mattpocock-skills plugin absent or at an untested version).

**Cause:** `/forge` needs `git`, `gh` and the mattpocock-skills plugin; see `forge/src/dependencies.ts` and `forge/src/skills.ts`.

**Fix:** Install or authenticate the tool, or run `/setup-matt-pocock-skills`. If a check is wrong for your environment, `FORGE_SKIP_DEPENDENCY_CHECKS=1 forge preflight` downgrades it to a warning.

## no longer documents a flag in --help

**Symptom:** `<tool> no longer documents <flags> in --help — forge relies on it`, or `could not be run — cannot verify <flags>`.

**Cause:** `forge doctor` checks the flags `forge` depends on, not only that the binary exists. The installed version dropped or renamed one.

**Fix:** Install a version of the tool that still documents the flag.

## An installed file is missing or was edited since install

**Symptom:** `~/<path> is missing — re-run install.sh` or `~/<path> was edited since install`.

**Cause:** The installed copy no longer matches the install manifest.

**Fix:** Re-run `install.sh`. If a pending `.new` file exists beside an edited file, merge it or delete it.

## No free worker slots

**Symptom:** `No free worker slots at all: 0 free out of N`, or `only K/N worker slot(s) free`.

**Cause:** Every slot in `~/.local/state/forge/slots` is held by a live or idle run, so the wave cannot dispatch fully.

**Fix:** Wait for a run to free a slot, or run `forge cleanup --run <runId>` for a run you know is finished. `forge status` shows who holds what.

## Expected locked worktrees, found fewer

**Symptom:** `Expected N locked worktree(s) for run <id>, found M`.

**Cause:** Workers did not claim their worktree with the lock reason, or `isolation: "worktree"` placed them elsewhere. See [`incidents.md`](../forge/reference/incidents.md).

**Fix:** Check `git worktree list --porcelain` for the locked entries, and `forge lock-reason` for the expected reason format.

## A ticket is claimed by several worktrees or branches

**Symptom:** `<ticket> is claimed by N worktrees`, `has N branches`, or `is checked out on branch ..., but its own lock names ticket ...`.

**Cause:** A retry or a mis-routed shell left a duplicate.

**Fix:** Keep the canonical worktree or branch, delete or re-lock the rest, then re-run `forge preflight`.

## requiredCommands not on PATH

**Symptom:** `preflight.requiredCommands not on PATH: <names>`.

**Cause:** `preflight.requiredCommands` in `forge.config.json` lists binaries the repo needs.

**Fix:** Install the named binaries, or remove them from the config if they are no longer needed.

## See also

- [Documentation index](README.md)
- [README](../README.md)

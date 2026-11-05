# 0016. emet-mascot as an optional plugin

Status: Accepted (2026-11-05)
Spec: #219 (S10)

## Context

The emet identity has a mascot, and Claude Code mods can draw a pane above the prompt. Showing it needs a mod, a record of the current run phase and a distribution path. [ADR-0008](0008-standalone-binaries-and-plugin-distribution.md) ships emet as a plugin, and [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) forbids changing the runtime behaviour of the CLI without an explicit ticket. Most users do not want a decoration on by default.

## Decision

- **A second plugin, `emet-mascot`, lives in `mods/emet-mascot/`** and is listed in the same marketplace, so `claude plugin install emet-mascot@emet-marketplace` is opt-in. The `emet` plugin does not depend on it.
- **The Phase file is the only contract between them.** The CLI writes `.emet/phase.json` atomically and never fails a subcommand over a failed write. The mod only reads it, by polling, and ignores a stale file.
- **The Orca pet is a generated bundle** in `docs/brand/pet/emet/`, built by `bun run brand:export` from the mascot SVGs, per [ADR-0014](0014-brand-kit-in-docs-brand.md).

## Consequences

- The marketplace lists two plugins, and `tools/plugin.test.ts` must expect both.
- The phase file is a small public surface: a change to its fields is a change to the mod.
- Mod code is tested by its own specs and does not enter the `emet/` runtime package.

## Alternatives considered

- **Bundle the mod into the `emet` plugin**: one install, but every user gets the mascot and the plugin grows a UI dependency.
- **Have the mod call the `emet` CLI for status**: no file contract, but the mod would spawn processes on a timer and depend on the binary being installed.
- **A separate repository for the mod**: isolates it, but splits the phase file contract across repos.

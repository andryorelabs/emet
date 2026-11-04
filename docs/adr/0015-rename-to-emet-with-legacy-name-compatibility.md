# 0015. Rename to emet with legacy-name compatibility

Status: Accepted (2026-11-04)
Spec: the emet rename, runs 3 and 4 of the brand kit (S1 to S13)

## Context

The maintainer approved the name `emet` on 2026-11-04 and the brand kit in `docs/brand/` is ready ([ADR-0014](0014-brand-kit-in-docs-brand.md)). The rename is mandatory in the brief and covers the repository, plugin, marketplace, binary, `/emet:run`, install paths and the CLI banner.

The old name is typed by hand about 2,600 times in 184 files, with no central constant. Repositories already initialised with `forge init` carry `forge.config.json`, `docs/agents/forge.md`, a `.forge/` run directory, `TODO(forge):` markers and worktrees locked with a `forge` token. Hosts carry `~/.claude/forge`, `~/.local/bin/forge`, `~/.local/state/forge` and a guard hook command in `~/.claude/settings.json`. [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) forbids changing `install.sh`, the CLI's runtime behaviour or the wording of installed prompts without an explicit ticket.

## Decision

- **New names are canonical.** `emet.config.json`, `docs/agents/emet.md`, `.emet/`, `TODO(emet):`, the `emet` lock token, `EMET_*` variables, `~/.local/state/emet`, `~/.claude/emet`, the `emet` binary and the `emet-worker` and `emet-reviewer` agents. Every runtime name comes from `emet/src/names.ts`.
- **Legacy names are still read.** A _legacy name_ resolves after its new counterpart and prints one warning per process. Support ends in a future major release.
- **`emet migrate` is the migration path** for one repository, idempotent, with `--dry-run`. `install.sh` migrates a host: it removes unmodified legacy files, keeps modified ones with a notice, and rewrites the guard hook command after a backup.
- **The source directory moves from `forge/` to `emet/`** in one ticket in the first wave, so later waves start from the final layout.
- **One-time exception to ADR-0001.** The rename ticket may change the wording of installed prompts (`emet/reference/*.md`, `commands/*.md`, `agents/*.md`), only to rename. ADR-0001's rule applies again afterwards. Quoted historical evidence in `incidents.md` keeps its original strings.
- **This repository's own `forge.config.json`, `docs/agents/forge.md` and `.forge/`** stay until the last wave lands, because the installed legacy CLI coordinates the run. They are migrated with `emet migrate` afterwards.

## Consequences

- Repositories initialised before the rename keep working and show a warning until `emet migrate` runs.
- `names.ts` becomes the one place to change a name; code outside it must not add product-name literals.
- The legacy `forge.config.schema.json` stays as a copy so old `$schema` paths validate.
- The GitHub repository rename redirects old URLs. Releases, the plugin reinstall and the trademark check (USPTO and EUIPO, classes 9 and 42) remain with the maintainer.

## Alternatives considered

- **Hard cut, no legacy reads**: simpler code, but every initialised repository breaks until migrated.
- **Keep the internal names** (`forge.config.json`, `.forge/`, `FORGE_*`): lowest risk, but leaves the brand half applied.
- **Rename the binary and plugin only, keep the `forge/` directory**: smaller diff, but the source tree contradicts the product name.

# 0014. Brand kit lives in docs/brand

Status: Accepted (2026-11-04)
Spec: #159 (S10, S11, S12)

## Context

The emet identity (name, mascot, type, palette, logo) was approved on 2026-11-04 and run 2 turns it into a production kit: tokens, voice, copy, logo and mascot SVGs, a terminal banner, cover and social preview sources, a brandbook and their raster exports. The kit has to live somewhere before any repository surface uses it. The rename, the CLI banner and the landing page are later runs, and [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) forbids changing `install.sh` or the CLI's runtime behaviour without an explicit ticket.

Rasters (PNG, ICO) also need a tool. Rendering the HTML sources needs a browser engine, and rasterising SVG needs an image library. Neither belongs in the runtime package.

## Decision

- **The kit is documentation.** Every brand source and export lives under `docs/brand/`: `tokens.css`, `voice.md`, `copy.md`, `logo/`, `mascot/`, `terminal/`, `og/`, `brandbook/`, and `apply-spec.md`, which maps each asset to the surface it will feed later.
- **Sources are the truth, rasters are generated.** `bun run brand:export` (`tools/brand-export.ts`) renders `logo/png/mark-*.png`, `logo/png/favicon.ico` and `og/*.png` from the SVG and HTML sources. It checks each output's exact pixel size and byte budget against `tools/brand-export-spec.ts` before writing, and fails instead of writing a wrong file. The generated files are committed so readers and GitHub can use them without running the tool.
- **The export is offline.** Fonts load only from `docs/brand/brandbook/fonts/`, and any request outside `file:` fails the export.
- **Tooling is root-only.** `playwright` and `sharp` are root devDependencies, per ADR-0001. `forge/` gains none, and nothing under `forge/`, `install.sh`, `commands/` or `agents/` changes in this run.

## Consequences

- Applying the kit (README cover, social preview, plugin icon, CLI banner) is a separate ticket, following `docs/brand/apply-spec.md`.
- A change to a logo SVG or an OG source needs `bun run brand:export` and a commit of the regenerated rasters. Nothing in CI checks that rasters match their sources.
- `bun install` at the root downloads `sharp`'s native binary and the `playwright` package. Running the export also needs a Playwright Chromium (`bunx playwright install chromium`), which tests and CI do not need.
- Every new `.md` under `docs/brand/` is linked from `docs/README.md`, as for any other doc.

## Alternatives considered

- **A separate brand repository**: keeps the main repo lean, but splits the tokens from the surfaces they feed and adds a sync step before the rename.
- **Assets under `forge/` or the plugin root now**: would ship brand files in the installed runtime and change install behaviour before the rename ticket exists, against ADR-0001.
- **Hand-exported rasters with no tool**: no new dependencies, but no repeatable sizes or byte budgets, so a social preview over GitHub's 1 MB limit would only be found at upload time.
- **SVG-only rasterisation with `sharp` for the OG images too**: drops Playwright, but librsvg cannot lay out the HTML sources, so the covers would have to be redrawn as SVG.

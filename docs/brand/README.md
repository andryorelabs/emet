# Brand kit: run 1 index

Research and exploration for a possible rename and brand kit for claude-forge.

**Status: identity decided; kit applied (runs 3 and 4, spec: issue #174; see
[`apply-spec.md`](apply-spec.md)).** The maintainer approved the name,
mascot, typography, palette and logo concept on 2026-11-04 (see "Decisions"
below). Everything else here is research or a rejected option, kept as a record.

## Run 1 deliverables

Research documents:

- `docs/brand/brief.md`: the approved brand brief (position, audience, voice, what to avoid, closed decisions), from the maintainer interview of 2026-11-04.
- `docs/brand/voice.md`: the emet voice, tone by context, terminology and the avoid list.
- `docs/brand/copy.md`: approved public copy (tagline, intro, features) with the claims checked against the CLI.
- `docs/brand/tokens.css`: design tokens (P2 Moss in oklch, light and dark, T2 fonts, type scale); fonts in `docs/brand/brandbook/fonts/`.
- `docs/brand/brandbook/fonts/OFL.md`: licenses of the two brandbook fonts.
- [`apply-spec.md`](apply-spec.md): maps each kit asset to the repository surface it will feed, with the manual steps (social preview upload, trademark check, rename ticket).
- Raster exports from `bun run brand:export` (`tools/brand-export.ts`): `logo/png/mark-{16,32,48,128,512}.png`, `logo/png/favicon.ico` and `og/{cover,cover-light,social-preview,social-preview-light}.png`.
- [ADR-0014](../adr/0014-brand-kit-in-docs-brand.md): why the kit lives in `docs/brand/` and how the rasters are generated.
- `docs/brand/naming.md`: the selected name `emet` with its story, availability checks and risks.
- `docs/brand/competitors.md`: tools that orchestrate coding agents from a spec
  or ticket to a merged change, with positioning lessons and territories to
  avoid.
- `docs/brand/mascot-research.md`: study of developer-tool mascots, a
  best-practice checklist and 3 to 5 name-independent mascot directions.
- `docs/brand/naming-candidates.md`: the rename study, with candidates filtered
  by slug, npm, binary and plugin-name collisions, finalists scored out of 70
  and a recommendation.

Exploration sheets (standalone HTML, open from disk, no network):

- `docs/brand/explorations/mascot-directions.html`: the mascot directions side
  by side.
- [`explorations/palette.html`](explorations/palette.html): four palette
  options P1 to P4, light and dark, with oklch tokens, a README mock, an ANSI
  16-color preview and WCAG contrast ratios.
- [`explorations/emet-palette-r2.html`](explorations/emet-palette-r2.html): palette round 2,
  four options P1 to P4 derived from the approved COMBO mascot (clay, moss, lamp), with tokens,
  mascot, README and social mocks, ANSI 16 and computed contrast.
- [`explorations/typography.html`](explorations/typography.html): four type
  pairings T1 to T4 (UI plus mono), all OFL, with a placeholder wordmark, README
  text and terminal output.
- [`explorations/emet-typography.html`](explorations/emet-typography.html): the
  T1 to T4 pairings applied to the real `emet` wordmark, with sizes, weights,
  tracking, letterform notes, flaws and a recommendation.
- [`explorations/emet-mascot-r3.html`](explorations/emet-mascot-r3.html): mascot
  round 3, six overgrown-machine and solarpunk ideas (moss pebble, soft giant,
  cairn, forehead glyph, can-bearer, lamp-bud head), each with sizes, one-colour,
  states, a working loop and a terminal banner, plus three oklch palette sets.
- [`explorations/emet-mascot-r4.html`](explorations/emet-mascot-r4.html): mascot
  round 4, A redrawn three ways, D plus two refinements and two A-with-D-glyph
  hybrids, with a palette 1 and 2 toggle.
- [`explorations/emet-mascot-r5.html`](explorations/emet-mascot-r5.html): mascot
  round 5, A1-M (A1 with a slit mouth) and a COMBO with a green base, beside the
  r4 originals, with a palette 1 and 2 toggle.
- [`explorations/fonts/`](explorations/fonts/): the local `woff2` files the
  typography sheet loads, with licenses and sources in
  [`OFL.md`](explorations/fonts/OFL.md).
- [`explorations/emet-logo-r2.html`](explorations/emet-logo-r2.html): logo round 2, five marks
  with lockups, plugin icon, README cover and social preview mocks.

Raw notes behind the research documents live in `docs/brand/research-notes/`.
They include
[`mascots-modern-abstract.md`](research-notes/mascots-modern-abstract.md): modern
abstract mascot cases (2023 to 2026), principles and golem silhouette ideas.

## Decisions

Approved on 2026-11-04:

1. Name: `emet` (`docs/brand/naming.md`).
2. Mascot: COMBO from round 5, a gentle clay-and-moss golem with a sprout, eye
   lamps, a slit mouth and a green base
   (`explorations/emet-mascot-r5.html`). Rounds 3 and 4 are the path to it.
3. Typography: T2 (`explorations/emet-typography.html`).
4. Palette: P2 Moss (`explorations/emet-palette-r2.html`).
5. Logo: concept 04 (`explorations/emet-logo-r2.html`).

Rejected rounds (mascot rounds 1 and 2, palette round 1, logo round 1) are not
part of this directory.

Still manual: the trademark check for EMET in USPTO and EUIPO classes 9 and 42.

## Follow-up runs

- Run 1b: logo and mascot concepts, once the name and mascot direction are
  picked.
- Run 2: the kit, meaning tokens, voice, copy and brand book.
- Run 3: apply the kit across the repository. Applied, see
  [`apply-spec.md`](apply-spec.md) (spec: issue #174).
- Run 4: the rename itself. Applied (spec: issue #174,
  [ADR-0015](../adr/0015-rename-to-emet-with-legacy-name-compatibility.md)).

## Constraints

- English only; every third-party claim in the research documents links a
  primary source with an access date.
- No use of Anthropic's or Claude's brand: no Claude orange or clay palette, no
  imitation of the Claude spark or Clawd. Proximity risks are noted instead.
- Fonts are OFL only, served from local files.

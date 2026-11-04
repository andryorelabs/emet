# Brand kit: run 1 index

Research and exploration for a possible rename and brand kit for claude-forge.

**Status: research; decisions pending.** Everything here is an option or a
recommendation. Nothing has been decided yet: the name, mascot, palette and typeface are all
open.

## Run 1 deliverables

Research documents:

- `docs/brand/brief.md`: the approved brand brief (position, audience, voice, what to avoid, closed decisions), from the maintainer interview of 2026-11-04.
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
- [`explorations/typography.html`](explorations/typography.html): four type
  pairings T1 to T4 (UI plus mono), all OFL, with a placeholder wordmark, README
  text and terminal output.
- [`explorations/fonts/`](explorations/fonts/): the local `woff2` files the
  typography sheet loads, with licenses and sources in
  [`OFL.md`](explorations/fonts/OFL.md).

Raw notes behind the research documents live in `docs/brand/research-notes/`.

## Decisions the maintainer takes next

1. Name: pick from the finalists in `docs/brand/naming-candidates.md`.
2. Mascot direction: pick one of the directions in
   `docs/brand/mascot-research.md`, or none.
3. Palette: pick one of P1 to P4 in the palette sheet, or ask for a variation.
4. Type: pick one of T1 to T4 in the typography sheet.

## Follow-up runs

- Run 1b: logo and mascot concepts, once the name and mascot direction are
  picked.
- Run 2: the kit, meaning tokens, voice, copy and brand book.
- Run 3: apply the kit across the repository.
- Run 4: the rename itself.

## Constraints

- English only; every third-party claim in the research documents links a
  primary source with an access date.
- No use of Anthropic's or Claude's brand: no Claude orange or clay palette, no
  imitation of the Claude spark or Clawd. Proximity risks are noted instead.
- Fonts are OFL only, served from local files.

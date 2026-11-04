# Applying the emet kit

Where each asset in `docs/brand/` will be used, and the steps a person has to do by hand. Nothing here is applied yet: this run only produces the kit ([ADR-0014](../adr/0014-brand-kit-in-docs-brand.md)). Applying it is the job of run 3, and the rename is run 4 (see [README.md](README.md), "Follow-up runs").

## Regenerating the rasters

Run `bun run brand:export` from the repo root after changing a logo SVG or an OG source, then commit the regenerated files. It needs a Playwright Chromium (`bunx playwright install chromium` once). It renders offline and fails, writing nothing for that asset, when a size or byte budget is wrong. Sizes and budgets live in `tools/brand-export-spec.ts`.

## Asset to surface map

| Asset                                                                     | Source                                                   | Future surface                                                                   | Notes                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `og/cover.png`, `og/cover-light.png` (1280x440)                           | `og/cover.html`, `og/cover-light.html`                   | Root `README.md` cover, swapped by `prefers-color-scheme` with a `<picture>` tag | Run 3. The README intro text comes from `copy.md`.                                  |
| `og/social-preview.png`, `og/social-preview-light.png` (1280x640, < 1 MB) | `og/social-preview.html`, `og/social-preview-light.html` | GitHub repository social preview                                                 | Manual upload, see below. GitHub takes one image; choose the theme at upload.       |
| `logo/plugin-icon.svg`, `logo/plugin-icon-dark.svg`                       | Mark, concept 04                                         | Plugin and marketplace icon                                                      | Run 4, once the plugin is renamed and the manifest format for an icon is confirmed. |
| `logo/png/mark-{16,32,48,128,512}.png`, `logo/png/favicon.ico`            | `logo/mark.svg`                                          | Avatars, favicon of a future docs or landing page, places that take no SVG       | Landing page is out of scope for runs 2 to 4.                                       |
| `logo/lockup-*.svg`                                                       | Mark plus outlined wordmark                              | README header and docs where a cover is too large                                | Run 3.                                                                              |
| `terminal/banner.txt`, `terminal/banner.ansi`                             | P2 ANSI mapping                                          | `forge` CLI banner (help or first-run output)                                    | Run 4. Changes the CLI's runtime output, so it needs its own ticket (ADR-0001).     |
| `mascot/combo-*.svg`                                                      | COMBO, round 5                                           | README states, docs illustrations, status examples                               | Run 3. The lamp colour is the only variable between states.                         |
| `tokens.css`, `brandbook/fonts/`                                          | P2 Moss, T2                                              | Any future HTML surface; the brandbook                                           | Fonts are the two OFL faces only.                                                   |
| `voice.md`, `copy.md`                                                     | Brief                                                    | README, plugin and marketplace descriptions, release notes                       | Claims stay limited to the "Claims checked" table in `copy.md`.                     |

## Manual steps

1. **GitHub social preview upload.** In the repository settings, under "Social preview", upload `docs/brand/og/social-preview.png`. GitHub has no API for this. Check the preview on a shared link afterwards.
2. **EMET trademark check.** Search USPTO and EUIPO for EMET in classes 9 and 42 before any public use of the name. Record the result in `naming.md`.
3. **The rename ticket.** Open the run 4 ticket for the rename itself: repository, plugin and marketplace names, binary, install paths, and the CLI banner. It must cite ADR-0001, because it changes `install.sh` and the CLI's runtime behaviour.

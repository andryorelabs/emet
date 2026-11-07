# AGENTS.md (apps/site)

The Website: the public home page and docs for emet, served at `https://emet.andryore.dev`. Terms follow the root [GLOSSARY.md](../../GLOSSARY.md); the site is the **Website**, never "landing". Decisions: [ADR-0018](../../docs/adr/0018-bun-workspaces-monorepo-with-emet-outside.md), [ADR-0019](../../docs/adr/0019-website-on-coolify-with-astro-and-starlight.md), [ADR-0020](../../docs/adr/0020-website-imagery-is-ai-generated-paintings.md).

## Stack

- Astro 7 with `trailingSlash: 'always'` and its hash-based CSP (`security.csp`).
- Starlight for the docs, fed by the allowlist loader in `src/content.config.ts`.
- Tailwind 4 through `@tailwindcss/vite`; `src/styles/global.css` maps the brand tokens into `@theme`.
- Brand tokens in `src/styles/tokens.css` (P2 Moss, light and dark through `light-dark()`), copied from `docs/brand/tokens.css`. Do not change their values.
- Fonts are local woff2 files in `public/fonts/`. No runtime request leaves the site's origin: no CDNs, no third-party scripts.

## Scripts

Run from the repo root (`bun run check`, `bun run test`), or here with `bun run <script>`:

- `dev`, `preview`: local server.
- `sync`: generates Astro's types into `.astro/`; turbo runs it before `check`.
- `check`: typecheck with the root `typescript7` by path, `.astro` files included through `@astrojs/ts-content-mapper`.
- `test`: `bun test`.
- `build`: only when a ticket needs the production build.

## Layout

- `src/i18n/locales.ts`: `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_NAMES`, `localePath()`. English is at `/`, the others under their lower-case tag (`/pt-br/`).
- `src/layouts/BaseLayout.astro`: the document shell (`title`, `description`, `locale`).
- `src/components/code/CodeBlock.astro`: plain `<pre>` stub until Expressive Code replaces it.
- `design/`: the home page's design direction, run notes and painting masters.

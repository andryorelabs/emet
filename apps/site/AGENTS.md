# AGENTS.md (apps/site)

The Website: the public home page and docs for emet, served at `https://emet.andryore.dev`. Terms follow the root [GLOSSARY.md](../../GLOSSARY.md); the site is the **Website**, never "landing". Decisions: [ADR-0018](../../docs/adr/0018-bun-workspaces-monorepo-with-emet-outside.md), [ADR-0019](../../docs/adr/0019-website-on-coolify-with-astro-and-starlight.md), [ADR-0020](../../docs/adr/0020-website-imagery-is-ai-generated-paintings.md), [ADR-0045](../../docs/adr/0045-website-on-shadcn-base-nova-with-react-islands.md).

## Stack

- Astro 7 with `trailingSlash: 'always'` and its hash-based CSP (`security.csp`).
- Starlight for the docs, fed by the allowlist loader in `src/content.config.ts`.
- Tailwind 4 through `@tailwindcss/vite`; `src/styles/global.css` maps the brand tokens into `@theme`.
- React 19 islands through `@astrojs/react` (`react` and `react-dom` come from the root catalog) and shadcn `base-nova` on Base UI, configured by `components.json` (`@/components/ui`, `@/lib/utils`, `lucide` icons, Tailwind CSS in `src/styles/global.css`). `@/*` maps to `src/*`.
- Islands hydrate with `client:interaction` (first pointer, focus or touch, from `src/scripts/interaction-*.ts`), `client:idle` or `client:visible`. Never `client:load`.
- shadcn variables (`--background`, `--primary`, ...) alias the brand tokens in `global.css` and `docs.css`; `--sl-*` map to the same tokens in `docs.css`. `tokens.css` values never change and dark mode keeps the `.dark` class from `theme.ts`.
- `@shadcn/lint` runs through ESLint on `.tsx` and `.astro` files (`bun run lint`). The ui layer is exempt; three of its rules stay off for legacy `.astro` files until they migrate.
- Brand tokens in `src/styles/tokens.css` (P2 Moss, light and dark through `light-dark()`), copied from `docs/brand/tokens.css`. Do not change their values.
- Fonts are local woff2 files in `public/fonts/`. No runtime request leaves the site's origin: no CDNs, no third-party scripts.

## Scripts

Run from the repo root (`bun run check`, `bun run test`), or here with `bun run <script>`:

- `dev`, `preview`: local server.
- `sync`: generates Astro's types into `.astro/`; turbo runs it before `check`.
- `check`: typecheck with the root `typescript7` by path, `.astro` files included through `@astrojs/ts-content-mapper`.
- `test`: `bun test`.
- `build`: only when a ticket needs the production build.
- `test:e2e`, `test:dist`: Playwright with axe and the dist audit, against a running site. Build, serve `dist`, then set `SITE_URL` (default `http://127.0.0.1:8080`, often taken locally).

## shadcn ui layer

- `src/components/ui/` is vendored with the pinned CLI and never hand-edited: `bunx shadcn@4.23.0 add <component>` (add `--overwrite` to re-sync), then `bun run format:write`. The layer is exempt from lint, knip exports and the coverage gate.
- Customise in `.tsx` wrappers outside `ui/`. `.astro` files never mount a shadcn component directly: they mount a wrapper island, or use the `*Variants` helpers for static markup.
- Use `cn` from `@/lib/utils` in hand-written code. The generated ui files import `cn` from the shadcn `cn` package; that is the CLI's output, not an error.
- Island tests use `renderIsland` from `src/test/render.tsx` on happy-dom, which cannot open Base UI popups: cover open menus, the sheet and search in `e2e/interactions.spec.ts`.
- Header menus announce themselves with `announceHeaderMenuOpen` and close on `onOtherHeaderMenuOpen` (`src/components/site/header-menu-events.ts`), so only one is open. The announcement carries the opening menu's trigger as `source`, and `close` receives it: `MobileMenu` stays open when `source` is inside its panel.

## Layout

- `src/i18n/locales.ts`: `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_NAMES`, `localePath()`. English is at `/`, the others under their lower-case tag (`/pt-br/`).
- `src/layouts/BaseLayout.astro`: the document shell (`title`, `description`, `locale`).
- `design/`: the home page's design direction, run notes and painting masters.

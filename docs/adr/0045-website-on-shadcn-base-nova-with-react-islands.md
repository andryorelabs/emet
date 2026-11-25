# 0045. Website on shadcn base-nova with React islands

Status: Accepted (2026-11-25)
Spec: Website on shadcn with Base UI (issue #897)

Amends [0019](0019-website-on-coolify-with-astro-and-starlight.md): the Website keeps Astro and Starlight, and its interactive parts move to shadcn `base-nova` on Base UI through React **Islands**.
Amends [0002](0002-oxc-toolchain-and-typescript-7-typecheck.md): the vendored shadcn layer is exempt from lint, one deliberate and scoped exception to "never loosen a lint setting".

## Context

Every control of the Website is a hand-written `.astro` file backed by a TS module (`theme-menu.ts`, `header-menus.ts`, `page-actions.ts`). The maintainer's sibling sites (snug, animated-fluent-emojis) use shadcn `base-nova`, so tokens, components and workflow diverge across projects.

## Decision

- **shadcn `base-nova` on Base UI**, vendored in `apps/site/src/components/ui` with a pinned `bunx shadcn@4.23.0 add`. Vendored files are never hand-edited; customisation lives in `.tsx` wrappers. `components.json` is modelled on the sibling sites.
- **React only in Islands.** `@astrojs/react` hydrates the theme and language menus, the mobile menu, page actions, the docs search dialog and the FAQ. Static pieces (`button`, `badge`, `kbd`, `card`, `empty`) render on the server with no `client:*`, through `*Variants` helpers. Hydration uses a custom `client:interaction` directive for header controls, `client:visible` for the FAQ and `client:idle` for page actions; `client:load` is never used.
- **Brand tokens stay the source of truth.** shadcn variables and Starlight's `--sl-*` map to `tokens.css`, whose values do not change. Dark mode keeps the `.dark` class from `theme.ts`.
- **Unchanged.** Expressive Code for `CodeBlock`, Pagefind for search, the hash-based CSP, and the bun test and happy-dom setup. The install tabs stay a markdown directive that emits static `tabs` markup, so no page moves to MDX.
- **Lint.** `@shadcn/lint` is enforced on hand-written `.tsx` and `.astro` files. The vendored ui layer is generated code, so it is excluded from lint, knip exports and the coverage gate, and only that directory.
- **Lighthouse.** The budget is kept; if the React runtime breaks it, the same spec changes the budget explicitly and records why here.

## Consequences

- Pages with an island load the React runtime; pages without one load none, and `audit-dist.ts` checks it.
- Components, tokens and workflow match the sibling sites.
- Adding a component is one pinned CLI call plus a wrapper.
- The ui layer is the one place a lint setting is loosened, and an upgrade of `shadcn` is a deliberate ticket.

## Verification (2026-11-25)

- **Island audit.** `apps/site/scripts/audit-dist.ts` fails when a page with no `astro-island` references the React runtime (`client`, `react`, `react-dom`, `jsx-runtime` chunks) or when an executable inline script has no hash in the page's `script-src`. The production build passes: the 81 island-free pages are redirect stubs with no script.
- **Axe.** The e2e spec also runs axe in light and dark with the theme menu, the mobile menu sheet, the search dialog and an opened FAQ item. The FAQ check is scoped to the accordion, because axe cannot resolve the header's contrast once the page is scrolled to it.
- **Lighthouse.** The budget is unchanged and passes on the built site, served gzipped as the nginx image does: transfer weight is 539 KiB on the home page and 308 KiB on a docs page, against the 1024 KiB budget, so the React runtime does not break it. Measured without compression the home page weighs 1067 KiB and fails the weight budget; the budget assumes the production `gzip` setting.

## Known defect

The FAQ accordion (Base UI) server-renders inline `style` attributes (`--accordion-panel-height`, `--accordion-panel-width`, `animation-name:none`) that the hash-based `style-src-attr` policy does not allow, so the browser reports a CSP violation on `/` and every translated home page. It is a real finding: the policy stays hash-based with no `'unsafe-inline'`, and the fix lives in the FAQ island, outside the audit. Until then the style CSP e2e tests for `/` and `/es/` are marked `test.fail` and the Lighthouse best-practices budget keeps its per-page waiver; both turn red or stale once it is fixed.

## Alternatives considered

- **Keep hand-written `.astro` components.** Rejected: the divergence from the sibling sites is the problem.
- **Move docs pages to MDX to hydrate islands in content.** Rejected: the install tabs do not need it, and the docs would couple to React.
- **Hydrate with `client:load`.** Rejected: it ships the runtime on every page view regardless of use.

# 0019. Website on Coolify with Astro and Starlight

Status: Accepted (2026-11-06)
Spec: emet Website (S2, S8, S9, S10)

## Context

emet has an approved brand kit ([ADR-0014](0014-brand-kit-in-docs-brand.md)) and a domain (`emet.andryore.dev`), but the brand brief listed a landing page as out of scope. Visitors reach the GitHub README, and the docs are English-only markdown on GitHub. The maintainer's sibling projects solved the same problem: animated-fluent-emojis ADR 0018 (Astro and Starlight in a bun then nginx image on Coolify) and snug ADR 0019 (docs read from the repository through an allowlist, translated with a source hash) and ADR 0022 (deploy token as a GitHub secret).

"Landing" already means how a wave reaches trunk in `GLOSSARY.md`, so the public site is the **Website**.

## Decision

- The Website lives in `apps/site` ([ADR-0018](0018-bun-workspaces-monorepo-with-emet-outside.md)): Astro 7, Tailwind 4, Starlight for the docs. It consumes the brand kit's tokens and local fonts. No third-party scripts and no runtime request leaves the site's origin; the CSP is Astro's hash-based one plus `'wasm-unsafe-eval'` for self-hosted Pagefind search.
- The home page is designed with the design-taste-frontend run, with `--keep palette,type`, after a design canvas is approved.
- The docs are read from `docs/` at build time through an allowlist, nothing copied: `docs/guide`, `docs/reference`, `troubleshooting.md`, `architecture.md`, two how-tos, and `CHANGELOG.md` as What's new. ADRs, `docs/agents/`, `docs/brand/`, `docs/specs/` and the release how-to stay on GitHub. Links from published docs to unpublished files point at GitHub.
- The Website ships in ten locales (en, es, de, fr, it, ja, ko, pt-BR, ru, zh-CN): English at `/`, the others at `/<locale>/`. Home strings are typed TS modules with a key-parity test. Doc translations are AI-made without human review and record the `sourceHash` of their English source; a missing or stale one renders English with a notice, and a drift test fails the build.
- Deployment: `apps/site/Dockerfile` (bun build, nginx serve) deployed to Coolify Cloud by `deploy-site.yml` on push to `main`. `COOLIFY_API_TOKEN` is a GitHub secret and the app UUID a repository variable. The site goes live when `develop` is released to `main`.
- This supersedes the "landing page out of scope" line in `docs/brand/brief.md`, which is kept as a historical record.

## Consequences

- Docs keep one source (`docs/`), so `lint:docs` and GitHub links keep working.
- A release adds a translation step for the new changelog section and any changed doc; the drift test enforces it.
- The Website adds a Docker build and a deploy workflow to CI that must follow the workflow invariants.
- Translation quality is unreviewed; the English text prevails.

## Alternatives considered

- **Cloudflare Pages or GitHub Pages**: simpler to set up, but nginx redirects and security headers are needed, and every sibling site runs on Coolify.
- **Hand-built Astro pages for the docs**: cheaper for one page, but search, sidebar and pagination would be rebuilt by hand.
- **Moving docs into `apps/site`**: breaks `lint:docs`, README links and the ADR tooling.
- **English only at launch**: smaller first wave, but the maintainer's other sites ship every locale and the strings are cheaper to structure from the start.

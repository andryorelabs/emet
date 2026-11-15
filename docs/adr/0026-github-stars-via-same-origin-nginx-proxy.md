# 0026. GitHub stars via a same-origin nginx proxy

Status: Accepted (2026-11-15)
Spec: Website parity with shadcn/ui and editorcn (S9, S10)

## Context

The Website header should show the repository's GitHub star count. [ADR-0019](0019-website-on-coolify-with-astro-and-starlight.md) forbids any runtime request that leaves the site's origin, and the CSP has no `connect-src` today. A count baked in at build time goes stale until the next release.

## Decision

- The Website stays static except for one endpoint: `/api/github-stars`, an nginx `location` that proxies the GitHub repository API and caches the answer for 10 minutes (`proxy_cache`), serving the last cached copy when GitHub errors (`proxy_cache_use_stale`).
- The visitor's browser only ever talks to the Website's own origin, never to GitHub, and the CSP is unchanged.
- The build fetches the count once and writes it into the HTML, so the first paint needs no request. A small client script then refreshes it from `/api/github-stars`. Any failure keeps the build-time value, or shows the icon alone when the build fetch also failed.
- This is the single exception to ADR-0019's "no runtime request leaves the site's origin": the proxy request leaves the nginx container, not the browser.

## Consequences

- The count is at most about 10 minutes old, and GitHub sees at most about 6 requests per hour, far below the unauthenticated limit.
- nginx needs a `resolver`, outbound internet access and a cache path, and `docker/smoke.sh` must check the endpoint.
- The Docker build needs outbound access to `api.github.com` for the build-time value; a failed fetch must not fail the build.
- The Website is no longer purely static files; the cache is lost when the container restarts, which only costs one extra upstream request.

## Alternatives considered

- **Browser fetches `api.github.com` directly**: always fresh, but it sends the visitor's IP to GitHub, breaks ADR-0019 and forces a `connect-src` entry in the CSP.
- **Build-time count only**: keeps the site fully static, but the number moves only when the site is redeployed.
- **Build-time count plus a daily scheduled redeploy**: no runtime code, but the number is up to a day old and every refresh costs a full Docker build.

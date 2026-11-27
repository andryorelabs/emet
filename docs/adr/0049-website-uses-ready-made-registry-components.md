# 0049. Website uses ready-made registry components, never ports

Status: Accepted (2026-11-27)
Spec: Website home fixes after the v17 parity run

Amends [0045](0045-website-on-shadcn-base-nova-with-react-islands.md): home code blocks and typed terminals are vendored registry components, not Expressive Code and hand-written modules.

## Context

The v17 prototype was built from shadcn-registry components (magicui `terminal`, kokonutui `topo-background`, the `dither-image` of tinkererslabs). The build ported them by hand into vanilla modules, and `components.json` declared no registry. The ports drifted: a stray global `pre` rule broke every code block, the typed terminal and footer were rewritten, and the About eyes were hidden by a blanket `canvas` rule.

## Decision

- **Install, never port.** Where a ready-made component exists in a registry, install it with the pinned `bunx shadcn@4.23.0 add` and use it. Customise only through props, `className` and wrappers; never hand-edit a vendored file or copy it into a hand-written module.
- **Source order:** the shadcn base-nova registry first, then `@magicui`, `@tinkerers` (tinkererslabs), then `@hairline`, `@keyframeui`, `@kokonutui`, glint and 01orbital. `components.json` declares each registry in use.
- **Home code blocks** use the shadcn `code-block` (client shiki, one JS regex engine) and typed terminals use `@magicui/terminal`. Docs keep Starlight's Expressive Code, which highlights markdown at build time.
- **CSP.** No `'unsafe-inline'`. A server-rendered `style` attribute that a registry component emits (the `counter-reset` of `code-block`) is allowed by hash and pinned by a unit test, as the FAQ is in 0045. A component whose output needs any other inline `style`, or a heavy dependency, is rejected, not patched.
- **Licences.** Each item's licence is checked before it is vendored and recorded in the ticket handoff.
- Every worker records which item it installed, or which it checked and rejected and why.

## Consequences

- The hand-written `typed-terminal.ts`, `typing-schedule.ts`, `stats/topo.ts`, the custom `.button`, `.bento-card` and footer markup are replaced where a registry item matches the v17 look, and the dead code is deleted.
- The home loads shiki and `motion` where a component needs them; the Lighthouse weight budget stays and is re-measured gzipped.
- A registry upgrade is a deliberate ticket, like a shadcn upgrade in 0045.

## Alternatives considered

- **Keep Expressive Code for home blocks**: rejected by the maintainer, who wants the shadcn component and no recreation.
- **Port registry components into typed local modules**: rejected, it is what produced the drift.

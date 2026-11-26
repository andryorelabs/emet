# 0046. Website painting motion through WebGL

Status: Accepted (2026-11-26)
Spec: Website home redesign to prototype v17

Extends [0020](0020-website-imagery-is-ai-generated-paintings.md): the AI paintings stay the only imagery, and they gain motion.
Relies on [0019](0019-website-on-coolify-with-astro-and-starlight.md) and [0045](0045-website-on-shadcn-base-nova-with-react-islands.md): the hash-based CSP does not change.

## Context

The approved home redesign animates the paintings: drifting clouds, a flowing river, eyes that follow the cursor and a dither reveal. Doing this with stacked CSS layers (the current `Valley.astro`) cannot warp pixels, and the Website has no canvas or WebGL today.

## Decision

- **One `painting-fx` module** under `apps/site/src/components/home/graphics/painting-fx/`. The painting is declared as data (eye positions, river polylines, sky mask). Shaders and the render loop are shared by every section that shows a painting.
- **Lazy and gated.** A layer initialises through an IntersectionObserver, pauses off-screen and on a hidden tab, and is off for `prefers-reduced-motion`, viewports of 900px or less, coarse pointers and browsers without WebGL.
- **Fallback.** The static image plus the CSS Valley stay as the baseline. The Valley CSS layers are hidden only while the WebGL layer is active (`data-fx="on"`).
- **CSP unchanged.** Modules are bundled `'self'` scripts, textures are same-origin images, dynamic values are written through CSSOM, and there are no `blob:` workers, inline style attributes or third-party origins.
- **Tested without a GPU.** Pure logic (cover geometry, flow map, eye state, the enable decision) is unit-tested, and the GL glue runs against a fake `WebGLRenderingContext`. No coverage exception is added.

## Consequences

- The home ships a small WebGL runtime; the Lighthouse budget still applies.
- A section that shows a painting adds an effect by calling `paintingFx` with options, not by writing a shader.
- Browsers without WebGL, and reduced-motion users, see the same page as today.

## Alternatives considered

- **Keep stacked CSS layers**: rejected because CSS cannot warp pixels around the eyes or flow the river.
- **Pre-rendered video loops**: rejected because they add megabytes, cannot follow the cursor and clash with the hash-based CSP media policy.
- **A WebGL library such as three.js**: rejected because the effects are three small fragment shaders and the bundle cost is not justified.

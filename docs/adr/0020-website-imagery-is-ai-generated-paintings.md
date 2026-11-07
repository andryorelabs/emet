# 0020. Website imagery is AI-generated paintings from recorded prompts, with disclosure in the footer

Status: Accepted (2026-11-06)
Spec: emet Website (S3, S6)

## Context

The Website needs real pictures, and emet has no GUI to screenshot. The first plan used open-collection archival photographs of the Golem of Prague, credited in the footer. Next to the painted hero the maintainer chose they read as cold, off-topic and mismatched, and hand-coded SVG drawings were rejected as childish or abstract.

## Decision

- The Website's pictures are five paintings generated with ChatGPT image generation in one conversation so the style holds: hero (clear afternoon), dusk (the held state of the live thing), portrait of the golem, morning mist (closing band and 404) and golden hour (how it works).
- Their WebP masters and the prompts that produced them are committed under `apps/site/design/` (`pictures/` and `pictures-prompts.md`), so any picture can be regenerated or extended in the same style.
- The footer states that the paintings were generated with AI from prompts by the maintainer. Archival pictures are not used on the Website.
- The paintings count as real pictures for the design-taste-frontend picture floor, together with the `data-ui` interface fragments built from real emet output.
- The build serves them as AVIF and WebP with `srcset` from the same origin; the hero is preloaded and every other picture is lazy.

## Consequences

- One coherent visual world from hero to footer, and the live thing can change the light of the same valley.
- The style depends on a hosted image model; later pictures are regenerated from the recorded prompts and may drift. Masters in the repo keep the existing set stable.
- Disclosure is a maintenance duty: any new generated picture keeps the footer line true.
- No per-picture credit lines are needed, so the footer stays one quiet line.

## Alternatives considered

- **Archival public-domain photographs**: cold greyscale pictures that fight the painted hero, and the 1915 film still is the least on-brand image.
- **Hand-coded SVG illustration**: tried five times, judged childish or abstract.
- **Stock photography**: no subject of its own, and it passes for the product.
- **No pictures beyond interface fragments**: fails the picture floor and leaves the page clinical.

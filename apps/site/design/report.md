# Website run report

Step 10 report of the design-taste-frontend run for the home page, scroll motion layer (S4, scroll part). The motion graphics (valley, typed terminal, wave diagram, fireflies) belong to the next ticket and extend this file.

## Motion tokens as built

- Ease: `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out`) for every transition and entrance. Scroll-linked motion is linear, tied to the scroll position.
- Page load: h1, sentence and actions rise 12px with opacity, 500ms, 80ms stagger, pure CSS, no script.
- Reveals: headings rise by masked line (12px, 400ms; the `h2` clips, an inner `.reveal-line` moves). Terminals (`.fragment`) and the six notes rise 12px, 400ms, staggered 60ms within the batch that enters together, once.
- Press feedback: `.button`, the copy buttons and the showcase knob scale to 0.97 in 160ms. Reduced motion drops the press scale.
- Hero recede (`data-recede`): picture sinks 8%, ink overlay to 35%, copy lifts 6% and fades by 70% of the exit. `animation-timeline: view()` through a named timeline, range `exit`.
- Drift (`data-drift`): about and closing pictures travel 7% (3.5% each way, scale 1.08); the how-it-works painting 5% (`data-drift="6"`, scale 1.06), driven by the whole section so the sticky frame still drifts. Frames use `overflow: clip`.
- Smooth scroll: Lenis 1.3 bundled from `apps/site` (no CDN), `lerp 0.1`, `autoRaf`, `anchors: true`. Off on `pointer: coarse` and with reduced motion; native keyboard scrolling and hash links keep working.

## Behaviour and fallbacks

- Only `transform` and `opacity` move. Nothing animates layout.
- Hidden starting states exist only under `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`. A 2.5s CSS failsafe shows them if the module never marks `html[data-motion]`.
- Without `animation-timeline: view()` the module sets `html[data-scroll-fallback]` and writes `--p` (0 to 1) on the marked sections from an IntersectionObserver plus one passive scroll handler per frame; the same keyframe values are computed in CSS from `--p`.
- The CSS minifier folds longhands into an `animation` shorthand that older Chromium drops; the scroll-linked rules deliberately omit the duration longhand so they stay as longhands.
- Interfaces for the next ticket: `initMotion(root)` in `components/home/motion/motion.ts`, `data-reveal="heading|item"`, `data-recede`, `data-drift`, and the empty `data-slot="wave-diagram"`. The script is a bundled module in `Hero.astro`, so Astro hashes it for the CSP.

## Gate

- `inspect.mjs` on the production build at 1440, 768 and 390: 0 FAIL with `--allow outlined-box,palette-purple`. Without the flags it reports 2 FAIL, both from other tickets' assets: the 1px border of the interface fragments and code blocks (`outlined-box`) and the `github-light` purple token colour (`palette-purple`, S12 mandates those token colours). Both stay and are passed with `--allow`.
- WARN kept and defended: one hairline in the code block header; no footage (no honest clip of a CLI tool, the paintings are the pictures).
- Real-browser check on the build: no CSP violation and no request outside the origin, with motion, with reduced motion, without script and on a touch profile. With reduced motion and without script every `data-reveal` element is fully opaque and no animation runs; on touch Lenis is not started; the fallback writes `--p`; the hero image sinks 49px at 68% of the exit.

## Deviations

- The copy button class is `emet-code__copy`, not `cb-copy`; its press feedback already existed in `code.css`.
- The showcase heading is not revealed (script swaps its text) and the showcase stage does not drift (its two paintings cross-fade).

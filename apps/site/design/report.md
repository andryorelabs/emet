# Website run report

Step 10 report of the design-taste-frontend run for the home page, scroll motion layer (S4, scroll part). The motion graphics (valley, typed terminal, wave diagram, fireflies) are the second section below.

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

## Motion graphics (S4, graphics part)

Components in `components/home/graphics/` (`Valley`, `Fireflies`, `WaveDiagram`, `typed-terminal.ts`, `typing-schedule.ts`, `ambient.ts`) and `styles/graphics.css`. All decorative and `aria-hidden`, no third-party code, no request outside the origin.

- Valley: a scene with the painting's ratio sits over the hero, showcase and closing pictures. It copies `object-fit: cover` with container units (`--ox`, `--oy` are the picture's `object-position`: 50% 100%, 94% 100% under 641px), so every position is a percentage of the picture. Two cloud drifts (78s, 90s), one mist drift (66s), three river glints (5.5s), and per-eye glow (pulse 5s) plus a stone lid that blinks every 9s. At dusk the glow range goes from 0.35-0.7 to 0.6-1 and the tones warm. Eye positions were measured on the masters (hero 80.86% and 82.91% x, 71.42% y; showcase and closing within 0.15%). Measured on the build at 1440, 768 and 390 the overlay lands within 0.8px of the painted eye in all three paintings. The scene takes the same recede or drift transform as the picture, so it keeps following it while scrolling.
- Typed terminal: each `[data-typed]` exchange arms on load and plays once at 30% visibility. The command types at 14 to 40ms per character (at most about 1.4s), with a lamp-coloured block cursor of zero layout width; the untyped tail stays in place with `opacity: 0`, so nothing reflows. Output blocks reveal line by line (90ms per line, opacity 120ms). The final state is the HTML: without script or with reduced motion nothing is touched, and the copy buttons read `data-code`, not the typed text.
- Wave diagram: inline SVG under the ticket tree. Lines use `pathLength="1"` and draw with `stroke-dashoffset` on a named view timeline (fan-out at cover 8-26%, merge at 32-52%, nodes fade between). Without `animation-timeline: view()` or with reduced motion it is complete.
- Fireflies: ten amber dots inside the showcase scene, opacity 0 until `data-state="held"` (600ms fade), loops paused while merged.
- Cost and pausing: CSS only except the typed terminal. Loops pause when the tab is hidden (`html[data-tab-hidden]`) and when a scene is off screen (`data-paused`), both set by `ambient.ts`. Reduced motion hides the valley scenes and fireflies entirely. Weight: about 5.8 KB minified CSS, about 0.9 KB SVG and about 3.9 KB minified script; gzipped together about 3.9 KB, under the 6 KB budget.
- Inline `style` attributes are blocked by the CSP (hash-based `style-src`), so every per-element value lives in `graphics.css` as `nth-child` rules instead of inline variables.

Deviations and concerns:

- The wave diagram animates `stroke-dashoffset`, as the ticket specifies, which is a paint property, against the transform and opacity rule. The SVG is tiny (about 0.9 KB, six paths), so the cost is negligible.
- The lid is a flat stone-coloured disc sampled from each painting, so the blink is only believable at the 150ms it lasts.
- Gate: `inspect.mjs` on the production build at 1440, 768 and 390 gives 0 FAIL with `--allow outlined-box,palette-purple`, the same two allowances as the scroll section. Reduced motion and no-script were checked in a real browser: content complete, valley hidden under reduced motion, no CSP violation.

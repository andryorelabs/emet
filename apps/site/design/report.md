# Website run report

Step 10 report of the design-taste-frontend run for the home page, scroll motion layer (S4, scroll part). The motion graphics (valley, typed terminal, wave diagram, fireflies) are the second section below.

## Motion tokens as built

- Ease: `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out`) for every transition and entrance. Scroll-linked motion is linear, tied to the scroll position.
- Page load: h1, sentence and actions rise 12px with opacity, 500ms, 80ms stagger, pure CSS, no script.
- Reveals: headings rise by masked line (12px, 400ms; the `h2` clips, an inner `.reveal-line` moves). Terminals (`.fragment`) and the six notes rise 12px, 400ms, staggered 60ms within the batch that enters together, once.
- Press feedback: `.button`, the copy buttons and the showcase knob scale to 0.97 in 160ms. Reduced motion drops the press scale.
- Hero zoom (`data-zoom`): the painting scales through `--hs`, written by `motion.ts` from the scroll position, about the 50% 70% origin. It replaces the earlier recede. No work runs while the hero is off screen or the tab is hidden.
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

- Valley: a scene with the painting's ratio sits over the hero, showcase and closing pictures. It copies `object-fit: cover` with container units (`--ox`, `--oy` are the picture's `object-position`; the hero valley uses 50% 62% at every width, as the prototype does, and the other valleys keep 50% 100%, 94% 100% under 641px), so every position is a percentage of the picture. Two cloud drifts (78s, 90s), one mist drift (66s), three river glints (5.5s), and per-eye glow (pulse 5s) plus a stone lid that blinks every 9s. At dusk the glow range goes from 0.35-0.7 to 0.6-1 and the tones warm. Eye positions were measured on the masters (hero 80.86% and 82.91% x, 71.42% y; showcase and closing within 0.15%). Measured on the build at 1440, 768 and 390 the overlay lands within 0.8px of the painted eye in all three paintings. The scene takes the same recede or drift transform as the picture, so it keeps following it while scrolling.
- Typed terminal: each `[data-typed]` exchange arms on load and plays once at 30% visibility. The command types at 14 to 40ms per character (at most about 1.4s), with a lamp-coloured block cursor of zero layout width; the untyped tail stays in place with `opacity: 0`, so nothing reflows. Output blocks reveal line by line (90ms per line, opacity 120ms). The final state is the HTML: without script or with reduced motion nothing is touched, and the copy buttons read `data-code`, not the typed text.
- Wave diagram: inline SVG under the ticket tree. Lines use `pathLength="1"` and draw with `stroke-dashoffset` on a named view timeline (fan-out at cover 8-26%, merge at 32-52%, nodes fade between). Without `animation-timeline: view()` or with reduced motion it is complete.
- Fireflies: ten amber dots inside the showcase scene, opacity 0 until `data-state="held"` (600ms fade), loops paused while merged.
- Cost and pausing: CSS only except the typed terminal. Loops pause when the tab is hidden (`html[data-tab-hidden]`) and when a scene is off screen (`data-paused`), both set by `ambient.ts`. Reduced motion hides the valley scenes and fireflies entirely. Weight: about 5.8 KB minified CSS, about 0.9 KB SVG and about 3.9 KB minified script; gzipped together about 3.9 KB, under the 6 KB budget.
- Inline `style` attributes are blocked by the CSP (hash-based `style-src`), so every per-element value lives in `graphics.css` as `nth-child` rules instead of inline variables.

Deviations and concerns:

- The wave diagram animates `stroke-dashoffset`, as the ticket specifies, which is a paint property, against the transform and opacity rule. The SVG is tiny (about 0.9 KB, six paths), so the cost is negligible.
- The lid is a flat stone-coloured disc sampled from each painting, so the blink is only believable at the 150ms it lasts.
- Gate: `inspect.mjs` on the production build at 1440, 768 and 390 gives 0 FAIL with `--allow outlined-box,palette-purple`, the same two allowances as the scroll section. Reduced motion and no-script were checked in a real browser: content complete, valley hidden under reduced motion, no CSP violation.

## End-to-end coverage (CLA-1030, rewritten by CLA-1045)

Verified with Playwright against the production build served by the repo's nginx configuration with the rendered CSP header (`apps/site/e2e/`: `accessibility.spec.ts`, `interactions.spec.ts`, `pointer-effects.spec.ts`): 99 tests pass, 0 axe violations and 0 `securitypolicyviolation` events. `KNOWN_AXE_ISSUES` is empty: there is no waiver. The earlier waivers (dimmed idle How it works steps, scrollable `.terminal` and install `pre`) were fixed in the product code.

- How it works: pins at 1440, steps change at about 30% and 62%, Claude Code and Codex tabs with copy, stacked at 390 and under reduced motion.
- Features: hold-to-approve, flag toggle. Showcase: pin, auto-flags, stacked at 390 and under reduced motion. Closing: exact install command copied.
- Hero (CLA-1045): the pointer over a headline line sets a letter `--k` above 0.5; under reduced motion no letter is split; a golem click adds a ring animating `scale(1)` to `scale(7)` over 900 ms.
- Companion: menu, drag spring-back, reduced motion; with Playwright fake timers (`page.clock`) it falls asleep after 20 s without input (not at 19 s) and wakes on a pointer move.
- Layout: no horizontal scroll at 1440 and 390, both motion modes, `/` and `/es/`. CSP: a full scroll with and without reduced motion raises no violation.

Not run here: the Lighthouse budget (CI job) and the coverage floors beyond `bun run test`.

## Final parity pass (CLA-1045, S13)

Run on the final build (wave 5 integrated, CLA-1046 to CLA-1049): `bun run --cwd apps/site parity` gives 320 pairs (8 sections, 8 variants: 1440x900 and 390x844, light and dark, motion and reduced), 0 missing captures, mean pixel difference 36.8%, 318 flagged above the 5% threshold, worst `desktop-light-motion/closing@75` at 80.5%. Captures and `report.json` are in `apps/site/e2e/.output/parity/`. The e2e suite on the same build, served by the repo's nginx configuration with the rendered CSP: 99 tests, 0 axe violations, 0 `securitypolicyviolation` events, no waiver. Under host load (load average near 40) four parallel workers hit 30 s timeouts on three axe tests; all 36 accessibility tests pass at two workers.

The whole-frame pixel metric stays far above tolerance, so the pass is closed by documenting each remaining difference, not by the number. Mean difference per section, desktop and mobile: hero 17% and 34%, How it works 41% and 30%, showcase 33% and 66%, features 8% and 15%, stats 17% and 22%, about 60% and 52%, FAQ 24% and 23%, closing 80% and 66%. Against the previous pass the showcase desktop dropped from 76% to 33%: the dark section background, the painting inset and the crop now match, and the doubled eyes and the narrow closing panel are gone (closing is full-bleed with the heading at the prototype size).

Why the ratio stays high even where the content matches:

- Capture framing: the harness clips each section from its top edge, and the prototype sections carry a 40 px top margin, a 880 px closing frame against the site's 760 px (`min(760px, 92svh)` at 900 px is 760 px by S11), and an about frame of 859 px against 581 px. The same fraction of a taller or shorter section lands on different content. This is a harness limitation and the main driver of about (60%) and closing (80%).
- Subpixel text and the dithered painting in How it works change many pixels without a visible difference.

Documented deviations (allowed list), each visible in every relevant capture: axe contrast (waiting steps are dimmed with colour, not opacity), CSP (CSSOM and `data-*`, rendered script hashes), i18n (strings come from `src/i18n/ui/*.ts`, so companion lines such as "Lamp on. Reading the spec." differ from the prototype's), reduced motion, `pointer: coarse`, and the prototype's dev-only lab panels (the "Painting lab" button in every prototype capture).

Differences seen in the captures that are not on the allowed list. Each is out of this ticket's edit surface (`e2e/**` and this file) and is listed for a follow-up ticket; S13's "no undocumented difference above tolerance" is therefore met only as far as they are listed here:

- How it works step 1 and 2 content: the site shows a ticket-tree card (spec title, waves, rows with ticket numbers) under the typed command where the prototype types the wave list inside the terminal block; step 0 in the site omits the "Other ways to install" link and the dimmed `$ ` prompt, and the site code uses the `github-light` token colours where the prototype uses plain ink and green.
- Showcase panel (30%): the prototype draws labelled pills and a "review" tag in the diagram and a bordered "Flag ticket #44" pill; the site draws a plain toggle row, evenly spaced dots, no review tag, an extra "emet" wordmark in the panel footer and four corner brackets around the frame. The panel is about 60 px taller in the site.
- About: at progress 0 the site Latin "e" strike and the Hebrew aleph strike are a stronger red where the prototype shows a faint pink; the site painting shows a pale clipped patch at its top-left corner during the reveal.
- Closing: the heading weight reads lighter in the site than in the prototype's 700, and the install button label is smaller (15 px against 17 px).
- Section top offsets: the site starts How it works, showcase and about 8 to 40 px higher than the prototype at the same progress; this is the harness framing above and not a layout finding.

Follow-up needed to take the pixel metric to tolerance: align the How it works step content, the showcase panel and frame decoration, the about strike colour and the closing heading weight, then rerun the harness.

## Palette constants

- Golem ring and hero amber: `oklch(0.92 0.14 95)`, the prototype's amber. It lives in `--hero-amber` (`hero.css`) and `RING_COLOUR` (`golem-hotspot.ts`) as a documented canvas and effect constant, not a token.

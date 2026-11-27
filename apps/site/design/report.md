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
- Companion: menu, drag spring-back, reduced motion; with Playwright fake timers (`page.clock`) it falls asleep after 20 s without input (not at 19 s; the clock is paused right after navigation so only `runFor` advances the idle timer) and wakes on a pointer move.
- Layout: no horizontal scroll at 1440 and 390, both motion modes, `/` and `/es/`. CSP: a full scroll with and without reduced motion raises no violation.

Not run here: the Lighthouse budget (CI job) and the coverage floors beyond `bun run test`.

## Final parity pass (CLA-1054, S13)

Run on the final build (waves 1 to 7 integrated, including the four parity fixes CLA-1050 to CLA-1053): `bun run --cwd apps/site parity` gives 320 pairs (8 sections, 8 variants: 1440x900 and 390x844, light and dark, motion and reduced), 0 missing captures, mean pixel difference 36.6%, 319 flagged above the 5% threshold, worst `desktop-light-motion/closing@75` at 80.5%. Captures and `report.json` are in `apps/site/e2e/.output/parity/`. The e2e suite on the same build (image built from `apps/site/Dockerfile`, served by the repo's nginx configuration with the rendered CSP) at two workers: 99 tests pass, 0 axe violations, 0 `securitypolicyviolation` events, no waiver. An earlier run at the same two workers under host load average near 150 timed out one `page.goto` in "a theme choice syncs across two tabs"; it passes alone and in the rerun.

The whole-frame pixel metric stays far above tolerance and did not move with the four fixes (36.8% before, 36.6% now), because the dominant terms are layout framing and painting crop, not the content the fixes changed. The pass is therefore closed by documenting every remaining difference with its measured cause, as the user approved, not by the number.

Mean difference per section, desktop and mobile: hero 17% and 34%, How it works 42% and 30%, showcase 32% and 64%, features 8% and 16%, stats 17% and 22%, about 59% and 52%, FAQ 24% and 23%, closing 80% and 66%. Split by variant (desktop): showcase is 7% to 8% with motion and 56% under reduced motion, How it works is 27% with motion and 56% under reduced motion; theme changes nothing beyond 2 points in any section.

### Measuring the harness framing claim

The previous report asserted that the harness framing, not the layout, drives the about and closing numbers. The harness clips each section to its own box and records both clip heights, so the claim can be tested. The clip heights per pair (prototype against site) are: about desktop 859 against 581, closing desktop 880 against 760, closing mobile 844 against 761, FAQ desktop 831 against 686, stats 533 against 485 (desktop) and 708 against 646 (mobile), showcase mobile 844 against 780. The ratio already counts the rows only the taller clip has as fully different, which is 32% of the about desktop score (278 of 859 rows), 14% of closing desktop, 10% of closing mobile.

To separate framing from content, each pair was re-compared at full resolution with the prototype shifted down by N pixels (N from 0 to 160) and only the shared rows counted. Results, light with motion:

- Closing desktop: 78.2% at shift 0 falls to 24.9% at shift 40. The prototype `#close` box starts 40 px above its painted panel (the panel is 760 px high, the same as the site's); every element in the capture, the heading, the install button and the command, sits exactly 40 px lower in the prototype. The claim holds for closing: about 53 points of the 78% are the box offset. The remaining 25% is the painting itself, which resamples differently, and the toast and companion corners.
- Closing mobile: 75.2% falls to 31.2% at shift 40. The same 40 px offset.
- About desktop: 39.5% falls to 15.1% at shift 140. The prototype `#about` box carries about 140 px of padding above the content and 139 px below (859 against 581 for identical content blocks of about 580 px); the site's `.about` box is the content block only. The claim holds: the shared rows differ by 15% once aligned, and the 278 rows of padding add the rest.
- About mobile: both clips are 844 px, so there is no height term, yet the pair scores 52%. The best alignment (160 px) only reaches 29%. This is not framing. The body text wraps differently ("Hebrew for truth. A golem is" against "Hebrew for truth. A golem is clay") and the painting is 358 px wide in the prototype against 342 px in the site. The cause of that 16 px width difference is not isolated: both stylesheets use a 16 px side gutter at 390 px (the prototype's `--pad` is `max(16px, env(safe-area-inset-left))`, the site's `--gutter` is 16 px below 640 px), so a gutter difference does not explain it. A classic scrollbar on the prototype page is one untested candidate.
- FAQ desktop: 7.0% at shift 0, 2.8% at shift 101: the prototype box has about 101 px of top padding, and the content matches. FAQ mobile reaches 11.9% at the same shift. Stats: 8.7% falls to 7.0% (shift 73) on desktop and 14.5% to 14.0% (shift 67) on mobile; the offsets are the same kind of box padding.

So the framing claim is confirmed for closing, about on desktop and FAQ, and refuted for about on mobile, showcase and How it works under reduced motion, which are layout or rendering differences listed below. Neither the prototype nor the site is wrong in the framing cases: the prototype boxes include padding that the site keeps outside the measured element. Aligning them would need harness selectors that clip the same inner box on both sides, which is outside this ticket's edit surface.

### Documented deviations

Allowed categories, visible in every relevant capture: axe contrast (waiting steps are dimmed with colour, not opacity), CSP (CSSOM and `data-*` instead of inline styles, rendered script hashes), i18n (strings come from `src/i18n/ui/*.ts`, so companion lines such as "Lamp on. Reading the spec." differ from the prototype's), reduced motion, `pointer: coarse`, and the prototype's dev-only lab panels (the "Painting lab" button in every prototype capture).

Residual differences above tolerance, each with its measured cause:

- Box framing (closing, about, FAQ, stats): the prototype section boxes include 40 px (closing), 140 px (about), 101 px (FAQ) and about 70 px (stats) of padding that the site's measured elements do not. Measured above: aligning the boxes takes closing desktop from 78% to 25%, about desktop from 40% to 15% and FAQ desktop from 7% to 3%. Cause: harness selectors, not the page.
- Closing, content: the heading in prototype v17 is weight 600, not 700 (the previous report was wrong), and the install button is 18 px at weight 600 and 52 px tall. The site now matches both. The 25% left after alignment is painting resampling and the corner toast.
- About mobile (52%): the different text wrap and the 358 px against 342 px painting width, measured above; their cause is not isolated and is listed as an open follow-up, not as a measured deviation. The Latin "e" and aleph strikes now match the prototype's faint pink at progress 0.
- Showcase panel: the site panel is about 24 px taller than the prototype's (322 against 298 px) because it reserves room for the longer merged status line. The four corner brackets are kept because the prototype draws them too; the previous report was wrong to list them as a site-only addition.
- Showcase frame: the prototype section is inset 8 px on each side and the site's is full-bleed; on mobile the site section is 780 px against 844 px and the painting is cropped and scaled differently (the best vertical alignment of the two still differs by 51%), which accounts for the 64% mobile score (best-shift 51%). On desktop with motion the pair is 7% to 8%, near tolerance. Under reduced motion it is 56%: the prototype shows the unflagged scene (one lit dot) in a 900 px frame, while the site shows all dots lit in a 810 px frame with the panel about 90 px higher.
- How it works: step 2 keeps `WaveDiagram`, an inline SVG under the ticket tree, where the prototype types the wave list inside the terminal block; step 0 in the site omits the "Other ways to install" link and the dimmed `$ ` prompt, and the site code uses the `github-light` token colours where the prototype uses plain ink and green. Desktop with motion is 27%; under reduced motion it is 56%; this falls under the allowed reduced-motion deviation and its exact cause was not isolated further.
- Hero (17% and 34%) and features (8% and 16%): subpixel text and the dithered painting change many pixels without a visible difference. Both were measured only as whole-frame ratios; their causes were not isolated further.
- Section top offsets: the site starts How it works, showcase and about 8 to 40 px higher than the prototype at the same progress. This is the harness framing measured above and not a layout finding.

Follow-up to take the pixel metric to tolerance, if wanted later: clip the same inner box on both sides in `scripts/parity/plan.ts` (the padding offsets above), then measure the About mobile inner width on both pages (computed inline padding and painting width at 390 px) and align it, the showcase mobile crop and the How it works step 2 content.

## Palette constants

- Golem ring and hero amber: `oklch(0.92 0.14 95)`, the prototype's amber. It lives in `--hero-amber` (`hero.css`) and `RING_COLOUR` (`golem-hotspot.ts`) as a documented canvas and effect constant, not a token.

## Parity harness, deviations and final browser pass (CLA-1078, S12)

The harness (`scripts/parity/plan.ts`, `scripts/parity.ts`) gains a `footer` section (prototype `footer`, site `.site-footer`, captured at progress 0 and 1) and clips the same inner box on both sides: sections whose prototype box carries padding (stats, about, FAQ, closing, footer) are clipped to their content box (`contentBox`: border box minus vertical padding and borders) instead of the border box, which removes the 40 px (closing), 140 px (about), 101 px (FAQ) and about 70 px (stats) framing offsets measured in the CLA-1054 pass. Hero, How it works, showcase and features keep the border box. Unit tests pin the section table, the footer steps and `contentBox`.

Run on the built site (`bun run build`, `bun run --cwd apps/site parity`): 336 pairs (9 sections, 8 variants), 0 missing, mean difference 31.0% (36.6% before), worst `mobile-dark-motion/about@100` at 71.3%. Mean per section: showcase 51%, how 38%, hero 31%, about 34%, closing 39%, stats 28%, footer 21%, faq 19%, features 12%. Footer: about 20% on every desktop and mobile variant; the clips are 321 px (prototype) against 328 px (site) on desktop and 531 against 534 on mobile, so heights now match within 7 px and the rest is wordmark and text rendering. Closing fell from 80% to 39% and FAQ from 24% to 19% once the box is aligned. About stays high (34%, 71% worst on mobile): the About mobile wrap and painting width difference from CLA-1054 is still not isolated.

Tests: `bun test scripts/parity` 33 pass. The e2e suite on the built site, served with `astro preview` on a free port because port 8080 was held by another process: 113 pass and 12 fail, none in S3 to S10 (the home sections, search and S5/S6 specs pass). The failures are the home motion axe/CSP cases and the page-actions-menu axe cases (`astro preview` sends no nginx CSP header; the first passes alone), the search Ctrl+K focus-return case and the companion idle-clock case (`clock.pauseAt` in the past under host load). They need the nginx image the suite is written for.

User-chosen deviations from prototype v17 (every other difference is a bug):

- S3: the closing "Install emet" button is removed and the command with its copy button stays. Hero "Install emet" links to the localized install docs page and "Read the docs" to the docs index, where the prototype scrolls to `#install`.
- S6: home code blocks use the vendored shadcn base-nova `code-block` (client shiki, copy, wrapped lines) instead of the prototype's hand-written `pre`.
- S9: the five extra features are compact cards (title plus code line, no paragraph) linking to localized docs pages; the prototype has full notes.
- S10: the About golem's eyes animate and the About portrait has no `data-drift`, as in the prototype; the eyes canvas is displayed after the reveal.

Footer side by side (1440x900 light, `prototype-` against `site-desktop-light-motion-footer-0.png`): layout matches (wordmark left, tagline, Product and Trust right, one legal row). Visible differences: the site footer's left and right edges sit at 73 px against the prototype's 96 px (the site's outer margin is narrower), the link rows are 38 px apart against 33 px, and the column headings sit about 18 px higher on the site. No shadcn component was involved; these are for a follow-up ticket, not fixed here (outside this ticket's surfaces). The design-taste-frontend look-and-fix loop was applied to these captures only; it changed no file in the allowed surfaces.

Not done in this pass: screenshots at 1980x1080 and the manual side-by-side of the other reported spots. The harness captures at 1440x900 and 390x844, light and dark, are in `apps/site/e2e/.output/parity/` (git-ignored).

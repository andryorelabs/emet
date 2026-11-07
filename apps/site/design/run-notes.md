# Website design run notes

Steps 1 to 5 of the design-taste-frontend run, done before dispatch. The ticket that builds the home page continues from step 6. Canvas: see [docs/design/README.md](../../../docs/design/README.md). Direction sheet: [direction-sheet.md](direction-sheet.md).

Terms: the Website is the public site (home page and docs). Landing is how a wave reaches trunk, so the site is never called a landing page.

## 1. Brief and subject inventory

- Subject: emet, a plugin for Claude Code. One approval, then parallel workers in isolated worktrees, a review per wave, CI green before merge, nothing merges when flagged.
- Audience: developers who use Claude Code every day. Secondary: open source maintainers.
- The one thing to do: install the plugin.
- Brand (fixed, so `--keep palette,type`): P2 Moss tokens in `docs/brand/tokens.css`, Space Grotesk for text, JetBrains Mono for code only, the COMBO mascot, logo concept 04. Voice: sober and precise, dry humour only in the mascot and terminal lines.
- Real imagery that exists: the terminal banner, real CLI output (`emet status`), the mascot states, the logo. No product screenshots, because emet has no GUI.

What belongs to emet and to no competitor:

1. The name: Hebrew אמת, _emet_, truth, pronounced "EH-met". Erase the first letter and _met_, dead, remains.
2. The golem: a clay figure brought to life by one word on its forehead.
3. The mascot: a clay and moss golem with a sprout, eye lamps and a slit mouth.
4. The constraint it lives with: one approval, and nothing merges when something is flagged.
5. The unit of work: a wave, one dependency layer landed as one PR.
6. Its printed things: the spec with S1..Sn, tickets with blockers, a PR with `Closes #N` lines, the `emet status` JSON.
7. The terminal messages: "Wave 2 held: one ticket flagged. Nothing merged."
8. Its materials: the lamp amber and the moss green of the palette, which are also the merge and hold states.

## 2. Argument

1. It is a plugin for Claude Code that takes a feature from idea to merged change, on one approval. Proof: the name, tagline and a working wave.
2. You install it, describe the feature and approve once. Proof: the three exchanges, real banner, spec and tickets, status.
3. One flag holds the wave and nothing merges. Proof: the working control, blown up.
4. A run guards six things. Proof: one tall run report with six notes.
5. The name says it. Proof: the letter and a real clay golem.
6. Install it in one repo. Proof: the action.

## 3. Direction

First dealt: The product performs (seed 1107576801). The maintainer then showed a reference with a full-bleed illustrated hero, a centred headline over a calm sky and a plain nav, and asked to redo the direction. Dealt again: The place carries it (seed 341960445), a full-bleed picture is the argument. Its sheet is [direction-sheet.md](direction-sheet.md).

Redraws, each for a stated reason:

- Hero: the dealt blueprint sets two words at 13vw on the top and bottom edges. Replaced by the maintainer's reference: a centred two-line headline over the sky of the painted valley, nav over the picture, one action. It is the page's one centred moment.
- showcase, "Cards crossing a held photograph", becomes "The valley changes light": the page's live thing is one control, and the same valley is painted by day and at dusk so flagging a ticket turns day into dusk. One paper panel holds the heading, status and control.
- features, "Rows with margin photographs", becomes "Panel with margin notes": the six claims are six parts of one run report, not six photographs.
- about, "Wide photo, colour tile, facts", becomes "Founder's letter" beside a painted portrait of the golem: the content is the name story, and the facts blueprint wants altitude and local time.
- cta, "Three photographs, then a field", becomes "The closing panel": the morning-mist painting in a contained panel (32px margins, 12px radius, about 440px tall) with the heading and the action centred over its pale top. A full-bleed band was tried and judged too big and empty. The 404 uses the same panel.
- footer, "Photograph half, menu half", becomes "A single quiet line": it must carry the Anthropic notice and the AI disclosure.
- how it works gains a sticky painted crop (golden hour) beside the exchanges, so the valley is not only the hero.

The rest of the page was adapted to the hero in canvas v8: section headings at weight 400 and `clamp(32px, 3.2vw, 48px)` like the hero, radii 12px on panels and pictures and 10px on buttons and inputs, no flat saturated slabs, sections 120px apart (80px on a phone) with no dead space. Brand tokens are untouched; warmth comes from the paintings.

Settled disagreements: the headline stays Space Grotesk (the brand fixes the type; the reference uses a serif), the action uses the accent colour, and the nav has no dark action button so the first screen has one primary action.

The hero picture, [hero.webp](hero.webp), is a hand-painted style landscape generated with ChatGPT image generation from the prompt in [hero-prompt.md](hero-prompt.md), with the mascot render and a layout sketch as references. It was chosen by the maintainer among three lighting variants (golden hour, morning mist, clear late afternoon); the third was picked. Four more paintings in the same conversation carry the rest of the page; see Pictures. Earlier hand-coded SVG drawings were rejected: the first looked childish, the later ones abstract and not premium enough, and an image from Gemini was too cartoonish. The picture shows the emet golem small on a grassy rise, a valley where three streams join one river, terraced fields and a calm sky for the headline. On phones the crop is centred on the golem (`object-position: 94% 100%`). It is an AI-generated image: the footer discloses it, there is no per-picture credit ([ADR-0020](../../../docs/adr/0020-website-imagery-is-ai-generated-paintings.md)). It counts toward the picture floor as a real picture. The build ships it as WebP or AVIF at 1672 px wide, with a lower-resolution variant for phones.

The hero headline is Space Grotesk at weight 400 and `clamp(38px, 4vw, 60px)`, which keeps the brand type and reads lighter than the reference's serif.

## 4. Idea

On this page, **the erased letter of emet** becomes **the control that holds a wave**.

Competitor test: another orchestrator cannot print this sentence, because its name does not stop when a letter is erased.

The one live thing, in the showcase: flag ticket #44 and the wave holds. The painting of the valley cross-fades from day to dusk (opacity only, 600ms), the "e" of emet fades to "met", the status line reads "Wave 1 held: one ticket flagged. Nothing merged.", the switch turns from moss to lamp amber and the heading word goes from "merges" to "waits". It works from the keyboard and on a phone. Without script the day painting stays and the status line prints both outcomes as text; with reduced motion the paintings swap without the fade.

Scenes: none dealt.

## 5. Copy deck (English, source for every locale)

Rule: minimum words, because people do not read. No paragraph over two short lines; the commands and real output carry the story. Verbatim from `docs/brand/copy.md`: the tagline, the notice and the six claim titles. Every other line shortens the "Claims checked" table; no new claims.

Sample content (spec 41, tickets, PR number, branch names) is invented to show the product at density and must be confirmed. Real strings come from `docs/brand/copy.md`, `docs/brand/terminal/banner.txt` and `emet status --help`.

- Hero h1: Spec to merge, / on one approval. (two authored lines, centred). Sentence: A plugin for Claude Code. Idea to merged change, one approval.
- Primary action: Install emet. Text link: Read the docs.
- Nav over the picture: wordmark, Docs, What's new, GitHub, language.
- How it works, h2: From idea to merge. No lead. Exchange lines: Install. / Describe it. / Watch it land.
- Showcase, h2: The wave merges (flagged: The wave waits). Status line: Wave 1 reviewed. CI passed. Merged, 4 tickets closed. (flagged: Wave 1 held: one ticket flagged. Nothing merged.) No other sentence.
- Features, h2: What a run guards. Six notes: the claim title plus one short line (Spec and tickets, reviewed once. / One git worktree per worker. / A reviewer checks every wave. / A flag holds the whole wave. / Failing checks get a few fixes, then wait for you. / Linear, GitHub Issues or local files.)
- About, h2: Why it is called emet. Two lines (Hebrew for truth. A golem is clay brought to life by that word. / Erase one letter and it stops. Here, nothing merges when something is flagged.), signed AndryOre, Maintainer. A proposal for the maintainer to approve.
- Close, h2: Try it in one repo. A button, no sentence.
- Footer: Plugin for Claude Code. Not affiliated with or endorsed by Anthropic. Docs, What's new, GitHub. 2026, MIT. Paintings generated with AI from prompts by the maintainer.
- 404, h1: This page wandered off. Text: That address does not exist, or the page moved. Start from the home page or the docs.

## 6. Motion plan

Built by two motion tickets with the `emil-design-eng` skill (installed for Claude Code in `.claude/skills/`, with the animation set `animate`, `choreograph`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `remove-animations`, `animation-vocabulary`) and the taste skill's `references/motion.md`. Rules: only `transform` and `opacity`; strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, never ease-in; UI feedback 100 to 200 ms, page entrances up to 600 ms; never from `scale(0)`; no motion on keyboard-repeated actions; reduced motion shows everything and changes state at once.

Scroll layer (smooth and premium):

- Lenis smooth scroll bundled locally (lerp 0.1 to 0.12), off on touch and with reduced motion; anchors and keyboard keep working.
- Scroll-linked with `animation-timeline: view()` (IntersectionObserver fallback), linear: the hero recedes (picture sinks 8% and dims to 35% ink, copy lifts); pictures drift under 8% inside oversized frames; the how-it-works painting drifts under 6%. Frames use `overflow: clip`.
- Reveals: headings rise by masked line (12 px, 400 ms), terminals and notes stagger 60 ms within a section, once. Page load: h1, sentence and button rise 12 px, 500 ms, 80 ms stagger.
- Showcase: day and dusk cross-fade 600 ms, knob travel 250 ms, the "e" fades in 400 ms. The dusk picture loads on first interaction or when the browser is idle.
- Feedback: buttons and copy buttons `scale(0.97)` on press, 160 ms.

Motion graphics (subtle, decorative, `aria-hidden`, SVG and CSS only, under 6 KB, paused when the tab is hidden):

- The valley breathes: slow cloud and mist drifts (60 to 90 s), river shimmer, the golem's lamp eyes pulse (4 to 6 s) and blink about every nine seconds; stronger at dusk.
- Typed terminal: each exchange types its command and reveals its output line by line on entering the viewport; final state at once without script or with reduced motion.
- Wave diagram under the ticket tree: wave 1 lands #42, then #43, #44 and #45 fan out and merge as wave 2; the lines draw in with the scroll.
- Fireflies: 8 to 12 amber dots over the dusk painting, only in the held state.

## 7. Code blocks

Modelled on animated-fluent-emojis (`apps/site/src/components/CodeBlock.tsx`, `src/highlight/code-config.ts`, its ADR 0020): highlighting at build time with Expressive Code, nothing highlights in the browser (CSP). One config shared by the Home and Starlight: `github-light` and `github-dark` token colours, 12 px radius, 1 px border, surface body, 13 px JetBrains Mono, no shadow, no line numbers for shell. The install block has a 40 px header with pill tabs ("Plugin", "From a clone", choice remembered) and an icon copy button; single commands are one row with the button at the right; output blocks carry a muted language label. Copy cross-fades the icon to a check for 2 s with `aria-label` "Copied" and a polite status, and adds a failed state AFE lacks. Highlighted: bash commands and the JSON of `emet status`; the banner and the spec and ticket tree are terminal output and keep plain tonal accents.

## Pictures

Five paintings generated with ChatGPT, masters in [pictures/](pictures/), prompts in [pictures-prompts.md](pictures-prompts.md): hero (clear afternoon), dusk (held state), golem portrait, morning mist (closing band and 404) and golden hour (how it works). No archival pictures and no credit lines; the footer says the paintings are AI generated. The build serves them as AVIF and WebP with `srcset` from the same origin, the hero preloaded and the rest lazy.

The real interface fragments (banner, spec and tickets, status JSON and PR, the run report) are built in HTML with `data-ui` on their roots. They count toward the picture floor together with the paintings.

## Running the gate

The inspector needs a Chromium: `CHROME_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | head -1)`. Working files go to `.taste-skill/` (ignored).

## Build notes (home layout ticket)

Deviations from the canvas, recorded as built:

- The hero `h1` carries a visually hidden "emet. " before the two authored lines, so it names the product and what it is while the visible copy stays the two-line tagline.
- The header is absolutely positioned over the hero and is not sticky; the language switcher is a `details` menu of plain links with no shadow, a tone step separates it.
- The install block is the first exchange of how it works (`#install`); the hero and the closing button both link to it. It uses the stub `CodeBlock.astro` (two plain figures) until the Expressive Code version lands.
- The showcase is a placeholder panel that prints both status lines as text; the interactive version replaces `components/home/Showcase.astro`.
- The wave diagram has an empty `data-slot="wave-diagram"` under the ticket tree, filled by the motion ticket.
- `held.webp` is not copied into the app yet; the showcase owner brings it.
- Pictures are served by `astro:assets` as AVIF and WebP at 640, 1024 and 1672 (the portrait at 640 and 1024); the hero AVIF at 1672 is about 107 KB. The hero is preloaded with `fetchpriority="high"`, the rest are lazy.
- Sample content (spec 41, tickets 42 to 45, PR 46, `emet41w1`) is invented and must be confirmed. The `/docs/whats-new/` link path is a guess until the docs ticket fixes it.
- Gate on the production build: 0 FAIL other than the motion count owned by the motion ticket; WARN for missing footage is defended (no honest clip of a CLI tool; the paintings are the pictures).

## Build notes (showcase ticket)

- The showcase is full-bleed 16:9 (max 828px, 720px tall at 390px) with the hero painting as day and `held.webp` as dusk, both from the design folder through `astro:assets`; the dusk srcset sits in `data-srcset` and is set on first interaction or idle.
- The wordmark "emet" sits under the switch, not above the heading, so the inspector does not read it as an eyebrow; its "e" fades to 20% when held.
- The control label "Flag ticket #44" lives in `showcase/strings.ts` until the strings ticket moves it into `en.ts` and the locales.
- Without script the switch is hidden and a `noscript` line prints the held status next to the merged one.

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
- cta, "Three photographs, then a field", becomes "The closing painting": the morning-mist painting mirrors the hero with the heading and the action centred over its sky.
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

Sample content (spec 41, tickets, PR number, branch names) is invented to show the product at density and must be confirmed. Real strings come from `docs/brand/copy.md`, `docs/brand/terminal/banner.txt` and `emet status --help`.

- Hero h1: Spec to merge, / on one approval. (two authored lines, centred)
- Hero sentence: emet is a plugin for Claude Code. It takes a feature from idea to merged change, with workers in isolated worktrees.
- Primary action: Install emet. Text link: Read the docs.
- Nav over the picture: wordmark, Docs, What's new, GitHub, language.
- How it works, h2: From idea to merge. Lead: the README intro, verbatim.
- Exchanges: "First, install it." / "Then describe the feature." / "Then watch the waves land."
- Showcase, h2: The wave merges (flagged: The wave waits). Status line: Wave 1 reviewed. CI passed. Merged, 4 tickets closed. (flagged: Wave 1 held: one ticket flagged. Nothing merged.) Sentence: A wave with anything flagged is never auto-merged. Its pull request stays open for you.
- Features, h2: What a run guards. Six notes are the six feature lines of `copy.md`, verbatim.
- About, h2: Why it is called emet. A four paragraph letter signed AndryOre, Maintainer. A proposal for the maintainer to approve.
- Close, h2: Try it in one repo. Text: Two commands to install, one to start. Works in any git repo, with Linear, GitHub Issues or no tracker.
- Footer: Plugin for Claude Code. Not affiliated with or endorsed by Anthropic. Docs, What's new, GitHub. 2026, MIT. Paintings generated with AI from prompts by the maintainer.
- 404, h1: This page wandered off. Text: That address does not exist, or the page moved. Start from the home page or the docs.

## Pictures

Five paintings generated with ChatGPT, masters in [pictures/](pictures/), prompts in [pictures-prompts.md](pictures-prompts.md): hero (clear afternoon), dusk (held state), golem portrait, morning mist (closing band and 404) and golden hour (how it works). No archival pictures and no credit lines; the footer says the paintings are AI generated. The build serves them as AVIF and WebP with `srcset` from the same origin, the hero preloaded and the rest lazy.

The real interface fragments (banner, spec and tickets, status JSON and PR, the run report) are built in HTML with `data-ui` on their roots. They count toward the picture floor together with the paintings.

## Running the gate

The inspector needs a Chromium: `CHROME_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | head -1)`. Working files go to `.taste-skill/` (ignored).

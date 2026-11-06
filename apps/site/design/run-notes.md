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

Dealt: The product performs (seed 1107576801), hero Column on one line, motion Slow crossfade. Chosen over the quiet instrument and the well-kept board because the product has one control that is the product (the flag that holds a wave) and the direction puts a working fragment in the hero.

Redraws: none. Settled disagreements, in the sheet's own order:

- Accent colour on the primary action, not a near-black button (palette role).
- The right half of the first screen is closed by the wave board (columns 4 to 12) instead of left blank, so the frame rule holds.
- The founder's letter gets a heading ("Why it is called emet") and a picture on its far side.
- The about portrait is replaced by the clay golem picture.
- The signature move (slow crossfade) is replaced at build time by the hold transition: the field and the word change when the flag is set. Motion is built in the motion ticket.

## 4. Idea

On this page, **the erased letter of emet** becomes **the control that holds a wave**.

Competitor test: another orchestrator cannot print this sentence, because its name does not stop when a letter is erased.

The one live thing: flag ticket #44 and the wave holds. The "e" of emet fades to "met", #44 reads "flagged", the status line reads "Wave 1 held: one ticket flagged. Nothing merged." and the showcase field turns from moss to lamp amber while its heading word goes from "merges" to "waits". Board and showcase share one state. It works from the keyboard and on a phone, and without script the board prints both outcomes as text.

Scenes: none dealt.

## 5. Copy deck (English, source for every locale)

Sample content (spec 41, tickets, PR number, branch names) is invented to show the product at density and must be confirmed. Real strings come from `docs/brand/copy.md`, `docs/brand/terminal/banner.txt` and `emet status --help`.

- Hero h1: Spec to merge, on one approval.
- Hero sentence: emet is a plugin for Claude Code. It takes a feature from idea to merged change, with workers in isolated worktrees.
- Primary action: Install emet. Text link: Read the docs.
- Nav: Docs, GitHub, language.
- How it works, h2: From idea to merge. Lead: the README intro, verbatim.
- Exchanges: "First, install it." / "Then describe the feature." / "Then watch the waves land."
- Showcase, h2: The wave merges (flagged: The wave waits). Sentence: A wave with anything flagged is never auto-merged. Its pull request stays open for you.
- Features, h2: What a run guards. Six notes are the six feature lines of `copy.md`, verbatim.
- About, h2: Why it is called emet. A four paragraph letter signed AndryOre, Maintainer. A proposal for the maintainer to approve.
- Close, h2: Try it in one repo. Text: Two commands to install, one to start. Works in any git repo, with Linear, GitHub Issues or no tracker.
- Footer: Plugin for Claude Code. Not affiliated with or endorsed by Anthropic. Docs, What's new, GitHub. 2026, MIT. Picture credits.

## Pictures

Found with `scripts/assets.mjs`, public domain, shown in greyscale, credited in the footer. Download again with `node <skill>/scripts/assets.mjs --get <ref> --to apps/site/src/assets`.

- `commons:8873104` "Prague-golem-reproduction" by user Thander. The about picture.
- `commons:5944518` "Golem Weneger 2" by Hanns Lippmann. The close tile.
- Spare: `commons:148752533` "Poster for The Golem: As He Came Into the World" by Hans Poelzig.

The real interface fragments (banner, spec and tickets, status JSON and PR, the board, the run report) are built in HTML with `data-ui` on their roots.

## Running the gate

The inspector needs a Chromium: `CHROME_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | head -1)`. Working files go to `.taste-skill/` (ignored).

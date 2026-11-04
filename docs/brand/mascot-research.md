# Mascot research

Status: research; decisions pending. This document studies how developer-tool
mascots work and proposes name-independent directions. It recommends; the
maintainer decides in the next `/forge` interview. No mascot is picked here.

Sources were accessed on 2026-11-04. Raw notes, quotes and the checks that
could not be run are in
[`research-notes/mascots-cases.md`](research-notes/mascots-cases.md). The
directions are drawn side by side in
[`explorations/mascot-directions.html`](explorations/mascot-directions.html),
which opens from disk with no network.

## What the mascot has to do

The tool turns a spec into tickets and runs coding agents in parallel
worktrees, wave by wave, until the change merges. A mascot for it appears in
three places: a 16 px favicon or plugin icon, a one-colour terminal or badge
glyph, and larger illustrations (README, docs, release notes). The cases below
show which traits survive all three.

## Cases

| #   | Mascot                    | Product           | Licence or rule (primary source)                                                                                                                                             |
| --- | ------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Octocat                   | GitHub            | Registered trademark, all rights reserved; not for other products ([Octodex FAQ](https://octodex.github.com/faq/))                                                           |
| 2   | Go gopher                 | Go                | CC BY 4.0, credit Renee French ([go.dev/brand](https://go.dev/brand))                                                                                                        |
| 3   | Ferris                    | Rust (unofficial) | CC0 1.0 ([rustacean.net](https://rustacean.net/))                                                                                                                            |
| 4   | Tux                       | Linux             | Created by Larry Ewing, not owned by the Linux Foundation ([Linux mark](https://www.linuxfoundation.org/legal/the-linux-mark)); permissive "acknowledge me" note (see notes) |
| 5   | Moby Dock                 | Docker            | Trademark; no imitations or derivatives ([trademark guidelines](https://www.docker.com/legal/trademark-guidelines/))                                                         |
| 6   | The bun                   | Bun               | "Please don't stretch, recolour or put a hat on the bun without asking" ([press kit](https://bun.com/press-kit))                                                             |
| 7   | The dinosaur              | Deno              | MIT for the project's images; community gallery with per-piece licences ([artwork](https://deno.com/artwork))                                                                |
| 8   | Terminal mascot ("Clawd") | Claude Code       | Covered by Anthropic's marks ("brand elements") ([trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines)); name not confirmed by a primary source       |
| 9   | Slonik                    | PostgreSQL        | Registered trademark; fixed colour and black-and-white forms ([trademark policy](https://www.postgresql.org/about/policies/trademarks/))                                     |
| 10  | Huggy                     | Hugging Face      | Assets offered for download, no rules stated ([brand](https://huggingface.co/brand))                                                                                         |

### 1. Octocat

A cat head on five tentacles, born as a bought stock illustration for error
pages. Its strength is the split between character and mark: the Invertocat
pictogram "represents our mascot", while the brand page says not to use "our
illustration, mascots or Mona as a substitute for the logo"
([GitHub brand](https://brand.github.com/foundations/logo)). The mark ships
only in white, black, grey or green, so the silhouette carries it alone. The
illustrator documented fixed traits (five appendages to match the mark's
negative space, never speaks, goldenrod props) and let the Octodex grow
a long series of costumes around them
([Cameron McEfee](https://cameronmcefee.com/work/the-octocat/)). Lesson: one
locked silhouette, unlimited costumes.

### 2. Go gopher

Drawn by Renee French before Go existed and adapted for the 2009 launch
([go.dev blog](https://go.dev/blog/gopher)). The logo is a Google trademark;
the gopher is CC BY 4.0 ([go.dev/brand](https://go.dev/brand)). That split is
why the community draws it everywhere: CC0 and community gopher packs have
3,846 and 3,079 GitHub stars
([egonelbre/gophers](https://github.com/egonelbre/gophers),
[ashleymcnamara/gophers](https://github.com/ashleymcnamara/gophers), counts
from the GitHub API on 2026-11-04). It has no name and no tie to what Go does;
it works on charm and openness, not on meaning. In our reading it is a poor
16 px icon (pale body, detail in the eyes and teeth), and the brand page keeps
a separate logo for identification.

### 3. Ferris

An unofficial crab, dedicated to CC0 by its author
([rustacean.net](https://rustacean.net/)). The link to the product is a pun
chain (Rust, "ferrous", "rustacean"), and the community adopted it without any
official process. It ships in flat, cuddly, happy and gesturing variants. A
simple wide body with raised claws reads at small sizes in one colour. Lesson:
a permissive licence plus a name pun can beat an official mascot.

### 4. Tux

A penguin drawn in 1996 by Larry Ewing in GIMP; the Linux Foundation states it
does not own Tux
([Linux mark](https://www.linuxfoundation.org/legal/the-linux-mark)). The
permission note asks only for acknowledgement (quoted via a secondary source;
the original page returned 404, see notes). That freedom is what lets anyone
redraw it. The pear-shaped body and two-tone black and white
belly read in monochrome, but the detailed shaded version fails at 16 px.

### 5. Moby Dock

A whale carrying containers: the most literal product link in the set (the
whale ships the boxes). The community named it by survey, 411 votes
([Docker blog](https://www.docker.com/blog/call-me-moby-dock/)). The rules are
the strictest: no imitations, no derivatives, no use as an avatar
([trademark guidelines](https://www.docker.com/legal/trademark-guidelines/)),
logos "at least 24px" and "Don't decolorize"
([media resources](https://www.docker.com/company/newsroom/media-resources/)).
Lesson: a metaphor that explains the product is memorable, but a 24 px floor
and a colour-only rule mean no true favicon or mono glyph.

### 6. Bun

The logo is the mascot: the SVG has `Face`, `Eyes`, `Mouth` and `Tongue`
layers on the bun shape ([logo.svg](https://bun.com/logo.svg)), and the press
kit adds a separate icon "for small sizes" ([press kit](https://bun.com/press-kit)).
The tie is to the name, not the function. Lesson: a face on the product-name
object needs a second, simpler icon for small sizes.

### 7. Deno

A small dinosaur logo, extended by a community gallery of about 29 credited
pieces, mostly MIT ([artwork](https://deno.com/artwork)); the website repo
states its images are MIT
([deno_website2](https://github.com/denoland/deno_website2)). Lesson: a
gallery with per-piece credit and licence is a cheap way to invite community
art while keeping provenance clear.

### 8. Claude Code terminal mascot ("Clawd")

A block-character creature printed in the terminal when Claude Code starts
([issue 24926](https://github.com/anthropics/claude-code/issues/24926)). It
proves a mascot can live in three lines of Unicode blocks. No Anthropic page
found on 2026-11-04 names it or explains it; "Clawd" is community usage.
Anthropic's marks cover "brand elements, and anything we use to identify our
goods and services"
([trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines)).
The closest precedent: a third-party lobster mascot called Clawd in
"Clawdbot" was renamed after Anthropic sent "a polite email asking for a name
change" over trademark concerns
([OpenClaw lore](https://docs.openclaw.ai/start/lore)). For this project, which
runs inside Claude Code and must drop "Claude" from its name, this is the
main proximity risk.

### 9. Slonik

An elephant chosen because "elephants can remember"
([PostgreSQL wiki](https://wiki.postgresql.org/wiki/Logo)). It ships in
single-colour black, blue and white and as a favicon, and the policy fixes the
allowed forms ([trademark policy](https://www.postgresql.org/about/policies/trademarks/)).
Lesson: a function metaphor (memory, durability) plus a profile silhouette
(trunk, ear) reads at every size.

### 10. Huggy

An emoji face with hands. The brand page offers a monochrome logo, a "Pirate"
variant and a Huggy set (coding, vibing, chef) with no rules stated
([brand](https://huggingface.co/brand)). Lesson: borrowing a universal shape
(the hugging emoji) gives instant legibility, at the cost of owning little.

## Findings by topic

- **16 px legibility.** Marks that survive have one closed outer shape and at
  most one or two internal holes (Invertocat, Slonik, the Bun icon). Detailed
  characters (gopher, shaded Tux, Moby with containers) need a separate small
  mark. Plan the 16 px glyph first and grow the illustration from it.
- **Monochrome.** GitHub and PostgreSQL ship one-colour forms; Docker forbids
  decolourising. A mascot for terminal output, badges and plugin listings must
  work in `currentColor` alone, with features cut out as negative space.
- **Link to function and name.** Three routes appear: function metaphor (Moby
  ships containers, Slonik remembers), name pun (Ferris, Bun, Deno) and no link
  (gopher). The directions below are name-independent on purpose, so they use
  the function route; a pun can be layered on once a name exists.
- **Expression and pose set.** Octocat (costumes, never speaks) and Ferris
  (happy, gesturing) show that a small fixed set covers most needs. For this
  tool the set maps to run states: idle, working, waiting on review, blocked,
  merged.
- **Licence and usage rules.** The open mascots (gopher CC BY, Ferris CC0, Tux,
  Deno MIT) got community art; the closed ones (Octocat, Moby) are protected
  but cannot be remixed. A practical split, as Go does: trademark the logo,
  license the character permissively with attribution.
- **Community adoption.** Adoption follows permission plus a simple base form:
  gopher packs, Ferris variants and Deno's gallery all build on a shape that is
  easy to redraw.

## Anti-patterns and risks

- **Looking childish.** Big eyes, blush and tongues (the Bun logo) suit a
  friendly runtime; a tool that merges code unattended needs to signal care.
  Keep faces minimal: two dots, no mouth, or a mouth only in large art.
- **Colliding with other mascots.** Avoid crabs and lobsters (Ferris, the
  Claude Code mascot, OpenClaw), octopuses (Octocat, tempting as "many arms,
  many agents"), whales and containers (Docker), gophers, elephants and
  dinosaurs.
- **Closeness to Anthropic or Claude Code.** No orange or clay palette, no
  spark or asterisk shapes, no block-pixel creature, nothing claw-shaped, no
  "Claude" pun. The OpenClaw rename shows the risk is real, not theoretical.
- **AI clichés.** Robots, sparkles, brains and magic wands say "AI tool" and
  nothing about orchestration.
- **Mascot as logo.** A character with a face is a poor favicon; keep a
  simplified mark (as GitHub's Invertocat does).
- **Detail that collapses.** Thin legs, whiskers and gradients disappear at
  16 px.
- **Derivative art of protected mascots.** Docker and GitHub forbid it; do not
  draw a "forge-flavoured" Octocat or whale for launch posts.

## Checklist

Use it to score any direction or concept from run 1b.

- [ ] Reads as itself at 16 px in one colour, with no more than two holes.
- [ ] Works in `currentColor` on light and dark without a second colour.
- [ ] Silhouette is distinct from the 10 cases above, especially crabs,
      lobsters, octopuses and block-pixel creatures.
- [ ] No Claude orange or clay, no spark, no claw, no Anthropic reference.
- [ ] Ties to the function (spec to merge, parallel workers, waves) without
      needing the product name.
- [ ] Has a simplified mark separate from the full character.
- [ ] Has five poses mapped to run states: idle, working, review, blocked,
      merged.
- [ ] Face is minimal; reads as careful, not childish.
- [ ] Licence plan written down: logo reserved, character CC BY 4.0 or similar.
- [ ] Easy to redraw by hand in under a minute, so the community can.
- [ ] Not a robot, sparkle, brain or wand.

## Directions

Four name-independent directions. Each is drawn in the sheet with a rough
silhouette, a 16 px preview and a mono preview. These are options, not
decisions.

### D1. Tiered stack

- **Concept.** An abstract creature made of three rounded slabs, narrow on top,
  wide at the base, with two dot eyes in the top slab. Each slab is a wave: a
  dependency layer that lands before the next.
- **Poses.** Idle (stacked), working (top slab lifted), review (one eye
  closed), blocked (slabs offset), merged (slabs fused into one block).
- **Pros.** Most ownable and most legible at 16 px; no animal collisions;
  doubles as the simplified mark.
- **Risks.** Abstract creatures need copy to explain them. Could read as a cake
  or a burger. A boxy creature with eyes sits near the Claude Code block
  mascot: keep corners rounded, no legs, no pixel grid, no orange.

### D2. Worker ant

- **Concept.** An ant: a colony of workers moving tickets in parallel, with a
  coordinator, is the closest real-world picture of the run model. Large art
  shows it carrying a ticket card.
- **Poses.** Idle, carrying a card, two ants handing off (review), stopped at a
  gap (blocked), placing the card on a stack (merged).
- **Pros.** Clear function metaphor; head, thorax and abdomen give three blobs
  that read at 16 px.
- **Risks.** Insects read as "bugs" in software. Legs and antennae vanish at
  16 px. [Apache Ant](https://ant.apache.org/) owns "Ant" in build tools
  (whether its logo shows an ant was not checked).

### D3. Builder beaver

- **Concept.** A beaver that builds a dam log by log: small, careful pieces
  that add up to one structure, as tickets add up to one merged change.
- **Poses.** Idle, carrying a log, inspecting a log (review), log stuck
  (blocked), dam complete (merged).
- **Pros.** Strong side silhouette (flat tail, teeth); "builder" and "careful"
  fit the tool.
- **Risks.** Cute animals drift childish. A beaver is the mascot of
  BuildStream, another build tool
  ([BuildStream branding](https://wiki.gnome.org/Projects/BuildStream/Branding),
  page marked retired). Teeth are lost at 16 px.

### D4. Herding dog

- **Concept.** A border collie head with a white blaze: the coordinator that
  keeps many workers moving in one direction and gathers them at each wave.
- **Poses.** Idle (sitting), working (crouched herding stance), review (head
  tilt), blocked (lying down, ears flat), merged (tail up).
- **Pros.** Warm and trustworthy without being childish; front-facing head is
  symmetric and reads at 16 px; the blaze gives a single strong cut-out.
- **Risks.** Dogs are common in branding (no trademark search was run).
  "Herding cats" jokes write themselves. The front face carries less of the
  parallel-work idea than D1 or D2.

## Recommendation

Shortlist D1 and D4 for run 1b. D1 scores best on the checklist (16 px, mono,
collisions, function) and can serve as both mark and mascot; D4 is the
strongest character if the brand wants warmth. D2 and D3 have the clearest
stories but carry collision and legibility risks. The maintainer makes the
pick.

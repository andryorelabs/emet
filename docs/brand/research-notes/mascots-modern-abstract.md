# Mascot research: modern abstract characters, 2023 to 2026

Raw notes for the `emet` golem mascot. Goal: learn how current developer and AI
tools make an abstract shape read as a character with minimal means. Nothing
here is a design; no case is to be copied. All pages accessed 2026-11-04.

Context: a first round of four golem mascots was rejected as "not looking like a
golem" and "not distinctive". The maintainer pointed at Astro's Houston,
ChatGPT's voice dots, Grok's bot "etc".

## Source quality, read this first

Brand pages of developer tools rarely explain construction, states or minimum
sizes. Where a page was silent, this note says so instead of guessing. Three
kinds of evidence are marked per case:

- **Documented**: stated on a primary page.
- **Inspected**: read by me from an official asset (SVG or PNG) in the
  vendor's repository or site.
- **Not verified**: widely seen in the product, but no primary source found in
  this pass. Treat as a hypothesis and re-check before relying on it.

Known gaps: Houston has no design write-up on astro.build; the Grok bot and the
ChatGPT orb states are not documented by their makers; Warp, Raycast and
Perplexity gave no usable brand text.

## Cases

### 1. Houston (Astro)

- Source: [astro.build/press](https://astro.build/press/), accessed 2026-11-04.
- Documented: Houston is Astro's mascot, used in the community to create a "fun,
  welcoming atmosphere"; the press page forbids using it in your own materials.
  The Astro repo has no design notes either
  ([withastro/houston.astro.build](https://github.com/withastro/houston.astro.build),
  accessed 2026-11-04; that repo is about a support bot, not the character).
- Not verified: shapes, face, states, 16 px behaviour.
- Lesson: the maintainer likes it, but there is no written rationale to learn
  from. Treat Houston as a taste signal (friendly, simple face, reusable in many
  poses) and do not infer its construction from this note.

### 2. ChatGPT voice orb and dots

- Source: OpenAI help article
  [Voice Mode FAQ, article 8400625](https://help.openai.com/articles/8400625),
  accessed 2026-11-04, via search result excerpts (the page itself returned 403
  to direct fetch).
- Documented: voice can run inline in the chat or in "Separate Mode", the full
  screen "blue orb" view.
- Not verified: listening, speaking and thinking states. Third-party coverage
  says the circle pulses while the model listens and replies; a leak-based
  report says its shape and colour change with who is speaking. Neither is an
  official spec.
- Shapes: one circle (the orb), or a small set of dots.
- Character with minimal means: no face at all. Life comes only from motion
  that follows an audio signal, so the shape "breathes" with the speaker.
- States: idle is a calm form, active deforms in time with sound.
- 16 px: a single flat circle survives any size; the motion does not, so the
  static frame must still look like the product.
- Lesson: a shape with no features becomes a being when its motion is tied to a
  real signal. For `emet` the signal is real: number of agents running.

### 3. Grok

- Source: Layer3 Labs
  [Grok companions explained](https://www.layer3labs.io/guides/grok-companions-explained)
  and [macmyths](https://macmyths.com/grok-chatbots-new-ai-companions/), both
  secondary, accessed 2026-11-04.
- Documented (secondary): the named companions (Ani, Rudi, Valentine) are
  animated 3D characters with a face, a voice and a fixed personality. Their
  status is disputed: one source reports they were wound down in July 2026,
  another says public materials do not document them.
- Not verified: the "bot" the maintainer means, and the logo design. No xAI
  brand page was found.
- Lesson: personality shipped as a full character (name, voice, trait) is far
  heavier than an abstract mark and is also fragile when the product changes
  course. Keep `emet` closer to a symbol with one trait than to a persona.

### 4. Gemini spark

- Source: [Porto Rocha, Gemini case study](https://www.portorocha.com/gemini),
  accessed 2026-11-04.
- Documented: the identity centres on the "Spark", reclaimed "as an invitation
  to explore"; the team "activates the Spark through immersive motion that
  initiates exploration, reveals content, and invokes the Gemini magic". The
  page gives no construction, state list or size rules.
- Shapes (not verified here): a four-pointed star with concave sides.
- Character: it has no face. It is an event: the mark animates at the moment
  something starts.
- States: motion on start and while a query is processed (reported by Android
  Authority's APK teardown, secondary, via search excerpt, accessed
  2026-11-04).
- 16 px: the star stays legible as a silhouette; the gradient is decoration.
- Lesson: a symbol can behave as a character if it has one signature motion that
  marks a moment (start). It needs a verb, not a face.

### 5. Ghostty

- Source: official icon,
  [icon_512.png](https://raw.githubusercontent.com/ghostty-org/ghostty/main/images/icons/icon_512.png),
  and the [README](https://github.com/ghostty-org/ghostty/blob/main/README.md),
  accessed 2026-11-04. Neither describes the design in words.
- Inspected: a rounded-dome silhouette with a scalloped bottom, glowing on a
  dark display tile. Its two "eyes" are not dots: they are a prompt chevron and
  a cursor dash (`>_` style), so the face is made of the product's own glyphs.
- Character with minimal means: two marks and a silhouette.
- States: none shipped in the icon.
- 16 px: the face glyphs are strokes that merge at small sizes; the silhouette
  has to carry the read.
- Lesson: put the domain glyph inside the face. The eyes can say what the
  product is. (Ghost silhouettes are off the table for `emet`; the lesson is
  about the face only.)

### 6. Bun

- Source: [bun.com/press-kit](https://bun.com/press-kit) and the
  [logo SVG](https://bun.com/logo.svg), accessed 2026-11-04.
- Documented: assets include `icon.svg` for small sizes; palette cream #FBF0DF,
  pink #F472B6, ink #14151A, blush #FEBBD0; "don't stretch, recolour or put a
  hat on the bun without asking".
- Inspected: a rounded dumpling body in one flat cream, plus three named layers
  (shadow, bottom shadow, light shine) and a small face with blush cheeks.
- Character with minimal means: one soft mass, two eyes, a smile and a blush.
  The warm palette does half the work.
- States: none in the logo itself.
- 16 px: ships a separate simplified small icon rather than shrinking the
  detailed one.
- Lesson: design the small version as its own asset, and give the body a
  tactile material feel with flat shading, not texture. A clay golem can borrow
  the method (material by layers), not the dumpling.

### 7. Deno

- Source: [deno.land/logo.svg](https://deno.land/logo.svg), accessed 2026-11-04.
  Existing notes in `mascots-cases.md` cover its history.
- Inspected: the SVG is one large round path with a single white fill for the
  detail. Not verified: the exact split between disc and animal; confirm by
  rendering the file before relying on it.
- Character (not verified): a bold round field with one tiny feature, the eye.
- Lesson: a mascot can live inside a circle and still be a character, and
  negative space can draw the animal.

### 8. Mistral

- Source: [mistral.ai/brand](https://mistral.ai/brand), accessed 2026-11-04.
- Documented: the emblem is an "abstract pixel cat" symbolising the company's
  role in early generative AI. Lockup and icon come in gradient, black and
  white; "prefer the gradient version", use monochrome on busy backgrounds; no
  minimum size is stated.
- Not verified (secondary only): the letter M built from rectangular blocks
  that hides a cat face.
- Shapes: a grid of square cells; the character is the pattern of filled and
  empty cells.
- Lesson: a character built from identical blocks scales by cell count, so
  fewer cells give the 16 px version. It also animates by cells turning on and
  off, which maps neatly to on/off.

### 9. Charm (Bubble Tea, Lip Gloss, Glow and others)

- Source: [charm.land](https://charm.land), accessed 2026-11-04.
- Documented: each library has a mascot labelled with one trait: Bubble Tea
  "Taro", Huh "What?", Lip Gloss "glossy", Wish "Magical", Glamour
  "fashionable", Log "Hot" plus a "this is fine" attitude, Harmonica "smooth".
  Gum, VHS, Pop and Skate are branded objects, not characters.
- Character with minimal means: one word of personality per tool, then art that
  expresses that single word. Objects can also be mascots.
- Lesson: choose one trait before choosing a shape. For `emet` the trait is
  closer to "obedient, awake only while a word holds" than to "cute".

### 10. Cursor

- Source: [cursor.com/brand](https://cursor.com/brand), accessed 2026-11-04.
- Documented: a cube mark, offered in 2D (default), 2.5D (for larger uses) and
  3D app icons, plus circular and square avatars. No construction text.
- Lesson: a geometric object, not an animal, can be the brand; the same shape
  gets a flat form for small sizes and a dimensional form for large ones.
  A block-built golem has the same opening.

### 11. Counter-cases: Zed, Vercel, Linear, OpenCode

- Sources: [zed.dev/brand](https://zed.dev/brand),
  [vercel.com/geist/brands](https://vercel.com/geist/brands),
  [linear.app/brand](https://linear.app/brand),
  [opencode.ai](https://opencode.ai), all accessed 2026-11-04.
- Documented: Zed ships one brand blue (#1348DC), white and black only; Vercel
  says to use the symbol alone in constrained spaces and keep a safety area
  equal to the symbol height; Linear separates wordmark, logomark and a
  "chip" icon; OpenCode's wordmark uses blocky, pixel-like letterforms in
  grey only, with no mascot.
- These are marks, not characters. They show the floor: one colour, one shape,
  a separate compact form for tight spaces.
- Lesson: a mascot is optional, but the compact symbol is not. If the golem
  cannot reduce to a one-colour 16 px symbol, the mark fails where it matters
  most (terminal tab, favicon, npm listing).

## Synthesis

### 1. Principles that make an abstract mascot read as a character

1. **One expressive feature, not many.** Eyes, a glyph or a motion carries all
   the personality; everything else stays quiet (Bun, Deno, Ghostty).
2. **Silhouette before detail.** It must read as a flat single-colour shape,
   because the small icon is the most-used form (Zed, Vercel, Bun's `icon.svg`).
3. **Put the product's own symbol in the face.** Ghostty's eyes are a prompt;
   the face becomes both character and logo.
4. **Motion tied to a real signal reads as life.** The orb breathes with audio;
   the Spark fires at start. Motion needs a cause, not decoration.
5. **A state is one variable changing.** Eyes open to closed, one part moves,
   one cell turns off. If a state needs a redraw, it will not survive 16 px.
6. **One trait per mascot.** Charm names one word per character before
   drawing. A trait filters every later shape decision.
7. **Material from flat layers, not texture.** Two or three tones suggest
   volume and substance (Bun, Cursor 2.5D) and still print in one colour.
8. **Ship a purpose-built small form.** Do not shrink the hero; draw the 16 px
   symbol on its own grid and ask whether it still says "character".

### 2. How a golem can use them

What makes a golem recognisable in minimal shapes:

- **Heavy, blocky mass.** Straight edges, a wide base, no waist. A rounded
  blob reads as a dumpling or ghost; a chunky block with softened corners
  reads as clay.
- **Hand-made imperfection.** Slightly uneven edges, one asymmetric chip or
  thumbprint. This is the clay signal and also the distinctive signal.
- **Limbs are optional.** A golem can be a head and shoulders, or a face, or
  floating parts. Stubby arms are a risk because they push toward robots.
- **The forehead mark.** The Hebrew word on the forehead is the one feature no
  other mascot has. It is the golem's "domain glyph" (principle 3).
- **The erased letter.** Emet (truth) loses its first letter and becomes met
  (dead). In shapes: the mark loses one stroke or one block. This is the
  error or off state, and it is a one-variable change (principle 5).
- **Awake versus asleep.** Asleep: eyes are flat slits or absent, mark is
  inert. Awake: eyes open or glow, mark intact. Working: slow breath or
  pulse. Done: settle and hold still. Error: the mark is damaged and one part
  drifts or cracks.
- **Three letters give a natural count.** Aleph, mem, tav are three glyphs,
  which supports a three-part construction (blocks or stones) with the first
  one removable.

### 3. Silhouette ideas

None uses Houston, Clawd, octopus, ghost or hand silhouettes. All are directions
to explore, not designs.

**A. Slab face (face-only)**

A rectangular clay slab with softened corners. Two horizontal slit eyes, the
forehead mark above them. No body.

```
   .----------------.
   |  [ mark ]      |
   |                |
   |   ==      ==   |
   |                |
   '----------------'
```

- Asleep: eyes are one closed line each. Awake: slits open to short bars.
- Erased: mark drawn with one glyph missing and a smooth patch where it was.
- 16 px: a rounded square with two bars and a dot, three marks total.

**B. Three stones (floating parts)**

Three separate clay chunks hovering in a row, each a different rough block. They
read left to right as the three letters of emet. The middle one carries a notch
that reads as an eye.

```
   [##]   [#o#]   [###]
    e      m        t
```

- Working: stones hover with a slow offset; one stone per running agent
  can pulse. Done: they align on one baseline and settle.
- Off: the leftmost stone is gone (gap), leaving "met".
- 16 px: three squares with one dot; the gap is the state.

**C. Toggle golem (on/off)**

A pill-shaped track, with a heavy square clay lump as the knob. The knob has the
eyes and mark. Lump right means on, left means off.

```
   OFF   (  [x_x]        )        ON   (        [o o] )
```

- Off: the knob rests left, eyes shut, mark scratched.
- On: the knob slides right and the eyes open, mark whole.
- 16 px: a pill with a square at one end, readable as a switch first and
  character second. Risk: reads as a UI control; the eyes must do the work.

**D. Sunken-head bust**

A stepped silhouette: wide shoulders as a trapezoid, a head sunk into them with
no neck, and a flat top. No arms, no legs.

```
        ___________
       |  e     e  |
    ___|           |___
   |                   |
   |___________________|
```

- Distinct from the others by having a weight-forward, immovable profile.
- Awake: the head lifts out of the shoulders by one step. Asleep: it sinks flush.
- 16 px: a "T" or "stair" shape with two dots.

**E. Mound that rises**

A rough heap of clay at rest. When started, a block head pushes up out of the
top. The silhouette changes from a low mound to a mound with a head, and back.

```
   asleep:   .-"""-.        awake:     [ o o ]
            /       \                 /       \
           '---------'               '---------'
```

- This expresses on/off as a whole-body change, not as a face change.
- 16 px: a wide dome versus a dome with a small square on top.
- Risk: a plain mound alone could read as something else, so the head must
  always be the main read when awake.

**F. Cut-out figure (negative space)**

A solid clay block with the golem drawn as a figure-shaped hole in it, like a
doorway or a stencil, with only the eye pair and mark filled in.

```
   ##########
   ###  __  ###
   ## ( o o ) ##
   ##  |___|  ##
   ##########
```

- Echoes Deno's negative-space method without copying it. A mould is a natural
  clay image: the golem is the shape that was pressed out.
- Asleep: the hole is empty. Awake: the eye pair appears inside it.
- 16 px: a block with a notch and two dots; negative space survives scaling.

### Top picks

1. **B, three stones.** Only one that comes from the emet/met story, scales by
   cell count, and expresses working, done and off by simple movement.
2. **C, toggle golem.** The clearest on/off, and it matches a CLI that starts
   and stops agents.
3. **A, slab face.** The simplest, the most distinctive forehead mark, and the
   safest at 16 px.

### What to ask the maintainer next

- Is the golem a character (face, state) or a symbol that behaves (parts, motion)?
- Should the Hebrew letters appear literally or only as three marks?
- Is a face required at 16 px, or may the compact form drop it?

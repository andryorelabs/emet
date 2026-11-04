# Naming candidates: the mandatory rename

Run 1 research, 2026-11-04. Status: options and a recommendation. Nothing here
is a decision: the maintainer makes the final pick, and no name is reserved,
published or renamed until then.

The project ships today as the repository `claude-forge`, the binary `forge`,
the plugin `forge` and the command `/forge:run`. All of that is replaced. This
document narrows 57 candidates to 8 finalists, scores them, looks at the top 4
in depth and closes with a recommendation.

Raw logs:

- [research-notes/naming-checks.md](research-notes/naming-checks.md): every
  registry command and its result.
- [research-notes/naming-category-search.md](research-notes/naming-category-search.md):
  web searches for tools in the same category, with primary sources.

## Constraints

1. **No "Claude" or "Anthropic" in the name.** Claude Code's own validator
   refuses a plugin name that starts with `claude-` or `anthropic-` and warns
   on `claude` as a whole word anywhere in it
   ([plugin manifest reference](https://code.claude.com/docs/en/plugins-reference),
   section "name", accessed 2026-11-04). The current repository name,
   `claude-forge`, would draw that error as a plugin name.
2. **One word works in three places.** The same string is the binary on
   `PATH`, the plugin name and the command namespace, so `/<name>:run` must
   read well. Plugin names must be kebab-case with no spaces, `@` or `:` (same
   source). Every candidate below is a single lowercase word, which meets that.
3. **Short and easy to type.** It is typed many times a day as a binary. Under
   about 8 letters, no awkward clusters, one obvious spelling.
4. **No collision where it hurts.** In order of weight: another binary of the
   same name on a developer's machine (Debian/Ubuntu packages, Homebrew), a
   Claude Code plugin of the same name, another agent orchestrator using the
   word, then the GitHub slug `AndryOre/<name>` and the npm name.
5. **Domains are out of scope.** The site will live at `<name>.andryore.dev`,
   so no domain was checked.
6. **Safe to publish.** No private repository or customer names, and no
   imitation of Anthropic's or Claude's brand.

### Why `forge` has to go anyway

The current binary name collides on its own, which is worth knowing even
though the rename is mandatory for constraint 1:

- Foundry, the Ethereum toolkit, installs a binary named `forge`
  ([foundry-rs/foundry](https://github.com/foundry-rs/foundry), 10,752 stars,
  accessed 2026-11-04).
- Homebrew has a formula `forge` (ArrayFire's visualization library), and
  Debian and Ubuntu each ship a package that installs `/usr/bin/forge`
  (`naming-checks.md`, "Who owns the hits").
- Atlassian Forge's skills plugin, `forge-skills`, sits in Anthropic's official
  plugin marketplace and teaches the `forge create` command.
- `electron/forge` (7,169 stars) and 174,908 repositories with "forge" in the
  name make the word unsearchable.

## Method

1. Brainstorm candidates from the product's own metaphors: a spec is cast into
   tickets, tickets run as waves of parallel workers in their own worktrees,
   and their branches are joined back into one landing. The glossary's
   **Wave** and **Worktree** terms gave two of the families.
2. Run the same registry checks on every name (commands in
   `naming-checks.md`). 57 candidates plus `forge` as a baseline.
3. Search the web for other tools that run coding agents under the same word,
   and confirm each hit at its primary source (`naming-category-search.md`).
4. Drop names with a hard collision. Pick 8 finalists from the survivors,
   spreading them across families.
5. Score the 8 on the seven axes of the template's `naming.md`, 0 to 10 each,
   for a total out of 70.
6. Go deep on the top 4.

## Long list by family

57 candidates in 11 families. The "Why it fits" column says what part of the
product the word points at.

### Forge and metalwork (continuity with the current name)

| Name     | Why it fits                                                      |
| -------- | ---------------------------------------------------------------- |
| anvil    | Where the work is shaped                                         |
| smelt    | Raw ore (a request) turned into usable metal (code)              |
| temper   | Hardening the result: tests and review make it hold              |
| ingot    | A cast bar, ready to be worked: the spec in a shippable form     |
| bellows  | Feeds the fire: the coordinator keeping the workers going        |
| kiln     | A controlled oven that turns soft material into a finished piece |
| foundry  | The whole workshop                                               |
| crucible | The vessel where everything is melted and tested together        |

### Tide and waves (the glossary's Wave)

| Name     | Why it fits                                           |
| -------- | ----------------------------------------------------- |
| tide     | Work comes in on a schedule, layer by layer           |
| swell    | A swell is a train of waves from one source: one spec |
| surge    | A burst of parallel work                              |
| crest    | The top of a wave: the moment a wave lands            |
| undertow | The current underneath the visible work               |
| riptide  | A strong, fast current                                |

### Weaving and thread (parallel threads made into one piece)

| Name    | Why it fits                                                    |
| ------- | -------------------------------------------------------------- |
| loom    | The frame that holds many threads at once                      |
| weft    | The thread that crosses and binds the warp                     |
| warp    | The parallel threads held under tension                        |
| shuttle | Carries the thread back and forth across the work              |
| heddle  | The part of a loom that separates threads so the weft can pass |
| braid   | Separate strands joined into one                               |
| unspool | A spec unwound into tickets                                    |

### Fleets (many vessels, one course)

| Name     | Why it fits                              |
| -------- | ---------------------------------------- |
| convoy   | Many vessels moving together, protected  |
| flotilla | A small fleet                            |
| fleet    | Many workers under one command           |
| armada   | A large fleet                            |
| regatta  | Many boats on the water at the same time |

### Colonies (many workers, one goal)

| Name   | Why it fits               |
| ------ | ------------------------- |
| hive   | A colony of workers       |
| swarm  | Many agents moving as one |
| colony | Workers with roles        |
| apiary | A managed set of hives    |

### Building (the structure that holds the work)

| Name     | Why it fits                                |
| -------- | ------------------------------------------ |
| scaffold | Temporary structure around a build         |
| truss    | A frame of small parts carrying one load   |
| mason    | A builder who sets each stone in its place |
| keystone | The piece that locks an arch together      |
| rivet    | Joins plates into one structure            |

### Ensemble (one conductor, many players)

| Name    | Why it fits                                    |
| ------- | ---------------------------------------------- |
| baton   | The conductor's stick; also the relay hand-off |
| tempo   | Keeps everyone on the same beat                |
| cadence | The rhythm of waves                            |
| quorum  | Enough agreement to proceed: the gates         |
| maestro | The conductor                                  |

### Trees (worktrees and branches)

| Name    | Why it fits                   |
| ------- | ----------------------------- |
| grove   | A group of trees: worktrees   |
| orchard | Trees planted in rows, tended |
| arbor   | A tree, or a frame for growth |
| canopy  | What all the trees make up    |
| copse   | A small group of trees        |

### Flow and water control (gates and channels)

| Name   | Why it fits                                                       |
| ------ | ----------------------------------------------------------------- |
| relay  | Work handed from one runner to the next                           |
| sluice | A gate that lets water through when it opens                      |
| weir   | A low dam that holds water back and lets it over in an even sheet |
| flume  | A channel that carries water to where the work is                 |
| fanout | One input split into parallel work                                |

### Makers (the craftsperson)

| Name       | Why it fits                                          |
| ---------- | ---------------------------------------------------- |
| wright     | A maker, as in shipwright or playwright              |
| smithy     | A smith's workshop                                   |
| wrought    | Worked into shape                                    |
| joiner     | A woodworker who joins parts; it also joins branches |
| shipwright | Builds ships, and ships code                         |

### Coined compounds

| Name      | Why it fits                                                         |
| --------- | ------------------------------------------------------------------- |
| wavesmith | A smith who works in waves: the glossary's Wave plus the forge past |
| specsmith | A smith who works from a spec                                       |

## Availability filter

One row per candidate. Results are summarised from `naming-checks.md` and
`naming-category-search.md`; open those for the command, the raw output and
the source of each collision.

Legend: **slug** is `AndryOre/<name>` on GitHub (free for all 57).
**npm** is the unscoped package. **bin** is an executable of that name in
Debian stable or Ubuntu noble, or a Homebrew formula or cask. **plugin** is a
Claude Code plugin named exactly `<name>`. **category** is another tool that
runs or coordinates coding agents under the word. A dash means none found.

| Name       | npm   | bin                                      | plugin                          | category                                     | Verdict                                            |
| ---------- | ----- | ---------------------------------------- | ------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| anvil      | taken | Foundry's `anvil` binary                 | not checked                     | -                                            | drop: binary collision                             |
| smelt      | taken | -                                        | not checked                     | `leonardcser/smelt`, a terminal coding agent | drop: category                                     |
| temper     | taken | -                                        | several, incl. `galando/temper` | Claude Code SDLC plugin                      | drop: plugin and category                          |
| ingot      | taken | -                                        | 1, personal, 0 stars            | -                                            | **finalist**                                       |
| bellows    | taken | -                                        | 1, in a 1-star marketplace      | -                                            | **finalist**                                       |
| kiln       | taken | -                                        | not checked                     | Kiln AI, 5,254 stars                         | drop: category                                     |
| foundry    | taken | Homebrew formula, Debian package         | not checked                     | -                                            | drop: binary and Foundry                           |
| crucible   | taken | -                                        | not checked                     | -                                            | drop: GaloisInc/crucible, long to type             |
| tide       | taken | -                                        | not checked                     | -                                            | drop: http-rs/tide, 5,092 stars                    |
| swell      | taken | -                                        | no exact name                   | -                                            | **finalist**                                       |
| surge      | taken | Homebrew cask                            | not checked                     | -                                            | drop: binary, npm `surge` active                   |
| crest      | taken | Homebrew cask                            | not checked                     | -                                            | drop: binary                                       |
| undertow   | taken | -                                        | not checked                     | -                                            | drop: undertow-io/undertow, 3,761 stars            |
| riptide    | taken | -                                        | not checked                     | -                                            | drop: RiptideNetworking, 1,296 stars               |
| loom       | taken | Homebrew cask (Loom recorder)            | not checked                     | -                                            | drop: binary and brand                             |
| weft       | taken | -                                        | not checked                     | WeaveMindAI/weft, AI orchestration language  | drop: category                                     |
| warp       | taken | Debian, Ubuntu, Homebrew cask            | not checked                     | -                                            | drop: binary, Warp terminal                        |
| shuttle    | taken | Debian (`linuxcnc-uspace`)               | not checked                     | -                                            | drop: binary, shuttle-hq, 6,905 stars              |
| heddle     | taken | -                                        | not checked                     | `roackb2/heddle`, coding agent runtime       | drop: category                                     |
| braid      | taken | Homebrew formula (Git vendor tool)       | not checked                     | -                                            | drop: binary, a Git tool                           |
| unspool    | taken | -                                        | -                               | -                                            | **finalist**                                       |
| convoy     | taken | -                                        | not checked                     | -                                            | drop: frain-dev/convoy, 2,888 stars                |
| flotilla   | taken | -                                        | not checked                     | `create-flotilla`, unverified                | drop: category, unverified                         |
| fleet      | taken | Homebrew cask (JetBrains Fleet)          | not checked                     | -                                            | drop: binary                                       |
| armada     | taken | -                                        | not checked                     | jchristn/Armada, rafmacalaba/armada          | drop: category                                     |
| regatta    | free  | -                                        | not checked                     | Someblueman/regatta                          | drop: category                                     |
| hive       | taken | Homebrew formula (Apache Hive)           | not checked                     | aden-hive/hive, multi-agent harness          | drop: binary and category                          |
| swarm      | taken | Debian, Ubuntu                           | not checked                     | openai/swarm                                 | drop: binary and category                          |
| colony     | taken | -                                        | not checked                     | opencue/colony, cc-colony                    | drop: category                                     |
| apiary     | taken | -                                        | not checked                     | Apiary, "control plane for AI coding agents" | drop: category                                     |
| scaffold   | taken | Debian, Ubuntu                           | not checked                     | -                                            | drop: binary, generic verb                         |
| truss      | taken | -                                        | not checked                     | -                                            | drop: basetenlabs/truss (ML serving)               |
| mason      | taken | Debian and Ubuntu package                | not checked                     | -                                            | drop: Debian and Ubuntu package                    |
| keystone   | taken | Homebrew formula, Debian package         | not checked                     | -                                            | drop: binary, KeystoneJS                           |
| rivet      | taken | Homebrew cask (AI programming tool)      | not checked                     | -                                            | drop: binary, rivet-dev                            |
| baton      | taken | -                                        | not checked                     | mraza007/baton, coderhyme/baton              | drop: category                                     |
| tempo      | taken | -                                        | not checked                     | -                                            | drop: Grafana Tempo                                |
| cadence    | taken | Homebrew formula                         | not checked                     | -                                            | drop: binary, Cadence workflow engine              |
| quorum     | taken | Debian, Ubuntu                           | not checked                     | -                                            | drop: binary                                       |
| maestro    | taken | Homebrew cask, "AI agent command center" | not checked                     | Homebrew cask                                | drop: binary and category                          |
| grove      | taken | -                                        | not checked                     | four worktree agent tools named grove        | drop: category                                     |
| orchard    | taken | Homebrew cask                            | not checked                     | -                                            | drop: binary, Orchard CMS                          |
| arbor      | taken | -                                        | not checked                     | penso/arbor, 839 stars                       | drop: category                                     |
| canopy     | taken | -                                        | not checked                     | -                                            | drop: canopy-network, 14,705 stars                 |
| copse      | free  | -                                        | not checked                     | `@copse/cli` for agent PRs, secondary source | drop: category                                     |
| relay      | taken | Homebrew cask                            | not checked                     | -                                            | drop: binary, Meta's Relay                         |
| sluice     | taken | Debian, Ubuntu                           | not checked                     | -                                            | drop: binary                                       |
| weir       | taken | -                                        | 1, Weir data MCP plugin         | -                                            | **finalist**                                       |
| flume      | taken | Homebrew formula (Apache Flume)          | not checked                     | -                                            | drop: binary                                       |
| fanout     | taken | -                                        | not checked                     | `agent-fanout` skill, secondary source       | drop: category, generic                            |
| wright     | taken | -                                        | compounds only (`*-wright`)     | Wright, agent orchestration for CAD          | **finalist**                                       |
| smithy     | taken | -                                        | marketplace named `smithy`      | -                                            | drop: smithy-lang/smithy, a plugin marketplace     |
| wrought    | taken | -                                        | not checked                     | npm `wrought`, FluxForge AI                  | drop: category                                     |
| joiner     | taken | -                                        | -                               | -                                            | **finalist**                                       |
| shipwright | taken | -                                        | not checked                     | -                                            | drop: HarbourMasters/Shipwright, 5,836 stars; long |
| wavesmith  | free  | -                                        | -                               | -                                            | **finalist**                                       |
| specsmith  | taken | -                                        | not checked                     | npm `specsmith`, Claude Code workflow kit    | drop: category                                     |

"not checked" in the plugin column: the GitHub code search for plugin names
is limited to 10 queries a minute, so it was run only on the 8 finalists and
on `temper` as a control. Every name in the official marketplace was checked:
none of the 57 is there.

What the filter shows:

- **The category is crowded with the obvious metaphors.** Fleets, trees,
  colonies and conductors are already used by tools that run coding agents in
  parallel worktrees, several of them in 2026.
- **The forge vocabulary is crowded among Claude Code plugins.** One
  marketplace alone names plugins `forge`, `foundry`, `anvil`, `bellows` and
  `temper`, and at least five other repositories have a plugin folder named
  `temper`.
- **npm is nearly always taken.** 54 of 57 bare names are, mostly by stale
  packages from 2022. The project is distributed as a binary and a plugin,
  not an npm package, so this weighs little; a scoped `@andryore/<name>` stays
  open for every name.

## Finalists: scored /70

Same seven axes as the template's `naming.md`, adapted to a developer tool.
0 to 10 each, higher is better on every axis. This is directional judgment,
not a formula.

- **Sound and typing:** easy to say and spell, short as a binary, reads well
  as `/<name>:run`.
- **Registry collision:** GitHub slug, npm, PyPI and crates.io, which can all
  put a binary on `PATH`.
- **Brand and category collision:** plugins and agent tools with the same
  name, and big projects that own the word.
- **Fit with the product:** spec to tickets to waves of parallel workers to one
  landing.
- **Headroom:** room for the product to grow past its first workflow.
- **Warmth and mascot potential:** whether the word suggests a character or a
  mark.
- **Overpromise and legal risk:** lower risk scores higher. Includes
  homophones and negative readings.

| Axis                         | wavesmith                                            | unspool                                  | joiner                             | swell                                                   | ingot                                     | wright                                     | bellows                                   | weir                                       |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------- | ---------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ | ----------------------------------------- | ------------------------------------------ |
| Sound and typing             | 7: clear, but 9 letters                              | 7: 7 letters, clear                      | 6: plain, "joyner" or "join-er"    | 9: one syllable, 5 letters                              | 7: crisp; "in got" can mishear            | 7: silent w, says "right"                  | 6: reads as a plural, and "to bellow"     | 6: 4 letters, but say it "weer" or "wire"? |
| Registry collision           | 10: free on npm, PyPI, crates.io                     | 8: npm taken by an empty v0.1.0          | 6: npm and crates.io taken         | 5: npm, PyPI, crates.io taken; Swell API tool 983 stars | 6: npm, PyPI, crates.io taken             | 6: npm, PyPI, crates.io taken              | 6: npm, PyPI, crates.io taken             | 6: npm, PyPI, crates.io taken              |
| Brand and category collision | 10: none found                                       | 9: none found                            | 9: none found                      | 6: Swell Commerce ships Claude Code plugins             | 6: a personal `ingot` plugin              | 6: Wright (CAD agents), `-wright` plugins  | 5: `bellows` plugin in a forge-themed set | 6: Weir data plugin                        |
| Fit with the product         | 9: waves are the unit of work; smith keeps the craft | 7: a spec unwound into tickets           | 7: joins branches into one landing | 7: a train of waves from one source                     | 6: cast and ready, nothing about parallel | 7: a maker, and "write"                    | 6: drives the fire, not the work          | 7: lets work through in even waves         |
| Headroom                     | 7: tied to waves, which is the core idea             | 7                                        | 6: only the join step              | 8: open word                                            | 7                                         | 8: any making                              | 6                                         | 7                                          |
| Warmth and mascot potential  | 8: a smith at a wave-shaped anvil                    | 6: a spool, a thread                     | 6: a carpenter                     | 6: a wave                                               | 5: a metal bar                            | 7: a maker                                 | 7: a bellows can be a character           | 4: a low dam                               |
| Overpromise and legal risk   | 9: promises nothing specific                         | 6: "unspooling" also means falling apart | 8: also "someone who joins clubs"  | 6: slang for "great"; Swell is a commerce brand         | 9                                         | 5: right/write/rite homophones hurt search | 8                                         | 8: "weird" is one letter away              |
| **Total /70**                | **60**                                               | **50**                                   | **48**                             | **47**                                                  | **46**                                    | **46**                                     | **44**                                    | **44**                                     |

Reading it straight:

- **wavesmith** leads by 10 points because it is the only finalist that is
  free everywhere that was checked and still says what the product does. Its
  one real cost is length.
- **unspool**, **joiner** and **swell** are within 3 points of each other and
  each trades one strength for one weakness: unspool's meaning has a negative
  side, joiner covers only the last step, swell is the best binary but the
  most crowded registry name.
- **ingot**, **wright**, **bellows** and **weir** each carry a same-name plugin
  or a homophone that the top four do not.

## Deep dives

### wavesmith (60/70)

**What it says.** A smith who works in waves. The glossary's **Wave** is the
unit the coordinator dispatches and lands, so the name points at the one idea
that sets this tool apart from a single coding agent. "Smith" keeps the craft
of the current name without the word `forge`.

**As binary, plugin and command.**

```text
$ wavesmith init
$ wavesmith status
/wavesmith:run
```

It reads clearly in all three. At 9 letters it is the longest finalist, longer
than `forge` (5) and the same as `terraform`. Shell completion makes this
smaller in practice, and the binary can later ship a short alias if the
maintainer wants one. This is the main weakness, and it is real: constraint 3
asks for a short binary.

**Collisions.**

- GitHub: `AndryOre/wavesmith` free. 10 repositories carry the word in their
  name; the most starred has 1 star.
- npm, PyPI and crates.io: all free.
- Debian, Ubuntu and Homebrew: no package, no executable.
- Claude Code plugins: none in the official marketplace, none found by code
  search.
- Category: none found. The only product with the name is WaveSmith, an old
  Windows tool for analog test waveforms listed on G2.

**Risks.**

- The `-smith` suffix is already in this niche: the npm package `specsmith` is
  a Claude Code workflow kit
  ([npmjs.com/package/specsmith](https://www.npmjs.com/package/specsmith),
  accessed 2026-11-04). Different first half, same shape, worth a line in the
  maintainer's decision.
- "Waves" also belongs to Waves Audio, a large audio-plugin brand. The compound
  is distinct, and the product category is unrelated.
- Two morphemes can be misread as "wave Smith", a surname. Low risk in
  lowercase.

**Mascot hint.** A smith at an anvil with a wave-shaped spark or hammer arc.
The wave gives a silhouette that is not the generic hammer and anvil, and it
stays clear of any spark or starburst shape close to Claude's.

**Verdict.** The strongest option on every axis except typing.

### unspool (50/70)

**What it says.** A spool of thread unwound: one spec unwound into many
tickets. It belongs to the weaving family, whose other members (loom, weft,
heddle, braid) were all taken by bigger projects or by coding-agent tools.

**As binary, plugin and command.** `unspool init`, `/unspool:run`. Seven
letters, two syllables, one spelling.

**Collisions.**

- GitHub: slug free; 32 repositories with the word, the largest is a 3-star
  Mac writing app.
- npm: taken by `unspool` v0.1.0 (modified 2026-03-27, no description). PyPI
  and crates.io free.
- Binaries and plugins: none found.
- Category: none found.

**Risks.**

- "Unspooling" is also used for a person or a plan coming apart. For a tool
  that runs unattended and merges code, that reading works against the trust
  the product needs.
- The npm squatter is recent. It does not block a binary, but it rules out the
  bare npm name.

**Mascot hint.** A spool or bobbin with a thread that splits into parallel
lines. Strong at 16 px, but closer to an icon than a character.

**Verdict.** Clean and short; the negative reading is what keeps it below
wavesmith.

### joiner (48/70)

**What it says.** A joiner is a woodworker who joins parts into furniture. In
git terms, the coordinator joins worker branches into one integration branch.
The double meaning is exact for the landing step.

**As binary, plugin and command.** `joiner init`, `/joiner:run`. Six letters.

**Collisions.**

- GitHub: slug free; the only exact repository in the top 20 is
  `mhkeller/joiner` (52 stars, a data-join library, last pushed 2023).
- npm: taken by the same library (v2.1.3). crates.io taken. PyPI free.
- Binaries and plugins: none found.
- Category: none found.

**Risks.**

- It names only the last step. The interview, spec and ticket phases are not in
  the word.
- In everyday English a "joiner" is also someone who signs up for every club,
  which is a mild, slightly comic reading.
- It is the weakest at being distinctive: a plain noun that search engines will
  match to carpentry and SQL joins.

**Mascot hint.** A carpenter with a mortise-and-tenon joint, two pieces locking
into one. The joint itself could be the mark.

**Verdict.** The safest plain word; it says less than wavesmith.

### swell (47/70)

**What it says.** At sea, a swell is a train of waves that travels far from the
storm that made it. One spec, many waves. It is the shortest and easiest
finalist to type.

**As binary, plugin and command.** `swell init`, `/swell:run`. Five letters,
one syllable, nothing to misspell.

**Collisions.**

- GitHub: slug free; `open-source-labs/Swell` is an API testing tool with 983
  stars ([open-source-labs/Swell](https://github.com/open-source-labs/Swell),
  accessed 2026-11-04).
- npm, PyPI and crates.io: all taken.
- Binaries: none found.
- Plugins: no plugin named exactly `swell`, but Swell Commerce publishes a
  Claude Code marketplace with a `swell-app` plugin
  ([swellstores/swell-claude-plugins](https://github.com/swellstores/swell-claude-plugins),
  accessed 2026-11-04), and a GitHub organization named `swell-agents`
  publishes coding skills for Claude Code.
- Category: no orchestrator found.

**Risks.**

- Swell is a commerce platform's brand, and it is already in the Claude Code
  plugin space. A user who searches "swell claude code plugin" lands on it.
- "Swell" is also slang for "great". Friendly, but it reads as a claim.

**Mascot hint.** A rolling wave, easy to draw at 16 px and in one color.

**Verdict.** The best binary, the most crowded name. Worth keeping if typing
length matters more to the maintainer than search.

## Recommendation

**Lead option: wavesmith.** It is the only finalist that is free on every
registry checked, has no plugin or category collision found, and names the
idea that makes the tool different: work done in waves. It keeps the craft of
`forge` without its collisions.

**Alternate: swell**, if a 5-letter binary matters more than a clean search
space. It keeps the wave idea in one syllable, at the cost of sharing the name
with Swell Commerce, which is already in the Claude Code plugin space.

**Clean fallbacks:** unspool and joiner. Both are free where it matters; each
says less than wavesmith and carries a weaker second reading.

Before acting on any of these:

- The maintainer makes the final pick. This study does not choose.
- Re-run the checks in `naming-checks.md` on the day of the pick. Registries
  and plugin marketplaces change weekly in this category.
- A trademark search was not run (no tool for it in this run). Do one before
  publishing under any name.
- Nothing is reserved, published or renamed until an explicit OK.

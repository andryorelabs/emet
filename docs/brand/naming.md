# Naming

Draft v1 (2026-11-04). Status: `emet` selected by the maintainer in an interview;
final approval pending the trademark check. Supersedes the finalists in
`docs/brand/naming-candidates.md`.

## Decision

**`emet`**, one name for the repository, binary, plugin and `/emet:run`. Site at
`emet.andryore.dev`.

## The story

In Jewish folklore a golem is a figure of clay brought to life by writing a
word on its forehead: אמת, _emet_, "truth". Erase the first letter and what
remains is מת, _met_, "dead", and the golem stops. Raw material becomes a
worker through one word, and one erasure switches it off.

| Idea in the folklore             | Idea in the product                       |
| -------------------------------- | ----------------------------------------- |
| One word gives the clay its task | One approved spec gives the agents theirs |
| Clay becomes a worker            | Raw ticket becomes a merged change        |
| Erase one letter and it stops    | Nothing merges when something is flagged  |

It carries the "forge" idea (raw becomes finished) without the word, and the
control pain from the brief (fear of leaving agents loose) without hype.

## How the name was reached

Rejected by the maintainer, in order: the run-1 finalists (wavesmith, unspool,
joiner, swell), `forge` compounds, metalwork words, Odysseus names, `falconer`,
tool and trade words, invented words. Stated reasons: they did not convey the
idea, sounded forced, and had no story. The approach changed to story first,
then word. Stories offered: homing pigeon, Balto's serum run, the golem.

Dropped on screening:

- `golem`: Golem CLI (a terminal coding agent), GolemBot (wraps Claude Code),
  golemcloud/golem (agent runtime, 1.5k stars).
- `argos`: Argos CI has a CLI, MCP server and agent skills in the same niche.
- `falconer`: a funded company ships a same-named CLI and MCP.
- `balto`: Balto AI is a funded contact-center company.

## Availability (2026-11-04)

| Check                                             | Result                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| npm                                               | free                                                                     |
| Homebrew formula and cask                         | free                                                                     |
| Debian and Ubuntu source and package              | free                                                                     |
| `/usr/bin` binary on this host                    | none                                                                     |
| Claude Code plugin marketplaces installed locally | none                                                                     |
| `AndryOre/emet`                                   | free                                                                     |
| Web search for AI and developer tools named Emet  | none found                                                               |
| PyPI `emet`                                       | taken: HarperZ9/emet, 1 star, created 2026-06, a file hash drift checker |
| crates.io `emet`                                  | taken: an unrelated file integrity library, 144 downloads                |

## Risks

- **Microsoft EMET** (Enhanced Mitigation Experience Toolkit, a Windows
  exploit-mitigation tool, support ended 2018) dominates search results.
  Mitigation: the repo and site say "emet for Claude Code"; the audience does
  not use Windows security tooling.
- **PyPI and crates.io names are taken.** The CLI ships as standalone binaries
  and a plugin (`docs/adr/0008-standalone-binaries-and-plugin-distribution.md`),
  so no registry package is needed today. If one is ever wanted, use a scoped
  name.
- **Pronunciation.** "EH-met" or "EE-met"; the README states one.
- **Trademark.** Manual step, not done: search USPTO TSDR and EUIPO classes 9
  and 42 for EMET before the rename ticket.
- **Religious source.** The golem is a folk tale used widely in fiction and
  software. Copy tells the story plainly and does not claim anything beyond it.

## Fit with the brief

- Short to type: four letters, `/emet:run`.
- Not Forge, not vendor or model words, not the crowded territories.
- Pairs with the mascot direction chosen later: an abstract clay figure with a
  single mark on the forehead. Not an octopus, ghost or hand.

# emet voice

How emet sounds. Derived from the approved [brand brief](brief.md); where the two differ, the brief's closed decisions win.

## In one line

Control, sober and precise, with dry humour in small places. No hype.

## We are / we are not

| We are                                                                | We are not                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| Controlled: one approval, then the work runs                          | Breathless: no "unleash", no "10x"                   |
| Sober: plain verbs, short sentences                                   | Grand: no "revolutionary", no "the future of coding" |
| Precise: numbers, file names, exact commands                          | Vague: no "seamless", no "magic"                     |
| Dry: a small joke in the mascot or a terminal line                    | Jokey: no puns in docs, errors or release notes      |
| Honest: claims only what the CLI does today                           | Promissory: no features that are not shipped         |
| Calm about agents: they run in isolation, nothing merges when flagged | Anxious or boastful about autonomy                   |

## Tone by context

| Context          | Tone                                                              | Example                                                       |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| README, docs     | Plain and exact. Lead with what it does, then how.                | "One approval, then workers implement in isolated worktrees." |
| Terminal output  | Terse. State, then cause. A dry aside is allowed once in a while. | "Wave 2 held: one ticket flagged. Nothing merged."            |
| Errors           | Say what failed, what it touched and the next command. No blame.  | "CI failed on wave 1. PR left open for review."               |
| Mascot lines     | The only place for gentle humour. Short, never about the user.    | "Lamp on. Still reading the spec."                            |
| Release notes    | Factual list of changes. No adjectives.                           | "Adds `forge init` checks for missing config."                |
| Social, listings | One claim per line, each backed by the CLI.                       | "Spec to merge, on one approval."                             |

## Terminology

- Use the repo terms from [GLOSSARY.md](../../GLOSSARY.md): wave, ticket, worker, reviewer, coordinator, integration branch.
- "approval" means the single human approval before materialize. Do not call it a "review" or a "sign-off".
- "review" means the reviewer pass per wave.
- "worktree" is one word, lowercase.
- The product is written `emet` in lowercase, in prose and in the wordmark. The command is `/emet:run` once the rename lands.
- Write "plugin for Claude Code" when naming the host, descriptively and never as a product name.

## Language to avoid

- **Hype words:** "AI-powered", "autonomous", "revolutionary", "supercharge", "ships while you sleep".
- **Claude visual clichés:** terracotta or orange, cream plus charcoal as the identity, a radial spark or starburst, a pixel creature that reads as Clawd.
- **Crowded territory:** octopus, ghost and hand mascots (Jules, Kiro, OpenHands, SWE-agent) and a purple accent (Copilot, Jules, Kiro, Spec Kit).
- **Competitor naming:** vendor or model words (Claude, Codex) in the name, factory, droid, squad, crew, orchestra, conductor, plain first names (Devin, Jules), and "Forge" as the lead word.
- **The internal promise:** "I can leave and come back to a reviewed merge" stays internal and never appears in public copy.
- **Unshipped claims:** anything the CLI does not do today.

## Relation to Anthropic

Every public surface that names Claude Code carries this notice, verbatim:

> Not affiliated with or endorsed by Anthropic

Copy may say "plugin for Claude Code" descriptively. The name, logo, palette and mascot stay fully separate from Claude's identity: no Claude orange or clay, no spark, no Clawd likeness.

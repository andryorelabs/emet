# Brand brief

Draft v1 (2026-11-04). Status: approved by the maintainer in an interview; kept as
a historical record. Where it differs from shipped copy, the shipped copy wins.
The name, mascot, palette, typeface and logo are decided in later steps and are
not decided here.

## Category

A command for Claude Code that takes a feature from idea to merged change:
interview, spec, tickets, one approval, then parallel agents in isolated
worktrees implement, test and merge it. It runs on the developer's machine and
works with Linear, GitHub Issues or no tracker. See `docs/brand/competitors.md`
for the field.

## Position

**One approval, then you come back to a merge.** The category splits into hosted
agents, local managers with a UI, and spec frameworks. Few tools do spec,
parallel execution and merge in one command with one approval. That is the
position this brand claims, and it claims no more than the tool ships today.

## Audience

- **Primary:** developers who use Claude Code every day, in repos of their own,
  in any stack (bun, pnpm, npm, Go, Rust, Python), alone or in small teams.
- **Secondary:** open source maintainers with many issues to land.
- **Not for:** enterprise buyers, or people without a terminal.

## Pains the brand names

- Watching agents one by one.
- Conflicts between parallel branches.
- Fear of leaving agents loose with no control.

Losing the thread between spec, tickets and pull requests stays a product detail,
not public copy.

## Promise

The promise stays internal and never appears in public copy: **I can leave and
come back to a reviewed merge.**

Public claims are limited to what the CLI backs today: one approval, a review
per wave, nothing merges when something is flagged, CI green before merge, and
workers in isolated worktrees.

## Voice

Control, in a sober and precise tone, with dry humour in small places (the
mascot, terminal messages). No hype and no "AI-powered".

## Relation to Anthropic and Claude Code

Copy may say, descriptively, "plugin for Claude Code", always with the notice
"Not affiliated with or endorsed by Anthropic". The name, logo, palette and
mascot are fully separate from Claude's identity.

## Name and command

One name for the repository, binary, plugin and `/<name>:run` command, so it has
to be short to type. The site goes on `<name>.andryore.dev`; no domain is bought.
The rename is mandatory, because the current name carries a trademark.

## Visual world

- A cool neutral base and a single accent. The accent is not purple and not
  orange or terracotta.
- Terminal first: it must work in 16 ANSI colours, and then in the README.
- The mark is a simple shape that stays legible at 16 px.
- The mascot is a companion to the mark, not the logo: one silhouette and one
  colour. It appears in the README, the terminal banner, empty states and
  stickers.

## What to avoid

- **Words:** "AI-powered", "autonomous", "revolutionary", "supercharge", "ships
  while you sleep".
- **Claude visual clichés:** terracotta or orange, cream plus charcoal as the
  identity, a radial spark or starburst, a pixel creature that reads as Clawd.
- **Crowded territory:** octopus, ghost and hand mascots (Jules, Kiro,
  OpenHands, SWE-agent) and a purple accent (Copilot, Jules, Kiro, Spec Kit).
- **Competitor naming:** vendor or model words (Claude, Codex), factory, droid,
  squad, crew, orchestra, conductor, plain first names (Devin, Jules), and
  "Forge" as the lead word.

## Closed decisions

- The rename is mandatory.
- No domain purchase: the site is a subdomain of `andryore.dev`.
- The mascot is a companion to the mark.
- Docs are in English.
- Runtime and installer behaviour do not change until an explicit ticket
  (`docs/adr/0001-root-dev-tooling-package-separate-from-runtime.md`).

## Surfaces in scope now

README cover (light and dark), GitHub social preview, plugin icon, and a terminal
banner asset.

## Out of scope

A landing page on `<name>.andryore.dev`, YouTube art, stickers and merch. The
rename itself and showing the banner in the CLI are separate tickets.

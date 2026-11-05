# Use the emet pet and mascot

How to show the emet **Mascot** in Claude Code and in Orca. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

There are two independent pieces: the optional `emet-mascot` plugin, which draws the mascot above the Claude Code prompt, and the Orca pet bundle, which gives Orca the same character.

## Install the mascot plugin

The plugin ships in the same marketplace as emet and is optional. emet does not need it.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

The mascot follows your session (sleeping, working, waiting, done, error). While a **Run** is active it also reads the **Phase file** and shows a dim label such as `emet · wave 2 · review`.

Two plugin options:

- `size`: `small` (16 x 8 cells) or `medium` (24 x 12 cells, the default).
- `showLabel`: show or hide the label beside the mascot (default on).

## The phase file

The emet CLI writes `.emet/phase.json` in the repo as a run moves along, and the mascot polls it about every two seconds. A file older than the freshness window is ignored, so a crashed run does not leave a stale label.

The file holds `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` or `failed`), `wave`, `spec`, `runId`, `updatedAt` and an optional `outcome`. A write that fails never fails the subcommand that reported the phase.

## Use the pet in Orca

The pet bundle lives in `docs/brand/pet/emet/`: `pet.json` and `spritesheet.webp`. In Orca's settings, use "Import .codex-pet bundle…" and pick that folder. Regenerate it with `bun run brand:export` after changing a mascot SVG, and commit the result.

## Troubleshooting

- No mascot: run `claude plugin list`, check that `emet-mascot` is enabled, then restart Claude Code.
- No label: check that `.emet/phase.json` exists and was updated recently.

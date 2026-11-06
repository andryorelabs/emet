# Use the emet mascot (Claude Code mod and Orca pet)

How to show the emet **Mascot** in Claude Code and in Orca. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

There are two independent pieces: the optional `emet-mascot` plugin, which draws the mascot in Claude Code, and the Orca pet bundle, which gives Orca the same character.

## Install the mascot plugin

The plugin ships in the same marketplace as emet and is optional. emet does not need it.

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

The mascot follows your session (sleeping, working, waiting, done, error). While a **Run** is active it also reads the **Phase file** and shows a dim label such as `emet · wave 2 · review`.

Plugin options:

- `position`: `pane` (the default), `band` or `status`. `pane` docks the mascot beside the transcript, which needs the fullscreen layout and a terminal at least 144 columns wide until you open the pane once yourself (about 110 after that); when it cannot dock, or the terminal narrows later, the mascot shows above the prompt instead. `band` always draws it above the prompt. `status` shows only the text label as the plugin status line, with no mascot art.
- `size`: `small` (16 x 8 cells, the default) or `medium` (24 x 12 cells).
- `showLabel`: show or hide the label beside the mascot (default on).

## Update the mascot plugin

Marketplaces other than Anthropic's have auto-update off by default, and a marketplace cannot turn it on for its users. Update by hand:

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Restart Claude Code afterwards. To update on its own, run `/plugin`, open the **Marketplaces** tab, select `emet-marketplace` and choose **Enable auto-update**. Each user does this once on their own machine. See [Update emet](update-emet.md) for the main plugin too.

## The phase file

The emet CLI writes `.emet/phase.json` in the repo as a run moves along, and the mascot polls it about every two seconds. A file older than the freshness window is ignored, so a crashed run does not leave a stale label.

The file holds `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` or `failed`), `wave`, `spec`, `runId`, `updatedAt` and an optional `outcome`. A write that fails never fails the subcommand that reported the phase.

## Use the pet in Orca

The pet bundle lives in `docs/brand/pet/emet/`: `pet.json` and `spritesheet.webp`. In Orca's settings, use "Import .codex-pet bundle…" and pick that folder. The import needs `docs/brand/pet/emet/` on the machine where the Orca app runs, so copy the folder there if Orca runs elsewhere than this repo. Regenerate it with `bun run brand:export` after changing a mascot SVG, and commit the result.

## Troubleshooting

- No mascot: run `claude plugin list`, check that `emet-mascot` is enabled, then restart Claude Code.
- No label: check that `.emet/phase.json` exists and was updated recently.

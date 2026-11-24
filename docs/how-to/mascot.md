# Use the emet mascot (Claude Code mod and Orca pet)

Show the emet **Mascot** in Claude Code and in Orca. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

There are two independent pieces: the optional `emet-mascot` plugin, which draws the mascot in Claude Code, and the Orca pet bundle, which gives Orca the same character. emet does not need either.

## Prerequisites

- Claude Code, for the plugin.
- emet installed, so a run writes the phase file the mascot follows; see [Install](../start/install.md).
- Orca, for the pet. The import needs the `docs/brand/pet/emet/` folder on the machine where the Orca app runs.

## Install the mascot plugin

:::steps

1. Add the marketplace and install the plugin:

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. Restart Claude Code. The mascot follows your session (sleeping, working, waiting, done, error). While a **Run** is active it also reads the phase file and shows a dim label such as `emet · wave 2 · review`.
3. Optionally set the plugin options:
   - `position`: `pane` (default), `band` or `status`. `pane` docks the mascot beside the transcript and needs the fullscreen layout and a terminal at least 144 columns wide until you open the pane once yourself (about 110 after that); when it cannot dock, the mascot shows above the prompt. `band` always draws it above the prompt. `status` shows only the text label as the status line.
   - `size`: `small` (16 x 8 cells, default) or `medium` (24 x 12 cells).
   - `showLabel`: show or hide the label (default on).

:::

## Update the mascot plugin

Marketplaces other than Anthropic's have auto-update off by default, so update by hand or turn it on once.

:::steps

1. Update the marketplace and the plugin:

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. Restart Claude Code.
3. To update on its own, run `/plugin`, open the **Marketplaces** tab, select `emet-marketplace` and choose **Enable auto-update**. Each user does this once on their own machine. See [Update emet](update-emet.md) for the main plugin.

:::

## Use the pet in Orca

:::steps

1. Make sure `docs/brand/pet/emet/` (`pet.json` and `spritesheet.webp`) is on the machine where Orca runs; copy the folder there if Orca runs elsewhere than this repo.
2. In Orca's settings, choose "Import .codex-pet bundle…" and pick that folder.
3. After changing a mascot SVG, regenerate the bundle with `bun run brand:export` and commit the result.

:::

## Check

:::steps

1. Run `claude plugin list` and confirm `emet-mascot` is enabled; if the mascot is missing, restart Claude Code.
2. During a run, confirm `.emet/phase.json` exists and was updated in the last few seconds. The mascot polls it about every two seconds and ignores a file older than its freshness window, so a crashed run leaves no stale label. It holds `phase` (`planning`, `dispatch`, `working`, `review`, `checking`, `landing`, `done` or `failed`), `wave`, `spec`, `runId`, `updatedAt` and an optional `outcome`.
3. In Orca, confirm the emet pet appears in the pet list.

:::

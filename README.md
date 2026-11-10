# emet

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/og/cover.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/brand/og/cover-light.png">
  <img src="docs/brand/og/cover.png" alt="emet">
</picture>

**Spec to merge, on one approval.**

[![CI](https://github.com/andryorelabs/emet/actions/workflows/ci.yml/badge.svg)](https://github.com/andryorelabs/emet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/andryorelabs/emet)](LICENSE)
[![Release](https://img.shields.io/github/v/release/andryorelabs/emet)](https://github.com/andryorelabs/emet/releases)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/andryorelabs/emet/badge)](https://scorecard.dev/viewer/?uri=github.com/andryorelabs/emet)

emet is a plugin for Claude Code and Codex. It takes a feature from idea to merged change: interview, spec, tickets, one approval, then parallel workers implement and test in isolated worktrees. Each wave gets a review, CI must be green before merge, and nothing merges when something is flagged.

It runs on your machine, in any git repo, with Linear, GitHub Issues or no tracker.

Read the docs on the Website: [emet.andryore.dev](https://emet.andryore.dev).

- **One approval.** You review the spec and the tickets once, then the run starts.
- **A review per wave.** A reviewer checks each wave before it lands.
- **Nothing merges when flagged.** A wave with anything flagged is never auto-merged.
- **CI green before merge.** The wave's PR waits for its checks; a failing check is fixed and pushed a bounded number of times, then left open for you.
- **Isolated worktrees.** Each worker implements in its own git worktree, so parallel branches do not touch each other.
- **Your tracker, or none.** Linear, GitHub Issues or local files.

Pronounced "EH-met".

In folklore a golem is a clay figure brought to life by the word _emet_, "truth", written on its forehead.
Erase one letter and it stops; here, nothing merges when something is flagged.

Not affiliated with or endorsed by Anthropic or OpenAI

## Quickstart

<img src="docs/brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

Requirements: Claude Code or the Codex CLI, `git`, `gh` (authenticated) and the `mattpocock-skills` plugin, on Linux or macOS. Bun is needed only for a source install.

1. On Claude Code (no Bun needed):

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet@emet-marketplace
   ```

   Or from a clone, with `./install.sh`, which also installs the terminal `emet` that the Codex host needs:

   ```bash
   git clone git@github.com:andryorelabs/emet.git
   cd emet
   ./install.sh
   ```

   Optional: a pixel mascot, see [Mascot](#mascot-optional).

   On Codex, install the plugin instead, then install the terminal `emet` as in [Getting started](docs/guide/getting-started.md) (needs `mattpocock-skills` too; the full steps are in [Codex](docs/guide/codex.md)):

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

   To update later on Claude Code, refresh the marketplace and update each plugin, then restart Claude Code. On Codex, run `codex plugin marketplace upgrade emet-marketplace`, then `codex plugin add emet@emet-marketplace`. Auto-update is off by default for third-party marketplaces; turn it on in Claude Code in `/plugin`, tab **Marketplaces**, `emet-marketplace`, **Enable auto-update**. See [Update emet](docs/how-to/update-emet.md).

2. In your repo, set it up and check it. On Claude Code:

   ```
   /emet:init
   /emet:doctor
   ```

   On Codex:

   ```
   $emet:init
   $emet:doctor
   ```

   In a plain terminal, `emet init` and `emet doctor .` work only after `install.sh`.

3. Inside Claude Code:

   ```
   /emet:run <describe the feature>
   ```

   On Codex, run the skill `$emet:run <describe the feature>`.

More in [Getting started](docs/guide/getting-started.md). If `doctor` reports a problem, see [troubleshooting](docs/troubleshooting.md).

## Mascot (optional)

<img src="docs/brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96">

- Claude Code mod: `claude plugin install emet-mascot@emet-marketplace` shows a pixel mascot beside the transcript (or above the prompt, or as a status line) that mirrors your session and the run phase.
- Orca pet: the same character as an Orca pet bundle in `docs/brand/pet/emet/`.

Options and the Orca import are in the [mascot how-to](docs/how-to/mascot.md).

## How it works

1. You describe a feature; `/emet:run` (`$emet:run` on Codex) interviews you and writes a spec.
2. It splits the spec into tickets and asks for one approval.
3. Parallel workers implement each ticket in its own git worktree.
4. A reviewer checks the wave, and CI must be green; anything flagged stops the merge.
5. The wave lands as one PR (or a local merge), and the next wave can chain on.

## Models & effort

On Claude Code, emet picks a model and a reasoning effort per role automatically: Opus plans, Sonnet coordinates and implements, Opus reviews by risk tier, and Haiku triages CI logs. On Codex, it uses the `codex.models` defaults instead. The role table, the `review.highRiskPaths` rule and what you set once are in [Models and effort](docs/guide/models-and-effort.md).

## Documentation

- Guide: [getting started](docs/guide/getting-started.md), [trackers and landing](docs/guide/trackers-and-landing.md), [models and effort](docs/guide/models-and-effort.md), [fleet check](docs/guide/fleet.md), [Codex](docs/guide/codex.md)
- Reference: [configuration](docs/reference/configuration.md), [CLI](docs/reference/cli.md), [dependencies](docs/reference/dependencies.md)
- Project: [architecture](docs/architecture.md), [troubleshooting](docs/troubleshooting.md), [documentation index](docs/README.md), [changelog](CHANGELOG.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions go through [SUPPORT.md](.github/SUPPORT.md).

## License

[MIT](LICENSE)

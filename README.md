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

emet is a plugin for Claude Code. It takes a feature from idea to merged change: interview, spec, tickets, one approval, then parallel workers implement and test in isolated worktrees. Each wave gets a review, CI must be green before merge, and nothing merges when something is flagged.

It runs on your machine, in any git repo, with Linear, GitHub Issues or no tracker.

- **One approval.** You review the spec and the tickets once, then the run starts.
- **A review per wave.** A reviewer checks each wave before it lands.
- **Nothing merges when flagged.** A wave with anything flagged is never auto-merged.
- **CI green before merge.** The wave's PR waits for its checks; a failing check is fixed and pushed a bounded number of times, then left open for you.
- **Isolated worktrees.** Each worker implements in its own git worktree, so parallel branches do not touch each other.
- **Your tracker, or none.** Linear, GitHub Issues or local files.

Pronounced "EH-met".

In folklore a golem is a clay figure brought to life by the word _emet_, "truth", written on its forehead.
Erase one letter and it stops; here, nothing merges when something is flagged.

Not affiliated with or endorsed by Anthropic

## Quickstart

<img src="docs/brand/mascot/mascot-work.svg" alt="emet mascot, working" width="96" align="right">

Requirements: Claude Code, `git`, `gh` (authenticated) and the `mattpocock-skills` plugin, on Linux or macOS. Bun is needed only for a source install.

1. Install the plugin (no Bun needed):

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet@emet-marketplace
   ```

   Or from a clone, with `./install.sh`:

   ```bash
   git clone git@github.com:andryorelabs/emet.git
   cd emet
   ./install.sh
   ```

2. In your repo, set it up and check it:

   ```bash
   emet init
   emet doctor .
   ```

3. Inside Claude Code:

   ```
   /emet <describe the feature>
   ```

More in [Getting started](docs/guide/getting-started.md). If `doctor` reports a problem, see [troubleshooting](docs/troubleshooting.md).

## How it works

1. You describe a feature; `/emet` interviews you and writes a spec.
2. It splits the spec into tickets and asks for one approval.
3. Parallel workers implement each ticket in its own git worktree.
4. A reviewer checks the wave, and CI must be green; anything flagged stops the merge.
5. The wave lands as one PR (or a local merge), and the next wave can chain on.

## Models & effort

`/emet` picks a model and a reasoning effort per role automatically: Opus plans, Sonnet coordinates and implements, Opus reviews by risk tier, and Haiku triages CI logs. The role table, the `review.highRiskPaths` rule and what you set once are in [Models and effort](docs/guide/models-and-effort.md).

## Documentation

- Guide: [getting started](docs/guide/getting-started.md), [trackers and landing](docs/guide/trackers-and-landing.md), [models and effort](docs/guide/models-and-effort.md), [fleet check](docs/guide/fleet.md)
- Reference: [configuration](docs/reference/configuration.md), [CLI](docs/reference/cli.md), [dependencies](docs/reference/dependencies.md)
- Project: [architecture](docs/architecture.md), [troubleshooting](docs/troubleshooting.md), [documentation index](docs/README.md), [changelog](CHANGELOG.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions go through [SUPPORT.md](.github/SUPPORT.md).

## License

[MIT](LICENSE)

# Product

What emet is, who it is for and what it will not do. Terms follow [GLOSSARY.md](GLOSSARY.md); the approved public wording is in [docs/brand/copy.md](docs/brand/copy.md).

## Purpose

Spec to merge, on one approval.

emet is a plugin for Claude Code and Codex. It takes a feature from idea to merged change: interview, spec, tickets, one approval, then parallel workers implement and test in isolated worktrees. Each wave gets a review, CI must be green before merge, and nothing merges when something is flagged.

## Users

- Developers who already work with Claude Code or the Codex CLI and want an approved spec to turn into merged code without supervising each step.
- Maintainers of any git repo, with Linear, GitHub Issues or no tracker.

## Principles

- **One approval.** The human reviews the spec and the tickets once; the run then goes unattended.
- **Nothing merges when flagged.** A wave with anything flagged is never auto-merged.
- **Local first.** It runs on the user's machine, in the user's repo, with the user's tracker.
- **Isolation.** Each worker has its own git worktree, and only the coordinator writes the tracker.
- **Claims match the CLI.** Public copy states only what the CLI does today.

## Non-goals

- Hosting, a web service or an account: emet has no backend.
- Replacing code review by a person for flagged waves.
- Native Windows support; use WSL.
- Trackers beyond Linear, GitHub Issues and local files.

## Where to go next

- [ROADMAP.md](ROADMAP.md): what is planned.
- [docs/architecture.md](docs/concepts/architecture.md): how the pieces fit.
- [docs/guide/getting-started.md](docs/start/install.md): install and first run.

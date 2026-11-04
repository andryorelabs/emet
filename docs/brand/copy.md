# emet copy

Approved public copy. Every claim is limited to what the CLI does today and is backed in "Claims checked". Voice rules are in [voice.md](voice.md).

## Tagline

> Spec to merge, on one approval.

## README intro

emet is a plugin for Claude Code. It takes a feature from idea to merged change: interview, spec, tickets, one approval, then parallel workers implement and test in isolated worktrees. Each wave gets a review, CI must be green before merge, and nothing merges when something is flagged.

It runs on your machine, in any git repo, with Linear, GitHub Issues or no tracker.

## Feature list

- **One approval.** You review the spec and the tickets once, then the run starts.
- **A review per wave.** A reviewer checks each wave before it lands.
- **Nothing merges when flagged.** A wave with anything flagged is never auto-merged.
- **CI green before merge.** The wave's PR waits for its checks; a failing check is fixed and pushed a bounded number of times, then left open for you.
- **Isolated worktrees.** Each worker implements in its own git worktree, so parallel branches do not touch each other.
- **Your tracker, or none.** Linear, GitHub Issues or local files.

## Non-affiliation notice

Not affiliated with or endorsed by Anthropic

## Claims checked

| Claim                          | Backed by                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One approval                   | `forge/src/approve.ts`; `forge/reference/phases-1-5.md` (phases 1-5 end at the approval); `README.md` intro                                                 |
| A review per wave              | `forge/src/review.ts`, `forge/src/reviewpackage.ts`; `forge/reference/reviewer-prompt.md`; `forge/reference/phases-8-closeout.md`                           |
| Nothing merges when flagged    | `forge/src/gate.ts`; `forge/reference/phases-8-closeout.md` ("Never auto-merge a wave with anything flagged"); `README.md` "Landing PRs and chaining waves" |
| CI green before merge          | `forge/src/land.ts`; `forge/reference/phases-8-closeout.md` (merge only if green); `README.md` `pr.autoMerge`, `maxCiFixAttempts`                           |
| Workers in isolated worktrees  | `forge/src/worktrees.ts`; `forge/reference/worker-prompt.md`; `docs/architecture.md` (run state)                                                            |
| Linear, GitHub Issues or none  | `forge/reference/tracker-linear.md`, `tracker-github.md`, `tracker-local.md`; `README.md` intro                                                             |
| Runs on your machine, any repo | `README.md` intro ("Runs in any git repo")                                                                                                                  |

## Open items

### Short description

Not selected. Two proposals, both within the claims above:

1. "Spec to merge on one approval: parallel workers in isolated worktrees, a review per wave, CI green before merge."
2. "A Claude Code plugin that turns an approved spec into a merged change, with a review per wave."

Pick one, or replace both, before it appears on any listing.

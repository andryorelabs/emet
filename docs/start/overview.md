# Overview

What emet is, what a run does and where to go next. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

<img src="../brand/mascot/mascot-done.svg" alt="emet mascot, done" width="96" align="right">

emet takes a feature from idea to merged change inside Claude Code or the Codex CLI, in any git repo, with Linear, GitHub Issues or local tickets. You describe the feature once and approve the spec and tickets once; the rest runs unattended.

## What a run does

1. `/emet:run` (`$emet:run` on Codex) interviews you and writes a spec.
2. It splits the spec into tickets and asks for one approval.
3. Parallel workers implement each ticket in its own git worktree.
4. A review checks each wave and CI must be green; anything flagged stops the merge.
5. The spec lands as one pull request by default, or as a local merge, and the next wave can chain on.

## Where to go next

1. [Install](install.md): the standalone install, update, auto-update and uninstall.
2. [First run](first-run.md): check the install and run emet in a repo.
3. [Runs, waves and specs](../concepts/runs-waves-specs.md): the vocabulary of a run.
4. [Trackers and landing](../how-to/configure-tracker.md): GitHub, Linear or local tickets, and how a spec lands.

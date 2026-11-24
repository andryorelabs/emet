# Memory

What emet remembers between runs and where it keeps it. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Lessons

A run is unattended, so what it learns would vanish with the session. At the end of a run the coordinator saves 1 to 5 short bullets about what helped or hurt, called **Lessons**, together with the run's outcome: landed, chained, hold, stop or blocked. Each bullet is a single short line.

Lessons are kept per spec, in a note per repository, so a later run on the same repository can read what earlier ones learned. A note that grows too large drops its oldest sections first.

## Where they are kept

Lessons live in [Engram](https://github.com/Gentleman-Programming/engram), a separate local memory store, not in your repository and not in the tracker. emet uses it only when the `engram` binary is on PATH and answers its handshake.

If Engram is missing, broken or turned off, `emet memory` reports that memory is unavailable and exits successfully. Memory never blocks a run.

## How they are used

At the start of a run, before the first interview round, the coordinator searches memory for lessons that match the feature. Relevant ones go into the plan under a "Prior lessons" heading, so the interview and the plan start from what earlier runs found. When nothing is found or memory is unavailable, the run notes that in one line and goes on.

## Using it by hand

`emet memory search` and `emet memory save` are ordinary CLI commands, so you can search or add a lesson yourself. To switch memory off for a repository, set `memory.enabled` to `off`.

For the commands, see [`emet memory`](../reference/cli.md#runs-workers-and-slots). For the key, see [`memory`](../reference/configuration.md#memory). The place of a run in the larger flow is in [Runs, waves and specs](runs-waves-specs.md).

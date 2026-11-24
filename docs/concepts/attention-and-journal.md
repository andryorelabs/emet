# Attention and the journal

emet records its own events in one global journal. One kind of event tells you when a session is waiting for you. Terms follow [GLOSSARY.md](../../GLOSSARY.md); the decisions are in [ADR-0030](../adr/0030-global-event-journal.md) and [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md).

## The journal

The journal is a single append-only file of JSON lines, one event per line, in the host-wide state directory that also holds the worker slot pool. Because it is global, a later analysis can tell a run that `emet launch` or `emet chain` started from one a person typed by hand: every event carries its repo, host and an origin of `human` or `auto`.

Existing commands write the events: starting a run, a gate decision, a human intervention in an unattended wave, a launch result, a closed ticket, a cleanup, a baseline mark, and the integrating, landing or abandoning of a spec branch.

### What it never records

Prompts, assistant text, hook input, environment variables, argv, tokens, diffs and issue bodies. An event holds only ids, codes, counts, durations and a short reason. An event that would grow past 2 KiB loses its data and is marked as truncated.

### Failures and rotation

A journal that cannot be written never changes a command's output or exit code. When the file passes about 10 MiB the next append moves it to a numbered segment and keeps the five newest. On a network filesystem concurrent writes can interleave, so `emet doctor` warns, without failing, when the state directory is on one.

### Reading it

`emet insights` reads every segment and reports runs by origin, gate decisions, interventions, launch outcomes, spec events and tickets closed. By default it covers the events since the latest baseline; `--mark-baseline` starts counting from now. It skips lines it cannot parse and counts them, and it prints a zero report when the journal is empty. Because the file is plain JSON lines, `jq` works on it too. See the [CLI reference](../reference/cli.md#runs-workers-and-slots).

## Attention

A run can sit blocked on a permission prompt or a question while nobody looks. Attention is the answer to "does a session need me?".

Each session of an emet-owned run is in one of four states:

- **working**: the agent is acting.
- **needs-decision**: the agent waits for a person, for example on a permission prompt or a question. "Blocked" is another word for it.
- **idle**: the agent stopped and is waiting for the next prompt.
- **ended**: the session is over.

The `emet guard` hook, already installed on the host, notices the transitions and appends a `session.attention` event to the journal only when the state changes, so there is no second store. A session counts as emet-owned when it runs in an emet worker worktree, or in a repo with an emet config and an unfinished run. On Codex there are no notification events, so a stop is idle unless the run has a blocked result, which is needs-decision.

The event holds the session id, the old and new state, the trigger and the run id. It never holds the notification text, the tool name or the tool input. Recording never blocks: a failure is swallowed and the permission dialog is unchanged.

### The alert

Entering needs-decision raises one alert: an Orca unread mark on the worktree when the Orca runtime is reachable, otherwise a desktop notification when one is available. emet never clears it, and `attention.alert` turns it off.

### Where you see it

`emet status` lists the sessions and their state, and a blocked session raises the overall state to needs-decision even when no wave is running. `emet fleet status` shows the same across repos.

## See also

- [Runs, waves and specs](runs-waves-specs.md)
- [Security](security.md)
- [Configuration reference](../reference/configuration.md) for `attention.alert`

# Event journal

emet appends its own events to one global file, so a later analysis can tell a run that `emet launch` or `emet chain` started from one a person typed by hand. Back to the [docs index](../README.md).

## Where it lives

`<stateDir>/journal/events.jsonl`, in the host-wide state directory that also holds the worker slot pool (`~/.local/state/emet` unless `EMET_STATE_DIR` or `XDG_STATE_HOME` say otherwise). Each line is one JSON object of at most 2 KiB: `{v, ts, id, kind, runId?, repo, host, origin, pid, data}`. `origin` is `human` or `auto`.

Events are written by commands that already exist:

| Kind            | Written by                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `run.start`     | `emet preflight`; `origin` is `auto` when a `launch.result` exists for the same spec and wave, else `human`. |
| `gate.decision` | `emet gate` (skipped with `--no-record`).                                                                    |
| `intervention`  | `emet gate`, when a wave that `emet launch` or `emet chain` did not start is continued by hand.              |
| `launch.result` | `emet launch` and `emet chain`.                                                                              |
| `ticket.close`  | `emet tracker close`.                                                                                        |
| `cleanup`       | `emet cleanup`, with counts.                                                                                 |
| `baseline`      | `emet insights --mark-baseline`.                                                                             |

## What it never records

Prompts, assistant text, hook input, environment variables, argv, tokens, diffs and issue bodies. `data` holds only ids, codes, counts, durations and a `reason` cut to 200 characters. An event that would pass 2 KiB loses its `data` and is stored with `truncated: true`.

## Failures and rotation

A journal that cannot be written never changes a command's output or exit code. Past about 10 MiB the next append renames the file to a numbered segment (`events.1.jsonl`, older ones shift) and keeps the five newest. On a network filesystem concurrent writes can interleave, so `emet doctor` warns, without failing, when the state directory is on one.

## Reading it

```bash
emet insights                  # events since the latest baseline
emet insights --since 7d       # last seven days
emet insights --all --json     # everything, machine-readable
emet insights --mark-baseline  # start counting from now
```

`insights` reads every segment in order, skips and counts lines it cannot parse (`skippedLines`), and prints a zero report when the journal is empty or missing. Because the file is plain JSON lines, `jq` works on it too. See the [CLI reference](../reference/cli.md#runs-workers-and-slots).

# 0030. A global append-only journal records what emet decides and does

Status: Accepted (2026-11-18)
Spec: the manual-work reduction spec, spec 2 of 3 (S1 to S4, S8)

## Context

Finding what a person still does by hand around `/emet:run` took a manual analysis of 9,740 prompts, 70 run directories and the session transcripts. Those sources hold prompt text, not what emet decided: a launched session and a typed command look the same in the prompt history, so 744 dispatches were first read as manual work when about 22 were. emet keeps per-run files under `.emet/runs/` that are removed with the clone and that no command reads across repos.

## Decision

- emet appends its own events to one global file, `<stateDir()>/journal/events.jsonl`, the directory the slot pool already uses.
- Each line is one JSON object `{v, ts, id, kind, runId?, repo, host, origin, pid, data}` of at most 2 KiB, written with a single `appendFileSync`. `kind` is `run.start`, `gate.decision`, `intervention`, `launch.result`, `promote`, `cleanup`, `ticket.close` or `baseline`. `origin` is `human` or `auto`.
- A failed write never changes a command's output or exit code.
- The journal never records prompts, assistant text, hook input, environment variables, argv, tokens, diffs or issue bodies. `data` holds ids, codes, counts, durations and a `reason` of at most 200 characters.
- Past about 10 MiB the next append takes a non-blocking lock, renames the file to a numbered segment and keeps the five newest. A process that does not get the lock appends to the current file.
- `emet insights` reads every segment, skips and counts lines it cannot parse, and reports only events after the latest `baseline` unless asked for all.
- **Prompt wording exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to the paragraphs of `emet/reference/phases-8-closeout.md`, `emet/reference/phases-9-handoff.md`, `emet/reference/tracker-linear.md` and `commands/run.md` that describe the three-line summary, the push notification, the Linear reconcile step, the tool-exhaustion check, the language settings and `emet insights`. They are reworded in the one ticket of spec 2 that owns prompts and docs. The explicit ticket [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) requires for a change to the CLI's runtime behaviour is that spec's tickets.

## Consequences

- A later analysis reads one file and tells launched runs from typed ones, instead of inferring it from prompts.
- A journal on macOS relies on append-mode writes that the platform does not document as atomic. Lines stay under the size that has held in practice, and `insights` tolerates a damaged line.
- A journal on a network filesystem can interleave writes. `emet doctor` warns, without failing, when the state directory is on one.
- A rotation lock left behind by a crashed process is cleared by the existing stale-lock detection.
- The journal grows by about 2 KiB per event, capped by rotation.

## Alternatives considered

- **SQLite**: rejected because it has a single writer, busy errors under many coordinators, would be the first database in emet and cannot be read with `jq`.
- **OpenTelemetry**: rejected because it needs several packages in `emet/`, which [ADR-0001](0001-root-dev-tooling-package-separate-from-runtime.md) does not allow.
- **Claude Code hooks and transcripts**: rejected because they carry prompt text and never record what emet decided.
- **One file per repo**: rejected because a cross-repo report would have to find every clone, and the file disappears with the clone.

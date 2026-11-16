---
name: doctor
description: "Check this repo and install for emet problems with `emet doctor`, failures first. Use when emet misbehaves or before a first run, to find config, install and skill problems."
---

Run `emet doctor .` in the shell from the repository root. `emet` is on
PATH in Codex sessions.

Then summarize the result:

- Failures first, each with the fix the output suggests.
- Warnings next, one line each.
- If nothing failed or warned, say the setup is healthy.

Doctor is read-only. Never edit `~/.claude/settings.json` or run a suggested
fix command yourself; print it for the user to run.

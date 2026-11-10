---
name: init
description: "Scaffold emet config and docs in this repo with `emet init`, then summarize what was written"
---

Run `emet init` in the shell from the repository root. `emet` is on PATH
in Codex sessions.

Then summarize the result:

- Files written or updated, one line each.
- Every `TODO(emet):` marker left in those files (run `rg -n 'TODO\(emet\):'`),
  with its file and line, so the user knows what to fill in.

If the command fails, show its error output and stop; do not retry with other
flags.

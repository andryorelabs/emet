---
name: setup
description: "Choose and install the optional emet extras with `emet setup`. Use when the user wants to install the optional emet extras, such as skills, memory or Claude Code settings."
---

Offer the optional installs and run only the ones the user picks. `emet` is on
PATH in Codex sessions.

1. Run `emet setup --list --json` in the shell to get the catalog: each
   item's `id`, `label`, `defaultOn` and whether it is already `present`.
2. Ask as a multi-select question, one option per item that is
   not already present, pre-selecting nothing that has `defaultOn` false. Never
   assume a choice the user did not make.
3. If nothing was chosen, say so and stop. Otherwise run
   `emet setup --with <comma-separated ids>` in the shell.
4. Summarize each step's result (`installed`, `already-present`, `skipped` or
   `failed`), failures first, with the fix the output suggests.
5. Tell the user to run `/reload-plugins` so newly installed plugins and
   settings take effect.

Only install what was chosen. Never edit `~/.claude/settings.json` yourself;
`emet setup` backs it up first when the Claude Code settings item is chosen.
Never touch tailscale, firewalls or sudo.

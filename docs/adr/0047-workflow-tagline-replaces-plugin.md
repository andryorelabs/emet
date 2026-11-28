# 0047. Workflow tagline replaces plugin

Status: Accepted (2026-11-26)
Spec: Website home redesign to prototype v17

Amends [0044](0044-standalone-install-without-plugins.md): emet installs without plugins, so calling it "a plugin" misdescribes the primary install.
Amends the `docs/brand/voice.md` rule that names emet "a plugin for Claude Code and Codex".

## Context

Since the standalone install, emet is a CLI plus commands, agents and hooks that works on two Agent hosts, with plugins only as an option. The tagline "A plugin for Claude Code and Codex" still reads as the old distribution.

## Decision

- The descriptive tagline is **"A workflow for Claude Code and Codex."** It replaces "plugin" on the Website, the README, `PRODUCT.md`, `llms.txt`, the brand docs, the OG images and the CLI banner. Other locales translate the same meaning without their word for "plugin".
- Technical uses of "plugin" stay: the mattpocock-skills plugin requirement, `claude plugin install emet-mascot@emet-marketplace`, `.codex-plugin/` and the optional plugin install.

## Consequences

- One tagline across site, repo, brand and CLI.
- The CLI banner text changes under the spec that decides this, as an explicit ticket per [0001](0001-root-dev-tooling-package-separate-from-runtime.md).

## Alternatives considered

- **Keep "plugin"**: rejected because the primary install no longer uses a plugin.
- **"Tool" or "CLI"**: rejected because emet is a spec-to-merge flow that runs inside the two hosts, not a standalone tool.

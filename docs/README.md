# Documentation index

An index of every document in this repository. Terms follow [GLOSSARY.md](../GLOSSARY.md). Add a row here whenever you add a document; `tools/docs-index.test.ts` fails when a document under `docs/` has no entry.

## Core

- [`README.md`](../README.md): the project front page: what emet is, a quickstart and links into the guide and reference.
- [`llms.txt`](../llms.txt): an llmstxt.org index of the guide, reference and project pages for language models.
- [`architecture.md`](architecture.md): code map of `emet/src` and how the `/emet` prompts drive the CLI.
- [`troubleshooting.md`](troubleshooting.md): `emet doctor` and `emet preflight` failures, by symptom.
- [`CHANGELOG.md`](../CHANGELOG.md): release notes, newest first.
- [`GLOSSARY.md`](../GLOSSARY.md): the domain terms every doc and prompt uses.
- [`AGENTS.md`](../AGENTS.md): instructions for coding agents.
- [`CLAUDE.md`](../CLAUDE.md): imports `AGENTS.md` for Claude Code.
- [`emet/AGENTS.md`](../emet/AGENTS.md): the runtime-only rules for work inside `emet/`.

## Contributing and community

- [`CONTRIBUTING.md`](../CONTRIBUTING.md): setup, branch and commit format, and CI.
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md): community standards.
- [`GOVERNANCE.md`](../GOVERNANCE.md): decision process.
- [`SECURITY.md`](../.github/SECURITY.md): how to report vulnerabilities.
- [`SUPPORT.md`](../.github/SUPPORT.md): where to ask for help.
- [`PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md): the checklist every PR shows.

## Guide

- [`guide/getting-started.md`](guide/getting-started.md): requirements, both install paths and the first run.
- [`guide/trackers-and-landing.md`](guide/trackers-and-landing.md): GitHub, Linear and local trackers, `landing.mode`, landing PRs, chaining waves, budgets, living specs, map and metrics.
- [`guide/models-and-effort.md`](guide/models-and-effort.md): the role, model and effort table, risk-tier routing, Haiku triage and what you set once.
- [`guide/codex.md`](guide/codex.md): run emet on Codex CLI: install, `agentHost`, the single approval by hook, limits and `unverified` points.
- [`guide/fleet.md`](guide/fleet.md): audit several repos at once with `emet doctor`.

## Reference

- [`reference/configuration.md`](reference/configuration.md): every `emet.config.json` key with its default and meaning.
- [`reference/cli.md`](reference/cli.md): every `emet` subcommand, the gates and records table, exit codes and `EMET_*` environment variables.
- [`reference/dependencies.md`](reference/dependencies.md): what emet needs installed and which of init, doctor and preflight checks each item.

## How-to guides

- [`how-to/mascot.md`](how-to/mascot.md): install the optional `emet-mascot` plugin, read the phase file it follows and import the Orca pet bundle.
- [`how-to/update-emet.md`](how-to/update-emet.md): update the emet and emet-mascot plugins by hand or turn on marketplace auto-update.
- [`how-to/cut-a-release.md`](how-to/cut-a-release.md): the release runbook: version bump, changelog, develop to main PR, tag and the CI-gated release.

## Decisions

- [`adr/README.md`](adr/README.md): the architecture decision record index, one file per decision (`adr/NNNN-*.md`).

## Research

- [`research/codex-viability.md`](research/codex-viability.md): whether emet can run on Codex CLI: capability matrix, parity table, integration models A, B and C, a ten-experiment spike and a follow-up spec outline.

## Brand

Research for the brand kit, run 1. Options and recommendations only; no decision is made here.

- [`brand/README.md`](brand/README.md): index of the brand research and the decisions still pending.
- [`brand/brief.md`](brand/brief.md): the approved brand brief: position, audience, voice, what to avoid and closed decisions.
- [`brand/voice.md`](brand/voice.md): the emet voice: we are, we are not, tone by context, terminology and the avoid list.
- [`brand/apply-spec.md`](brand/apply-spec.md): where each kit asset will be used, how to regenerate the rasters and the manual steps.
- [`brand/copy.md`](brand/copy.md): approved public copy with the claims checked against the CLI and the open short description.
- [`brand/tokens.css`](brand/tokens.css): emet design tokens: P2 Moss palette in oklch (light and dark), T2 fonts and type scale.
- [`brand/naming.md`](brand/naming.md): the selected name `emet`, its story, availability and risks.
- [`brand/competitors.md`](brand/competitors.md): tools that orchestrate coding agents, with positioning lessons.
- [`brand/mascot-research.md`](brand/mascot-research.md): developer-tool mascot cases, a checklist and four directions.
- [`brand/naming-candidates.md`](brand/naming-candidates.md): the rename study, with the availability filter and /70 scoring.
- [`brand/research-notes/competitors-2026-11-04.md`](brand/research-notes/competitors-2026-11-04.md): raw competitor notes.
- [`brand/research-notes/mascots-cases.md`](brand/research-notes/mascots-cases.md): raw mascot case notes.
- [`brand/research-notes/mascots-modern-abstract.md`](brand/research-notes/mascots-modern-abstract.md): how modern tools build abstract mascots, principles and golem silhouette ideas.
- [`brand/research-notes/naming-checks.md`](brand/research-notes/naming-checks.md): availability check commands and results.
- [`brand/research-notes/naming-category-search.md`](brand/research-notes/naming-category-search.md): same-name agent tools found per finalist.
- [`brand/explorations/emet-mascot-r3.html`](brand/explorations/emet-mascot-r3.html): mascot round 3, six solarpunk-mood ideas with palette sets.
- [`brand/explorations/emet-mascot-r4.html`](brand/explorations/emet-mascot-r4.html): mascot round 4, A fixed, D refined and two hybrids.
- [`brand/explorations/emet-mascot-r5.html`](brand/explorations/emet-mascot-r5.html): mascot round 5, A1-M and a COMBO beside the r4 originals.
- [`brand/explorations/emet-palette-r2.html`](brand/explorations/emet-palette-r2.html): palette round 2 for emet, four options from the approved mascot.
- [`brand/explorations/fonts/OFL.md`](brand/explorations/fonts/OFL.md): licenses of the typography sheet fonts.
- [`brand/brandbook/fonts/OFL.md`](brand/brandbook/fonts/OFL.md): licenses of the two brandbook fonts, Space Grotesk and JetBrains Mono.
- [`brand/explorations/emet-logo-r2.html`](brand/explorations/emet-logo-r2.html): logo round 2, five marks derived from the brand parts, with lockups, icon and mocks.

## Design

- [`design/README.md`](design/README.md): the design canvases, one per area, and where their build notes live.

## Per-repo `/emet` config

Prose that `emet init` generates and the coordinator reads.

- [`agents/emet.md`](agents/emet.md): commands, gates and concurrency for this repo.
- [`agents/issue-tracker.md`](agents/issue-tracker.md): how the tracker is used.
- [`agents/triage-labels.md`](agents/triage-labels.md): the label vocabulary.
- [`agents/domain.md`](agents/domain.md): where the domain docs live.
- [`agents/codebase.md`](agents/codebase.md): the generated codebase map.

## Prompts

Installed prompt markdown; wording changes only with an explicit ticket (ADR-0001).

- [`commands/run.md`](../commands/run.md): the `/emet:run` router.
- [`agents/emet-worker.md`](../agents/emet-worker.md): the worker agent.
- [`agents/emet-reviewer.md`](../agents/emet-reviewer.md): the reviewer agent.
- [`emet/reference/phases-1-5.md`](../emet/reference/phases-1-5.md): interview to approval.
- [`emet/reference/phases-6-7-dispatch.md`](../emet/reference/phases-6-7-dispatch.md): dispatch and workers.
- [`emet/reference/phases-8-closeout.md`](../emet/reference/phases-8-closeout.md): review, landing and closeout.
- [`emet/reference/phases-9-handoff.md`](../emet/reference/phases-9-handoff.md): handoff and chaining.
- [`emet/reference/worker-prompt.md`](../emet/reference/worker-prompt.md): the worker prompt template.
- [`emet/reference/reviewer-prompt.md`](../emet/reference/reviewer-prompt.md): the reviewer prompt template.
- [`emet/reference/incidents.md`](../emet/reference/incidents.md): known harness incidents.
- [`emet/reference/tracker-github.md`](../emet/reference/tracker-github.md): GitHub Issues tracker steps.
- [`emet/reference/tracker-linear.md`](../emet/reference/tracker-linear.md): Linear tracker steps.
- [`emet/reference/tracker-local.md`](../emet/reference/tracker-local.md): local markdown tracker steps.

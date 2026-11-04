# Documentation index

An index of every document in this repository. Terms follow [GLOSSARY.md](../GLOSSARY.md). Add a row here whenever you add a document; `tools/docs-index.test.ts` fails when a document under `docs/` has no entry.

## Core

- [`README.md`](../README.md): install, requirements, usage and the config reference.
- [`architecture.md`](architecture.md): code map of `forge/src` and how the `/forge:run` prompts drive the CLI.
- [`troubleshooting.md`](troubleshooting.md): `forge doctor` and `forge preflight` failures, by symptom.
- [`CHANGELOG.md`](../CHANGELOG.md): release notes, newest first.
- [`GLOSSARY.md`](../GLOSSARY.md): the domain terms every doc and prompt uses.
- [`AGENTS.md`](../AGENTS.md): instructions for coding agents.
- [`CLAUDE.md`](../CLAUDE.md): imports `AGENTS.md` for Claude Code.
- [`forge/AGENTS.md`](../forge/AGENTS.md): the runtime-only rules for work inside `forge/`.

## Contributing and community

- [`CONTRIBUTING.md`](../CONTRIBUTING.md): setup, branch and commit format, and CI.
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md): community standards.
- [`GOVERNANCE.md`](../GOVERNANCE.md): decision process.
- [`SECURITY.md`](../.github/SECURITY.md): how to report vulnerabilities.
- [`SUPPORT.md`](../.github/SUPPORT.md): where to ask for help.
- [`PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md): the checklist every PR shows.

## How-to guides

- [`how-to/cut-a-release.md`](how-to/cut-a-release.md): the release runbook: version bump, changelog, develop to main PR, tag and the CI-gated release.

## Decisions

- [`adr/README.md`](adr/README.md): the architecture decision record index, one file per decision (`adr/NNNN-*.md`).

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

## Per-repo `/forge` config

Prose that `forge init` generates and the coordinator reads.

- [`agents/forge.md`](agents/forge.md): commands, gates and concurrency for this repo.
- [`agents/issue-tracker.md`](agents/issue-tracker.md): how the tracker is used.
- [`agents/triage-labels.md`](agents/triage-labels.md): the label vocabulary.
- [`agents/domain.md`](agents/domain.md): where the domain docs live.
- [`agents/codebase.md`](agents/codebase.md): the generated codebase map.

## Prompts

Installed prompt markdown; wording changes only with an explicit ticket (ADR-0001).

- [`commands/run.md`](../commands/run.md): the `/forge:run` router.
- [`commands/forge.md`](../commands/forge.md): the same router, installed as `/forge`.
- [`agents/forge-worker.md`](../agents/forge-worker.md): the worker agent.
- [`agents/forge-reviewer.md`](../agents/forge-reviewer.md): the reviewer agent.
- [`forge/reference/phases-1-5.md`](../forge/reference/phases-1-5.md): interview to approval.
- [`forge/reference/phases-6-7-dispatch.md`](../forge/reference/phases-6-7-dispatch.md): dispatch and workers.
- [`forge/reference/phases-8-closeout.md`](../forge/reference/phases-8-closeout.md): review, landing and closeout.
- [`forge/reference/phases-9-handoff.md`](../forge/reference/phases-9-handoff.md): handoff and chaining.
- [`forge/reference/worker-prompt.md`](../forge/reference/worker-prompt.md): the worker prompt template.
- [`forge/reference/reviewer-prompt.md`](../forge/reference/reviewer-prompt.md): the reviewer prompt template.
- [`forge/reference/incidents.md`](../forge/reference/incidents.md): known harness incidents.
- [`forge/reference/tracker-github.md`](../forge/reference/tracker-github.md): GitHub Issues tracker steps.
- [`forge/reference/tracker-linear.md`](../forge/reference/tracker-linear.md): Linear tracker steps.
- [`forge/reference/tracker-local.md`](../forge/reference/tracker-local.md): local markdown tracker steps.

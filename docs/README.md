# Documentation index

An index of every document in this repository. Terms follow [GLOSSARY.md](../GLOSSARY.md). Add a row here whenever you add a document; `tools/docs-index.test.ts` fails when a document under `docs/` has no entry.

## Core

- [`README.md`](../README.md): install, requirements, usage and the config reference.
- [`architecture.md`](architecture.md): code map of `forge/src` and how the `/forge:run` prompts drive the CLI.
- [`troubleshooting.md`](troubleshooting.md): `forge doctor` and `forge preflight` failures, by symptom.
- [`CHANGELOG.md`](../CHANGELOG.md): release notes, newest first.
- [`GLOSSARY.md`](../GLOSSARY.md): the domain terms every doc and prompt uses.
- [`AGENTS.md`](../AGENTS.md): instructions for coding agents (`CLAUDE.md` imports it).
- [`forge/AGENTS.md`](../forge/AGENTS.md): the runtime-only rules for work inside `forge/`.

## Contributing and community

- [`CONTRIBUTING.md`](../CONTRIBUTING.md): setup, branch and commit format, and CI.
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md): community standards.
- [`GOVERNANCE.md`](../GOVERNANCE.md): decision process.
- [`SECURITY.md`](../.github/SECURITY.md): how to report vulnerabilities.
- [`SUPPORT.md`](../.github/SUPPORT.md): where to ask for help.
- [`PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md): the checklist every PR shows.

## Decisions

- [`adr/README.md`](adr/README.md): the architecture decision record index, one file per decision (`adr/NNNN-*.md`).

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

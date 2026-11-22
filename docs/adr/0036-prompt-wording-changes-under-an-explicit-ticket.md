# 0036. Prompt wording changes under an explicit ticket

Status: Accepted (2026-11-21)
Spec: #763 (S1)
Amended by [0039](0039-quick-mode-lands-per-wave.md): it names two more paragraphs.

Amends [0001](0001-root-dev-tooling-package-separate-from-runtime.md): the rule that installed prompt markdown changes only in whitespace and wrapping.

## Context

[0001](0001-root-dev-tooling-package-separate-from-runtime.md) freezes the wording of installed prompt markdown (`emet/reference/*.md`, `commands/*.md`, `agents/*.md`). Each time a ticket needed a wording change, an ADR carved out one paragraph: [0013](0013-cleanup-owns-worker-worktree-lifecycle.md), [0029](0029-gate-fixes-findings-and-continues.md), [0030](0030-global-event-journal.md), [0031](0031-after-spec-step-and-optional-setup.md), [0032](0032-agent-browser-recommended-ui-verification.md) and [0033](0033-coupled-surfaces-ship-in-one-wave.md). The exceptions pile up and each costs an ADR for a one-paragraph edit.

## Decision

- Installed prompt markdown may change wording in a ticket that names the paragraphs it changes. A ticket that does not name them keeps the whitespace-and-wrapping-only rule.
- The same PR raises `BYTE_CEILINGS` in `emet/src/prompts.test.ts` for the files whose size grows, and regenerates `codex/**` and the install snapshot.
- The earlier per-ADR exceptions (0013, 0029, 0030, 0031, 0032, 0033) stay as written, as history. They are not rewritten or superseded.
- `AGENTS.md`, `docs/stability.md` and the ADR index cite this ADR.

## Consequences

- A wording change needs a ticket that lists its paragraphs, which the reviewer checks against the diff, and no new ADR.
- A silent wording edit under a "whitespace only" ticket is still a violation.
- The byte ceilings stay the guard against uncontrolled prompt growth.

## Alternatives considered

- **One ADR per wording change**: rejected because it adds an ADR for each paragraph edit.
- **Drop the rule**: rejected because prompt text is the product and an unreviewed edit changes behaviour without a trace.

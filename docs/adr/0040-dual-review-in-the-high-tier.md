# 0040. Dual review in the high tier

Status: Accepted (2026-11-22)
Spec: draft #796

Amends [0036](0036-prompt-wording-changes-under-an-explicit-ticket.md) with the paragraphs each ticket of the spec names.

## Context

A wave gets one **Reviewer**. Its per-requirement verdicts are prose that nothing checks, so a `met` needs no evidence. A finding on a line the wave never touched blocks like a new one, and a finding against a requirement the user explicitly chose has no special weight. A high-risk wave still gets the same single **Reviewer** as an ordinary one.

## Decision

The CLI checks what the **Reviewer** claims, and the high tier gets a **Dual review**.

- **Coverage evidence.** `emet review --coverage` takes **Coverage verdicts** `{s, verdict, test:{file,name}}`. A `met` whose test file is missing or does not contain the test name, and an expected requirement with no verdict, become an open `verification-gap` finding of severity `major`. The CLI runs no tests: `commands.fullSuite` confirms them.
- **Pre-existing findings.** `emet review --findings --base <ref>` stores the base sha in the review ledger and marks a finding `preexisting` when its line is not an added or changed line of `git diff <base>..HEAD`. A **Pre-existing finding** never blocks the **Gate**. The base lives in the ledger, not in a `baseline.json`, because **Baseline** already names a journal event.
- **User option.** A finding may carry `userOption: "S<n>"`. It blocks at every tier and severity, even when pre-existing, and gets a **Fix round**, never a **Stop** by itself. Phase 2 marks such a requirement `(user option)`.
- **Dual review.** `emet assess` prints `dualReview: {run, reason}`, true only for the `high` tier on the Claude host with `codex` on PATH and `review.dual` not `off` (default `auto`). Then `emet:emet-reviewer` and `emet review-run --tier high` run in parallel over the same package. Without Codex, or with `review.dual: off`, one **Reviewer** runs as before.
- **Merge.** `emet review --merge a.json b.json` pairs findings by `s`, or by the same file with lines at most 3 apart. A pair is `agreement: "both"` and stays open; an unpaired finding is `single` and the **Coordinator** triages it (keep, or drop with `--rule`). A `userOption` finding is never dropped. Only the Claude **Reviewer**'s coverage is recorded.
- **Prompt exception** ([0036](0036-prompt-wording-changes-under-an-explicit-ticket.md)). Each ticket of the spec names the paragraphs it changes in `phases-1-5.md`, `reviewer-prompt.md`, `agents/emet-reviewer.md` and `phases-8-review.md`, and raises `BYTE_CEILINGS` in the same pull request.

## Consequences

- Reviewer tokens roughly double in high waves only; medium and passive waves cost the same.
- A `met` now costs the **Reviewer** a named test, and the gap is visible in the ledger.
- Every new finding field is optional, so a ledger written before this decision still loads.

## Alternatives considered

- **A stronger single reviewer at high effort**: rejected because one model shares its own blind spots, and the draft's goal was an independent second read.
- **Dual review at every tier**: rejected because it multiplies the cost of ordinary waves for little added risk coverage.
- **The CLI runs the named tests**: rejected because the integration suite already runs once per wave and a second run adds time without a new signal.
- **A `baseline.json` per run**: rejected because it collides with **Baseline** and a per-ticket ledger already owns the review state.

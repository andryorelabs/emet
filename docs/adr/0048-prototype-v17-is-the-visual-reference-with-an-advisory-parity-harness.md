# 0048. Prototype v17 is the visual reference, checked by an advisory parity harness

Status: Accepted (2026-11-26)
Spec: Website home parity with prototype v17

## Context

The home redesign landed with passing tests, axe and CSP checks, yet a side-by-side capture showed it did not match the approved prototype: type scale, widths, header, section layouts and about 25 animation timings differed. Acceptance scenarios were behavioural only, the reviewer's browser axis only looked for console errors, and nothing forced a worker to compare against the prototype.

## Decision

- `apps/site/design/prototype-v17/index.html` is the exact visual and behavioural reference for the home page. A reference effect is dropped only when the user chooses it as an explicit option.
- Allowed deviations are axe contrast, CSP, i18n, reduced motion and `pointer: coarse`; each is recorded in `apps/site/design/report.md`.
- A **Parity harness** (`bun run --cwd apps/site parity`) serves the prototype and the production build and writes **Parity captures** side by side with a diff ratio. It is advisory in CI because animated frames are not deterministic, and mandatory in review: the reviewer's browser axis and every `apps/site` worker run it and report each visible difference.
- Specs about visual or motion work carry a parity Scenario per section.

## Consequences

- Visual drift is caught in review, not by the user after the fact.
- Reviews of site tickets cost a build and a capture run.
- The installed reviewer and worker prompts gain a paragraph each, under an explicit ticket per [0036](0036-prompt-wording-changes-under-an-explicit-ticket.md).

## Alternatives considered

- **A blocking pixel-diff gate in CI**: rejected because scroll-driven and WebGL frames vary between runs and would make the gate flaky.
- **Behavioural e2e only**: rejected because it is what let the drift through.

# Review and gates

How the dual review and the gates decide whether work can land. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## A reviewer checks the wave against the spec

After a wave's branches are merged into the integration branch, a **Reviewer** reads the result in a fresh context and checks it against the spec. The reviewer is a separate agent, never the worker that wrote the code.

How much review a wave gets depends on its risk. `emet assess` classifies the diff deterministically into one of three tiers:

- `passive`: a docs-only diff. No reviewer runs.
- `medium`: an ordinary source change. One reviewer runs.
- `high`: the diff touches risky ground such as authentication, payments, CI, migrations or dangerous sinks. These waves get the **Dual review**.

## Dual review in the high tier

A `high` wave is read by two reviewers in parallel over the same package: the Claude reviewer and a Codex reviewer. One model shares its own blind spots, so a second, independent read is the point.

The coordinator then merges the two sets of findings. A finding both reviewers raise stays open as agreed. A finding only one reviewer raised is triaged by the coordinator, who keeps it or drops it with a recorded rule. A finding that contradicts a requirement you explicitly chose is never dropped.

The Dual review runs only when the tier is `high`, the host is Claude Code, the `codex` binary is on PATH and `review.dual` is not `off`. Otherwise one reviewer runs. Medium and passive waves cost the same either way, and reviewer tokens roughly double only in high waves. See [ADR-0040](../adr/0040-dual-review-in-the-high-tier.md).

## Findings are checked, not trusted

The CLI verifies what the reviewer claims:

- **Coverage verdicts.** For each requirement the reviewer says met, partial or unmet. A `met` must name a test. A `met` whose test file or test name is missing, or a requirement with no verdict, becomes an open `verification-gap` finding. The CLI runs no tests itself; the full suite on the integration branch does.
- **Pre-existing findings.** A finding on a line the wave did not add or change is reported but never blocks the gate.
- **User options.** A requirement you chose explicitly is marked as a user option. A finding against it blocks at every tier and severity, even on an untouched line, and earns a fix round, not a stop by itself.

## The gate decides

The phases never decide on their own that work may proceed. `emet gate` reads the verify record, the open findings, the risk tier, CI, the integration suite and the budgets, and prints one decision:

- `merge` or `chain`: the work may go on.
- `hold`: something emet can resolve itself is missing, such as findings it can fix or a check still running.
- `stop`: a person must rule before the run goes on.
- `defer`: the ticket failed too many attempts; it is set aside and the rest of the wave continues.

## Fix rounds

When blocking findings are open, the gate holds and asks for a **Fix round**: the coordinator corrects the open findings and a reviewer rechecks only those, not the whole diff. Fix rounds have their own budget, separate from review rounds.

The gate stops when a finding shows the spec itself was wrong, when the fix rounds run out with findings still open, or when the integration suite fails a second time after its failed specs were rerun. A CI that never ran because of the machine or the provider is retried without charging a fix attempt, and reported as an infrastructure problem the second time in a row.

For the keys, see [`review`](../reference/configuration.md#review), [`gate`](../reference/configuration.md#gate) and [`budgets`](../reference/configuration.md#budgets). For the commands, see [`emet assess`, `emet review` and `emet gate`](../reference/cli.md#gates-and-records). To choose reviewer models, see [Models and effort](../how-to/choose-models.md).

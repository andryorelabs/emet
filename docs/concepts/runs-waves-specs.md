# Runs, waves and specs

How a run, a wave and a spec relate to one another. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## The spec is the unit of work

A **Spec** is the requirements document for one feature, with numbered requirements `S1..Sn`. It is written and approved before any ticket exists, and everything after it is measured against it: each ticket names the requirements it covers on a `Covers:` line, and each requirement needs at least one ticket and an acceptance scenario. `emet validate` enforces both before the single approval. See [`emet validate`](../reference/cli.md#gates-and-records).

When a spec lands, it updates the [living specs](living-specs.md) that describe current behaviour.

## Tickets and waves

A **Ticket** is one unit of work derived from the spec, with interfaces, allowed edit surfaces and a context budget. Tickets depend on one another, so they cannot all start at once.

A **Wave** is one dependency layer: the tickets whose blockers are all done, dispatched together. The set of tickets ready to dispatch at any moment is the **Frontier**. Inside a wave the edit surfaces are disjoint, so workers never touch the same file, and each worker gets its own worktree and its own local branch.

A wave is also the unit of review: each wave gets its own review and gate, whatever the [landing unit](landing.md) is.

## A run is one execution

A **Run** is one execution of `/emet:run` for a spec. Its run id ties together the claims, worker slots, locks and results the run creates, and its records live under `.emet/runs/<run-id>/` in the main checkout.

Within a run, one session, the **Coordinator**, runs the phases, dispatches workers, merges their branches and is the only writer of the tracker. Workers report through a handoff note and a local result file, never to the tracker. See [ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md).

A **Quick run** is the small case: one spec with exactly one ticket, one interview round and one wave that lands on its own, whatever the repository's landing unit. See [ADR-0039](../adr/0039-quick-mode-lands-per-wave.md).

## How they fit together

1. The run interviews you and writes the spec, then derives tickets and groups them into waves.
2. You approve once. The approval records hashes of the spec and the ticket list, and dispatch refuses if either changed afterwards.
3. For each wave, workers implement their tickets in parallel worktrees. The coordinator merges their branches into an integration branch, and the wave goes through [review and gates](review-and-gates.md).
4. A wave that passes is [landed](landing.md), either alone or together with the rest of its spec.
5. At the end of the run the coordinator saves what it learned as [lessons](memory.md).

For the commands behind each step, see the [CLI reference](../reference/cli.md#runs-workers-and-slots) and the [gates and records](../reference/cli.md#gates-and-records) it lists.

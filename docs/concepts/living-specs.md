# Living specs

A spec in the tracker is a plan: its requirements, its tickets and its waves. Once the tickets close, the tracker no longer says what the system does. A living spec fills that gap: one file per area under `docs/specs/` that describes the current behaviour, kept current by the same pull request that changes it. Terms follow [GLOSSARY.md](../../GLOSSARY.md); the decision is in [ADR-0038](../adr/0038-living-specs-hold-current-behaviour.md).

## What a living spec holds

Each area has one file. It is a list of requirements, and each requirement has a descriptive name, a `Source: #<spec> S<n>` line pointing at the spec item that introduced it, and one or more scenarios in a WHEN and THEN form. The source line matters because S numbers are local to one spec, so the name itself never uses one.

A living spec describes behaviour, not work: nothing in it says what is planned or who does it. That stays in the tracker.

## How a spec updates it

Living specs are opt-in, through `specs.enabled`. When it is on, the update happens once per spec, on the spec's last wave:

1. The coordinator reads the current living spec of each affected area.
2. For each requirement the spec touches, it decides whether the requirement is added, modified or removed, and writes the result as a spec delta in a directory shared by every worktree of the repo.
3. `emet spec-merge` folds the deltas into the files under `docs/specs/`. It never runs git; the coordinator commits the result.
4. The commit is part of the last wave, so the review and the gates see the change to the living spec like any other change.

A merge that conflicts, or that would lose an existing scenario, writes nothing and exits with an error. The coordinator fixes the delta once; if it fails again the wave lands without the update and the report says so.

## Why the coordinator decides

Which area a requirement belongs to, and whether it is new or changes an existing one, is a judgment that needs the current file and the intent of the spec. A tool that generated deltas mechanically could not know either, so the judgment stays with the coordinator and the merge stays mechanical.

## Where it lands

With the default landing, the living-spec commit travels inside the spec branch and arrives in trunk with the single pull request. See [Landing](landing.md). With a wave as the landing unit it is part of the last wave's pull request.

## See also

- [Runs, waves and specs](runs-waves-specs.md)
- [Review and gates](review-and-gates.md)
- [Configuration reference](../reference/configuration.md) for `specs.enabled` and `specs.dir`

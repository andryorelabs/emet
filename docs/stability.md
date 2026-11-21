# Stability

What emet promises not to break, and what it reserves the right to change. Terms follow [GLOSSARY.md](../GLOSSARY.md).

## Stable surfaces

A change to a stable surface that breaks an existing caller is a breaking change. It waits for a major version and is called out in [CHANGELOG.md](../CHANGELOG.md).

- **CLI flags.** The subcommands and flags listed in the [CLI reference](reference/cli.md). A flag is not removed or given a different meaning; new flags may be added.
- **Exit codes.** `0` clean, `1` findings to act on, `2` config or usage error, `3` internal error. The prompts and scripts rely on these numbers. See [exit codes](reference/cli.md#exit-codes).
- **The config schema.** `emet.config.json` as described by [`emet/schema/emet.config.schema.json`](../emet/schema/emet.config.schema.json) and the [configuration reference](reference/configuration.md). A key is not removed or renamed without a schema `version` bump; new optional keys may be added.
- **The `--json` envelope.** The top-level shape of the JSON a command prints with `--json`. Fields are not removed or retyped; new fields may be added, so parsers must ignore fields they do not know.

## Internal surfaces

These can change in any release, without a changelog entry beyond a normal note. Do not depend on them.

- The modules under `emet/src/` and their exported functions and types.
- The prompt wording in `emet/reference/`, `commands/` and `agents/`, which changes only in a ticket that names the paragraphs ([ADR-0036](adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)).
- The shape and location of state files, ledgers and records under `.emet/`, and the host-wide slot pool.
- The generated Codex files under `codex/` and `.codex-plugin/`.
- Anything under `tools/`, `apps/` and `docs/research/`.
- The human-readable text of messages, reports and `--help` output.

## Deprecations

A stable surface is deprecated for at least one minor release before it is removed in a major one. The deprecation is announced in the changelog and, where the CLI can detect it, in a warning on stderr.

## Decisions

The decision records in [docs/adr](adr/README.md) explain why the surfaces are drawn this way. If you are unsure which side something falls on, ask in an issue before depending on it.

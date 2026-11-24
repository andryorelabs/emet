# Check a fleet of repos

Audit, change and launch emet across several repos at once. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Prerequisites

- emet installed; see [Install](../start/install.md).
- Each repo has an `emet.config.json`, and sits one level under one root (default `~/code`).
- `gh` on `PATH`, authenticated; see the [dependencies reference](../reference/dependencies.md).

## Audit the repos

:::steps

1. Run the read-only audit on any number of repos:

   ```bash
   emet doctor ~/code/*
   ```

2. Read the per-repo report: a valid `emet.config.json`, all four `docs/agents/*.md` files, no leftover `TODO(emet):` markers, `commands.selfCheck` commands that resolve, and that repo's tracker dependency findings.
3. Read the sweep-wide findings, printed once: the mattpocock-skills plugin and the external CLI flags, checked through `--help` (`gh`, and on Claude Code `claude --bg` and `claude agents --json`, on Codex `codex exec --json` and `--output-schema`). A renamed flag is reported here before it fails a wave.

:::

## Change a setting in every repo

:::steps

1. List what each repo has now:

   ```bash
   emet fleet list --root ~/code
   ```

   It prints each repo's path, `tracker.kind`, `handoff.autoChain` and `models.worker`; `--json` prints it as data.

2. Preview the change:

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` writes nothing and prints each repo's old and new value.

3. Apply it by running the same command without `--dry-run`. The value is validated through the config loader first; an invalid value modifies no repo and exits 1.

:::

## Launch a feature in several repos

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

It opens a `/emet:run --draft <text>` session in each repo, after the same readiness checks as `emet chain`. `--repos` limits it to a comma-separated list.

## See blocked sessions

```bash
emet fleet status
```

It prints, per repo, how many emet sessions are blocked on a decision, working or idle, blocked repos first. It reads the last 24 hours of the global journal and excludes ended sessions; `--json` prints the sessions. Inside one repo, `emet status` lists them under `sessions`. See [Attention and the journal](../concepts/attention-and-journal.md) and the [configuration reference](../reference/configuration.md#attention).

## Check

:::steps

1. Run `emet doctor ~/code/*` again and confirm no repo reports a failure.
2. Run `emet fleet list --root ~/code` and confirm the changed key shows the new value in every repo.
3. Run `emet fleet status` and confirm no repo is blocked unexpectedly.

:::

Each probe is capped at 5s, so a stalled `gh auth status` cannot hang a wave. `preflight.requiredCommands` is a repo-owned list of binaries that `emet preflight` and `emet doctor` require; see the [CLI reference](../reference/cli.md#fleet-check) and the [configuration reference](../reference/configuration.md#preflight).

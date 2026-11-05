# Fleet check

Already using emet across several repos? `emet doctor` audits any number of them at once, read-only:

```bash
emet doctor ~/code/*
```

Reports, per repo: valid `emet.config.json`, all four `docs/agents/*.md` files present, zero leftover `TODO(emet):` markers, whether the commands in `commands.selfCheck` actually resolve, and that repo's tracker-specific dependency findings (`gh`, Linear; see the [dependencies reference](../reference/dependencies.md)). The mattpocock-skills plugin and the external CLI flags (`gh`, `claude --bg`, `claude agents --json`, checked via `--help`) are checked once for the whole sweep, not per repo.

`emet doctor` checks the flags themselves, not only that the binaries exist. It reads `--help` for `gh issue view`/`gh repo view` (`--json`), `gh issue edit` (`--add-label`, `--remove-label`), `claude` (`--bg`) and `claude agents` (`--json`), and reports any flag a newer or older CLI no longer documents. A renamed flag would otherwise fail a wave midway.

Every probe is capped at 5s so a stalled `gh auth status` (no network) can't hang a wave. A repo's `preflight.requiredCommands` is a repo-owned list of binaries that `emet preflight` and `emet doctor` require on PATH. See the [CLI reference](../reference/cli.md#fleet-check) and the [configuration reference](../reference/configuration.md#preflight).

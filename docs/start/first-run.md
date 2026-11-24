# First run

Check the install with `emet doctor` and run emet for the first time. Install emet first; see [Install](install.md).

## Prerequisites

- emet installed, with `emet` on your `PATH`.
- A git repo with `gh` authenticated.
- On Claude Code or Codex, the `mattpocock-skills` plugin.

## Steps

In each repo, run the `setup-matt-pocock-skills` skill first (`/setup-matt-pocock-skills` on Claude Code; on Codex, the same skill from the `mattpocock-skills` plugin with Codex's `$` skill syntax). Then, in any git repo:

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

Inside a session, `/emet:init` does the same as `emet init` (`$emet:init` on Codex). `emet init` leaves a `TODO(emet):` marker in the generated `docs/agents/*.md` files for anything it cannot infer on its own, such as a shared test-database lock or schema ownership; fill those in. `emet preflight` refuses to dispatch while one remains.

Then run emet inside Claude Code (on Codex, use `$emet:run` instead of `/emet:run`):

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## Check the result

Run `emet doctor .` in a terminal, or `/emet:doctor` inside Claude Code (`$emet:doctor` on Codex). It reports failures first. If `doctor` or `preflight` reports a problem, see [troubleshooting](../troubleshooting.md). Nothing is ever installed or logged in on your behalf; the [dependencies reference](../reference/dependencies.md) says who checks what and documents `EMET_SKIP_DEPENDENCY_CHECKS`.

## Next

- [Trackers and landing](../how-to/configure-tracker.md): GitHub, Linear or local tickets, and how a spec lands.
- [Running emet on Codex](../how-to/use-codex.md): the single approval and the limits on the Codex Agent host.
- [Models and effort](../how-to/choose-models.md): which model and effort each role uses.
- [Fleet check](../how-to/check-a-fleet.md): audit several repos at once.
- [Configuration reference](../reference/configuration.md) and [CLI reference](../reference/cli.md): every key and subcommand.

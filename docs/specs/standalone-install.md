### Requirement: Embedded install tree

Source: #899 S1

The `emet` binary embeds the install tree, generated at build time and drift-checked, so a compiled binary needs no checkout.

#### Scenario: Stale embedded tree fails the check

- **WHEN** a file under the install tree changes without regenerating the embedded tree
- **THEN** `bun run check` fails naming the stale file

#### Scenario: Compiled binary reads the tree byte-identically

- **WHEN** the compiled binary reads the embedded tree
- **THEN** every file is byte-identical to its source file

### Requirement: Self install of the Claude Code host

Source: #899 S2

`emet self install [latest|X.Y.Z] [--dry-run]` places the binary under `~/.local/share/emet/versions/<v>/emet`, links it at `~/.local/bin/emet` and writes the Claude Code files at the existing layout.

#### Scenario: Repeated install changes nothing

- **WHEN** the install runs twice
- **THEN** the second run changes nothing

#### Scenario: Edited files are kept

- **WHEN** the user edited an installed file
- **THEN** it is kept and the new version is written beside it as `<file>.new`

#### Scenario: Dry run writes nothing

- **WHEN** `--dry-run` is passed
- **THEN** every write is listed and nothing is written

### Requirement: Claude Code hooks merge

Source: #899 S3

The Claude Code adapter merges every embedded hook event into `~/.claude/settings.json` with absolute commands, a backup before writing and no change to foreign hooks.

#### Scenario: Foreign hooks are preserved

- **WHEN** `settings.json` already has other hooks
- **THEN** they keep their order and content and the emet hooks are added

#### Scenario: Merge is idempotent

- **WHEN** the install runs twice
- **THEN** no hook is duplicated

#### Scenario: Invalid settings file

- **WHEN** `settings.json` is invalid JSON
- **THEN** nothing is written and the error names the file

### Requirement: Codex host install

Source: #899 S4

The Codex adapter, when Codex is present, writes the emet skills and appends the embedded Codex hooks after existing entries without writing `config.toml`, and prints the one-time `/hooks` trust step.

#### Scenario: Foreign Codex hooks are preserved

- **WHEN** `hooks.json` already holds foreign hooks
- **THEN** they keep their position and the emet hooks follow them

#### Scenario: Codex absent

- **WHEN** Codex is absent
- **THEN** the adapter is skipped with one line and nothing is written

### Requirement: Codex worker overlay in standalone mode

Source: #899 S5

The Codex worker overlay detects the standalone install from the install state file and omits the emet plugin and marketplace tables.

#### Scenario: Standalone overlay

- **WHEN** the install state file exists
- **THEN** the overlay `config.toml` has no emet plugin tables and workers still see the emet skills

#### Scenario: Plugin overlay unchanged

- **WHEN** the install state file does not exist
- **THEN** the overlay is byte-identical to the previous behaviour

### Requirement: Self update

Source: #899 S6

`emet self update [latest|X.Y.Z]` and `emet self update --auto` download, verify and stage a release, and swap it only when no worker slot is held.

#### Scenario: Slot held defers the swap

- **WHEN** a worker slot is held
- **THEN** the symlink does not change and the update is pending

#### Scenario: Checksum failure

- **WHEN** the checksum fails
- **THEN** the current version stays and the journal records the failure

#### Scenario: Auto update disabled

- **WHEN** `EMET_AUTO_UPDATE=0`
- **THEN** `--auto` exits 0 without a network call

### Requirement: Uninstall of the standalone install

Source: #899 S7

`emet uninstall` also removes the standalone artifacts and every emet hook command in both hook files, keeping edited files and foreign hooks.

#### Scenario: Edited command file survives

- **WHEN** a user-edited command file exists
- **THEN** it survives

#### Scenario: Foreign hooks untouched

- **WHEN** foreign hooks exist
- **THEN** they are untouched

#### Scenario: Uninstall dry run

- **WHEN** `--dry-run` is passed
- **THEN** nothing is removed

### Requirement: Bootstrap script

Source: #899 S8

`scripts/install-remote.sh` is POSIX `sh`, refuses sudo, verifies the downloaded binary against `SHA256SUMS` and only then runs `emet self install`.

#### Scenario: Unsafe conditions install nothing

- **WHEN** the download is truncated, the checksum is wrong, it runs under sudo, or the platform is unsupported
- **THEN** it exits non-zero and installs nothing

#### Scenario: Verified download hands off

- **WHEN** the checksum matches
- **THEN** it hands off to `emet self install` with the given arguments

### Requirement: Source install

Source: #899 S9

`emet self install --from <checkout>` reproduces the Bun source install with a wrapper at `~/.local/bin/emet`.

#### Scenario: Source install with bun

- **WHEN** run with `--from` and `bun` present
- **THEN** the wrapper exists and runs the installed copy

#### Scenario: Source install without bun

- **WHEN** `bun` is absent
- **THEN** it fails with a message and writes nothing

### Requirement: Plugin coexistence guard and doctor checks

Source: #899 S10

`emet self install` refuses when the emet plugin is installed unless `--force`, and `emet doctor` warns about coexistence, drift from the embedded tree, untrusted Codex hooks, a pending update and auto-update being off.

#### Scenario: Plugin installed

- **WHEN** the plugin is installed
- **THEN** `self install` exits non-zero and writes nothing

#### Scenario: Untrusted Codex hook

- **WHEN** a Codex hook is untrusted
- **THEN** `doctor` prints the `/hooks` step

### Requirement: install.sh retired

Source: #899 S11

`install.sh` no longer exists in the repository and every consumer points at `emet self install` or the curl command.

#### Scenario: No stale references

- **WHEN** `git grep -n 'install\.sh'` runs
- **THEN** the only hits are ADRs, `CHANGELOG.md`, `docs/research`, `docs/brand`, the translations and the release asset name

#### Scenario: Suite passes

- **WHEN** `bun run test` runs
- **THEN** it passes

### Requirement: Standalone-first documentation

Source: #899 S12

The English docs present the standalone install first and the plugins as optional, and document uninstall, auto-update and `emet self install|update`.

#### Scenario: Links resolve

- **WHEN** `bun run lint:docs` runs
- **THEN** links resolve

#### Scenario: Curl precedes plugin commands

- **WHEN** `getting-started.md` is read
- **THEN** the curl command precedes any plugin command

### Requirement: Verification spike

Source: #899 S13

A spike records in `docs/research/standalone-install-spike.md` a PASS, FAIL or PARTIAL result with evidence and a downstream decision for each check.

#### Scenario: Blocking check fails

- **WHEN** the compiled-binary embedding check fails
- **THEN** the run stops and reports

#### Scenario: Non-blocking check fails

- **WHEN** a non-blocking check fails
- **THEN** the report names the fallback each later ticket must use

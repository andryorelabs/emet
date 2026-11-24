# Update emet

How to move an installed emet to a new release. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## Update the standalone install

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

The release is downloaded, verified against `SHA256SUMS` (and the attestation when `gh` is present) and staged. The swap of the symlink and the installed files happens only when no worker slot is held; otherwise the update stays pending and is applied at the next session start. A failure leaves the current version untouched and is recorded in the journal. The previous version is kept for rollback and older ones are pruned. `emet doctor` warns when an update is pending.

## Update automatically

A `SessionStart` hook runs `emet self update --auto` at most once a day, detached and silent when offline. To turn it off, set `EMET_AUTO_UPDATE=0` or run:

```bash
emet self update --auto off
```

`emet self update --auto on` turns it back on. Auto-update does nothing for plugin installs.

## Optional: plugins

emet and the optional `emet-mascot` plugin come from the same marketplace, `emet-marketplace`. Claude Code does not update third-party marketplaces on its own by default, and a marketplace cannot change that default for its users.

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Skip the last line when you did not install the mascot. Restart Claude Code afterwards, or run `/reload-plugins`. `claude plugin list` shows the installed versions; the latest is in [CHANGELOG.md](../../CHANGELOG.md).

To update automatically, run `/plugin` in Claude Code, open the **Marketplaces** tab, select `emet-marketplace` and choose **Enable auto-update**. Claude Code then refreshes the marketplace and updates both plugins when a session starts. Each user sets this on their own machine.

### Codex

Refresh the marketplace snapshot, then add the plugin again. Running `codex plugin marketplace add` a second time does not refresh it:

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` shows whether `emet@emet-marketplace` is installed and enabled. Auto-update is a Claude Code feature; on Codex, upgrade by hand.

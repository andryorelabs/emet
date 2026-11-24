# Update emet

How to move an installed emet plugin to a new release. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

To update the standalone install, by hand or automatically, see [Install](../start/install.md#update). This page covers plugin installs.

## Prerequisites

- emet installed as a plugin in Claude Code or Codex. For the standalone install, use [Install](../start/install.md#update) instead.

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

## Check

Run `claude plugin list` (Claude Code) or `codex plugin list` (Codex) and confirm `emet@emet-marketplace` shows the release in [CHANGELOG.md](../../CHANGELOG.md).

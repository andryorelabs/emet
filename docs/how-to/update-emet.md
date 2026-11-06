# Update emet

How to move an installed emet to a new release. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

emet and the optional `emet-mascot` plugin come from the same marketplace, `emet-marketplace`. Claude Code does not update third-party marketplaces on its own by default, and a marketplace cannot change that default for its users.

## Update by hand

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

Skip the last line when you did not install the mascot. Restart Claude Code afterwards, or run `/reload-plugins`. `claude plugin list` shows the installed versions; the latest is in [CHANGELOG.md](../../CHANGELOG.md).

## Update automatically

In Claude Code, run `/plugin`, open the **Marketplaces** tab, select `emet-marketplace` and choose **Enable auto-update**. Claude Code then refreshes the marketplace and updates both plugins when a session starts, and the next session loads the new versions. Each user sets this on their own machine.

## Installed with install.sh

Pull the latest `main` in your clone and run `./install.sh` again.

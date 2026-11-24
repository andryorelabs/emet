---
title: 更新 emet
description: 将已安装的 emet 升级到新版本，并为插件开启市场自动更新。
seoTitle: 更新 emet
sourceHash: 380b07ed5a10474f
---

如何将已安装的 emet 升级到新版本。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

## 更新独立安装

```bash
emet self update            # latest
emet self update 1.2.3      # a specific version
```

发布版本会被下载，对照 `SHA256SUMS`（存在 `gh` 时还对照证明）验证，并被暂存。只有在没有持有任何 worker 槽位时，才会切换符号链接和已安装文件；否则更新保持待处理，并在下一次会话启动时应用。失败不会改动当前版本，并会记录在日志中。上一个版本会保留以便回滚，更早的版本会被清理。当有更新待处理时，`emet doctor` 会发出警告。

## 自动更新

`SessionStart` 钩子会每天最多运行一次 `emet self update --auto`，在后台分离运行，离线时保持静默。要关闭它，请设置 `EMET_AUTO_UPDATE=0` 或运行：

```bash
emet self update --auto off
```

`emet self update --auto on` 会重新开启。自动更新对插件安装不起作用。

## 可选：插件

emet 和可选的 `emet-mascot` 插件来自同一个市场 `emet-marketplace`。Claude Code 默认不会自行更新第三方市场，而市场也无法为其用户更改这一默认设置。

### Claude Code

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

如果你没有安装吉祥物，请跳过最后一行。之后重启 Claude Code，或运行 `/reload-plugins`。`claude plugin list` 会显示已安装的版本；最新版本见 [CHANGELOG.md](../../CHANGELOG.md)。

要自动更新，请在 Claude Code 中运行 `/plugin`，打开 **Marketplaces** 标签页，选择 `emet-marketplace`，然后选择 **Enable auto-update**。此后，Claude Code 会在会话启动时刷新市场并更新这两个插件。每位用户需要在自己的机器上进行此设置。

### Codex

先刷新 marketplace 快照，再重新添加插件。再次运行 `codex plugin marketplace add` 不会刷新它：

```bash
codex plugin marketplace upgrade emet-marketplace
codex plugin add emet@emet-marketplace
```

`codex plugin list` 会显示 `emet@emet-marketplace` 是否已安装并启用。自动更新是 Claude Code 的功能；在 Codex 上请手动升级。

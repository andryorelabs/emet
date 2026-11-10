---
title: 更新 emet
description: 将已安装的 emet 升级到新版本，并为插件开启市场自动更新。
seoTitle: 更新 emet
sourceHash: 584eafb89175d6c7
---

如何将已安装的 emet 升级到新版本。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

emet 和可选的 `emet-mascot` 插件来自同一个市场 `emet-marketplace`。Claude Code 默认不会自行更新第三方市场，而市场也无法为其用户更改这一默认设置。

## 手动更新

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet@emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

如果你没有安装吉祥物，请跳过最后一行。之后重启 Claude Code，或运行 `/reload-plugins`。`claude plugin list` 会显示已安装的版本；最新版本见 [CHANGELOG.md](../../CHANGELOG.md)。

## 在 Codex 上更新

本仓库的文档中没有单独的 Codex 插件更新命令。请重新运行[在 Codex 上运行 emet](../guide/codex.md#安装)中的安装命令：

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

`codex plugin list` 会显示 `emet@emet-marketplace` 是否已安装并启用。

## 自动更新

在 Claude Code 中运行 `/plugin`，打开 **Marketplaces** 标签页，选择 `emet-marketplace`，然后选择 **Enable auto-update**。此后，Claude Code 会在会话启动时刷新市场并更新这两个插件，下一个会话会加载新版本。每位用户需要在自己的机器上进行此设置。

## 通过 install.sh 安装的情况

在你的克隆中拉取最新的 `main`，然后再次运行 `./install.sh`。

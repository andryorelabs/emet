---
title: 使用 emet 吉祥物（Claude Code 模组与 Orca 宠物）
description: 通过模组在 Claude Code 中显示 emet 吉祥物，通过宠物在 Orca 中显示。
seoTitle: 在 Claude Code 和 Orca 中使用 emet 吉祥物
sourceHash: caca9eb66e693e32
---

如何在 Claude Code 和 Orca 中显示 emet 的 **Mascot**。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

这里有两个相互独立的部分：可选的 `emet-mascot` 插件，用于在 Claude Code 中绘制吉祥物；以及 Orca 宠物包，用于让 Orca 拥有同一个角色。

## 安装吉祥物插件

该插件与 emet 发布在同一个市场中，是可选的。emet 并不需要它。

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet-mascot@emet-marketplace
```

吉祥物会跟随你的会话状态（睡眠、工作、等待、完成、错误）。当 **Run** 处于活动状态时，它还会读取 **Phase file**，并显示一个暗色标签，例如 `emet · wave 2 · review`。

插件选项：

- `position`：`pane`（默认）、`band` 或 `status`。`pane` 会将吉祥物停靠在对话记录旁边，这需要全屏布局，并且在你自己打开过一次该面板之前，终端宽度至少要有 144 列（之后约为 110 列）；当无法停靠，或终端之后变窄时，吉祥物会改为显示在提示符上方。`band` 始终将其绘制在提示符上方。`status` 只把文本标签作为插件状态行显示，不带吉祥物图案。
- `size`：`small`（16 x 8 个单元格，默认）或 `medium`（24 x 12 个单元格）。
- `showLabel`：显示或隐藏吉祥物旁边的标签（默认开启）。

## 更新吉祥物插件

Anthropic 以外的市场默认关闭自动更新，而市场也无法为其用户开启。请手动更新：

```bash
claude plugin marketplace update emet-marketplace
claude plugin update emet-mascot@emet-marketplace
```

之后重启 Claude Code。若要自动更新，请运行 `/plugin`，打开 **Marketplaces** 标签页，选择 `emet-marketplace`，然后选择 **Enable auto-update**。每位用户只需在自己的机器上进行一次。主插件的更新方法也请参见[更新 emet](update-emet.md)。

## 阶段文件

随着运行的推进，emet CLI 会在仓库中写入 `.emet/phase.json`，吉祥物大约每两秒轮询一次。超出新鲜度窗口的旧文件会被忽略，因此崩溃的运行不会留下过期的标签。

该文件包含 `phase`（`planning`、`dispatch`、`working`、`review`、`checking`、`landing`、`done` 或 `failed`）、`wave`、`spec`、`runId`、`updatedAt` 以及可选的 `outcome`。写入失败绝不会导致报告该阶段的子命令失败。

## 在 Orca 中使用宠物

宠物包位于 `docs/brand/pet/emet/`：`pet.json` 和 `spritesheet.webp`。在 Orca 的设置中，选择“Import .codex-pet bundle…”并选中该文件夹。导入时需要 `docs/brand/pet/emet/` 位于运行 Orca 应用的机器上，因此如果 Orca 不是在运行本仓库的机器上运行，请把该文件夹复制过去。修改吉祥物 SVG 之后，用 `bun run brand:export` 重新生成，并提交结果。

## 故障排除

- 没有吉祥物：运行 `claude plugin list`，确认 `emet-mascot` 已启用，然后重启 Claude Code。
- 没有标签：确认 `.emet/phase.json` 存在并且最近有更新。

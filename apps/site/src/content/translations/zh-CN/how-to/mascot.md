---
title: 使用 emet 吉祥物（Claude Code 模组与 Orca 宠物）
description: 通过模组在 Claude Code 中显示 emet 吉祥物，通过宠物在 Orca 中显示。
seoTitle: 在 Claude Code 和 Orca 中使用 emet 吉祥物
sourceHash: a6d2945308d1d44b
---

如何在 Claude Code 和 Orca 中显示 emet 的 **Mascot**。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

这里有两个相互独立的部分：可选的 `emet-mascot` 插件，用于在 Claude Code 中绘制吉祥物；以及 Orca 宠物包，用于让 Orca 拥有同一个角色。emet 并不需要它们中的任何一个。

## 前提条件

- Claude Code，用于插件。
- 已安装 emet，这样运行才会写入吉祥物所跟随的阶段文件；参见[安装](../start/install.md)。
- Orca，用于宠物。导入需要 `docs/brand/pet/emet/` 文件夹位于运行 Orca 应用的机器上。

## 安装吉祥物插件

:::steps

1. 添加市场并安装插件：

   ```bash
   claude plugin marketplace add andryorelabs/emet
   claude plugin install emet-mascot@emet-marketplace
   ```

2. 重启 Claude Code。吉祥物会跟随你的会话状态（睡眠、工作、等待、完成、错误）。当 **Run** 处于活动状态时，它还会读取阶段文件，并显示一个暗色标签，例如 `emet · wave 2 · review`。
3. 可选：设置插件选项：
   - `position`：`pane`（默认）、`band` 或 `status`。`pane` 会将吉祥物停靠在对话记录旁边，这需要全屏布局，并且在你自己打开过一次该面板之前，终端宽度至少要有 144 列（之后约为 110 列）；当无法停靠时，吉祥物会显示在提示符上方。`band` 始终将其绘制在提示符上方。`status` 只把文本标签作为状态行显示。
   - `size`：`small`（16 x 8 个单元格，默认）或 `medium`（24 x 12 个单元格）。
   - `showLabel`：显示或隐藏标签（默认开启）。

:::

## 更新吉祥物插件

Anthropic 以外的市场默认关闭自动更新，因此请手动更新，或者一次性开启自动更新。

:::steps

1. 更新市场和插件：

   ```bash
   claude plugin marketplace update emet-marketplace
   claude plugin update emet-mascot@emet-marketplace
   ```

2. 重启 Claude Code。
3. 若要自动更新，请运行 `/plugin`，打开 **Marketplaces** 标签页，选择 `emet-marketplace`，然后选择 **Enable auto-update**。每位用户只需在自己的机器上进行一次。主插件的更新方法参见[更新 emet](update-emet.md)。

:::

## 在 Orca 中使用宠物

:::steps

1. 确认 `docs/brand/pet/emet/`（`pet.json` 和 `spritesheet.webp`）位于运行 Orca 的机器上；如果 Orca 不是在运行本仓库的机器上运行，请把该文件夹复制过去。
2. 在 Orca 的设置中，选择“Import .codex-pet bundle…”并选中该文件夹。
3. 修改吉祥物 SVG 之后，用 `bun run brand:export` 重新生成宠物包，并提交结果。

:::

## 检查

:::steps

1. 运行 `claude plugin list`，确认 `emet-mascot` 已启用；如果吉祥物缺失，请重启 Claude Code。
2. 在运行期间，确认 `.emet/phase.json` 存在并且在最近几秒内有更新。吉祥物大约每两秒轮询一次，并忽略超出新鲜度窗口的旧文件，因此崩溃的运行不会留下过期的标签。该文件包含 `phase`（`planning`、`dispatch`、`working`、`review`、`checking`、`landing`、`done` 或 `failed`）、`wave`、`spec`、`runId`、`updatedAt` 以及可选的 `outcome`。
3. 在 Orca 中，确认 emet 宠物出现在宠物列表中。

:::

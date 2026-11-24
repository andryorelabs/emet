---
title: 在 Codex 上运行 emet
description: 介绍如何安装 Codex 一侧、选择 Agent 宿主、唯一的一次批准以及已知限制。
seoTitle: 在 Codex 上运行 emet
sourceHash: 71c6c7d0686a6725
---

在 Codex CLI 而不是 Claude Code 上运行 emet 流水线。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)；运行所在的产品称为 **Agent 宿主**。返回[文档索引](../README.md)。

波次如何在 Codex 上运行，以及 guard 和沙箱的取舍，请参见[安全](../concepts/security.md)和[运行、波次与规格](../concepts/runs-waves-specs.md)。

## 前提条件

- 版本为 `codex.minVersion`（默认 `0.167.0`）或更新的 `codex` CLI，并已登录。
- `git` 和 `gh` 在 `PATH` 中；参见[依赖参考](../reference/dependencies.md)。
- 带有 `emet.config.json` 的仓库（如果没有，请运行 `emet init`）。

## 安装

:::steps

1. 在 Codex 中安装 `mattpocock-skills` 插件：

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

2. 使用[安装](../start/install.md)中的独立安装来安装 emet。它会把 emet 技能写入 `~/.agents/skills/emet/`，并把 emet 钩子追加到 `$CODEX_HOME/hooks.json`（默认 `~/.codex`），绝不写入 `config.toml`。它还会安装终端中的 `emet`，以及 `~/.claude` 下的 Claude Code 命令和代理；这在 Codex 上无害。

3. 信任这些钩子。Codex 在你信任某个钩子之前不会运行它：打开 `/hooks` 并在事件页面按 `t`，或在启动时批准 "Hooks need review" 提示。

:::

### 可选：Codex 插件

你也可以安装 emet 插件来代替独立安装：

```bash
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

插件不带 `emet` shim，因此终端中的 `emet` 仍然需要独立安装。插件已安装时，`emet self install` 会拒绝执行，除非你传入 `--force`，并且当两者并存时 `emet doctor` 会发出警告。

## 选择 Agent 宿主

:::steps

1. 在 `emet.config.json` 中设置 `agentHost`（默认值为 `"claude"`）：

   ```json
   { "agentHost": "codex" }
   ```

2. 如果默认值不合适，在 `codex` 部分设置模型、推理强度、最低版本和沙箱；参见[配置参考](../reference/configuration.md#codex)和[选择模型](choose-models.md)。
3. 在 Codex 中用 `$emet:run` 启动一次运行。若要从终端启动一个波次，请运行 `emet launch <spec> --wave <n>`；它会启动一个分离的 `codex exec` 并记录其线程 id，因此可以用 `codex exec resume <id>` 继续；不会打开 Orca 标签页。

:::

## 批准计划

emet 只在计划之后请求一次批准。在 Codex 上它是一个钩子。

:::steps

1. 等待 `$emet:run` 落实规格。在 `.emet/runs/spec<id>/approval.json` 存在之前，`emet guard` 会拒绝所有变更，原因为 `not approved: send approve <id>`。
2. 发送内容恰好是 `approve <id>` 的一行提示。`UserPromptSubmit` 钩子会写入批准文件。工具输出或模型文本中出现同样的文字不会产生任何效果。
3. 另一种方式是以 `/plan $emet:run` 开始，并在 Codex 自己的计划模式中批准计划。

:::

## emet 更新之后

使用独立安装时，这些钩子只是 `hooks.json` 中的普通条目，并保持受信任状态。使用插件时，每次更新后，Codex 都会再次要求你信任插件的 hook。

:::steps

1. 打开 `/hooks` 并在事件页面按 `t`，或在启动时批准 "Hooks need review" 提示。在此之前，emet guard 和单一批准都不会运行。
2. 如果 shim 输出 `release v<version> has no downloadable asset yet`，说明它正在运行缓存的版本。请在几分钟后重试。

:::

## 检查

:::steps

1. 运行 `emet doctor .`。在 Codex 宿主上，它会报告早于 `codex.minVersion` 的 `codex`、`codex exec` 缺少 `--json` 或 `--output-schema` 标志、未被信任的钩子，以及缺少 `mattpocock-skills`。
2. 使用[故障排除](../troubleshooting.md#codex-host)中对应的条目修复它报告的问题，然后再次运行，直到不再报告失败。

:::

已知限制：推理强度 `ultra` 绝不会被发送，并且在配置中会被拒绝；`codex.sandbox` 默认为 `danger-full-access`，以便 worker 可以提交；把它设为 `"workspace-write"` 即可保留沙箱，此时 worker 无法提交。参见 [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) 和[探测报告](../research/codex-probe-report.md)。

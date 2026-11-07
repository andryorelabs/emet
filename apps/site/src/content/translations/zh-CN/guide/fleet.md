---
title: 批量检查
description: 用 emet doctor 以只读方式一次审计多个仓库，并查看哪些仓库需要处理。
seoTitle: 使用 emet doctor 批量检查仓库
sourceHash: 14501ffced8e07f0
---

已经在多个仓库中使用 emet 了吗？`emet doctor` 可以以只读方式一次审计任意数量的仓库：

```bash
emet doctor ~/code/*
```

它会逐个仓库报告：`emet.config.json` 是否有效、四个 `docs/agents/*.md` 文件是否齐全、是否没有遗留的 `TODO(emet):` 标记、`commands.selfCheck` 中的命令是否真的可以解析，以及该仓库与跟踪器相关的依赖检查结果（`gh`、Linear，参见[依赖参考](../reference/dependencies.md)）。mattpocock-skills 插件和外部 CLI 的标志（`gh`、`claude --bg`、`claude agents --json`，通过 `--help` 检查）在整次扫描中只检查一次，而不是每个仓库检查一次。

`emet doctor` 检查的是标志本身，而不仅仅是二进制文件是否存在。它会读取 `gh issue view`/`gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`）、`claude`（`--bg`）和 `claude agents`（`--json`）的 `--help`，并报告较新或较旧的 CLI 不再记录的任何标志。否则，标志被重命名可能导致波次在中途失败。

每次探测都限制在 5 秒内，因此卡住的 `gh auth status`（没有网络）不会使波次挂起。仓库的 `preflight.requiredCommands` 是由仓库自行维护的二进制文件列表，`emet preflight` 和 `emet doctor` 要求这些文件位于 PATH 中。参见 [CLI 参考](../reference/cli.md#批量检查)和[配置参考](../reference/configuration.md#preflight)。

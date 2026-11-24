---
title: 批量检查
description: 用 emet doctor 以只读方式一次审计多个仓库，并查看哪些仓库需要处理。
seoTitle: 使用 emet doctor 批量检查仓库
sourceHash: 511c25889b2a8244
---

在多个仓库中一次性审计、修改并启动 emet。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

## 前提条件

- 已安装 emet；参见[安装](../start/install.md)。
- 每个仓库都有 `emet.config.json`，并且位于同一个根目录（默认 `~/code`）下的一级目录中。
- `gh` 在 `PATH` 中并已完成认证；参见[依赖参考](../reference/dependencies.md)。

## 审计仓库

:::steps

1. 对任意数量的仓库运行只读审计：

   ```bash
   emet doctor ~/code/*
   ```

2. 阅读每个仓库的报告：`emet.config.json` 是否有效、四个 `docs/agents/*.md` 文件是否齐全、是否没有遗留的 `TODO(emet):` 标记、`commands.selfCheck` 中的命令是否可以解析，以及该仓库与跟踪器相关的依赖检查结果。
3. 阅读整次扫描的发现（只打印一次）：mattpocock-skills 插件和外部 CLI 的标志，通过 `--help` 检查（`gh`；在 Claude Code 上是 `claude --bg` 和 `claude agents --json`，在 Codex 上是 `codex exec --json` 和 `--output-schema`）。被重命名的标志会在这里先于波次失败被报告出来。

:::

## 在每个仓库中修改一项设置

:::steps

1. 列出每个仓库目前的设置：

   ```bash
   emet fleet list --root ~/code
   ```

   它会打印每个仓库的路径、`tracker.kind`、`handoff.autoChain` 和 `models.worker`；`--json` 以数据形式输出。

2. 预览这项修改：

   ```bash
   emet fleet set handoff.autoChain false --dry-run
   ```

   `--dry-run` 不写入任何内容，并打印每个仓库的旧值和新值。

3. 运行不带 `--dry-run` 的同一条命令来应用修改。该值会先通过配置加载器验证；无效值不会修改任何仓库，并以退出码 1 结束。

:::

## 在多个仓库中启动一个功能

```bash
emet fleet launch --feature "add dark mode" --repos app,site
```

它会在每个仓库中打开一个 `/emet:run --draft <text>` 会话，并先执行与 `emet chain` 相同的就绪检查。`--repos` 可将范围限制为以逗号分隔的列表。

## 查看被阻塞的会话

```bash
emet fleet status
```

它会按仓库打印有多少个 emet 会话被决定阻塞、在工作或空闲，被阻塞的仓库排在最前。它读取全局 journal 最近 24 小时的内容，并排除已结束的会话；`--json` 打印会话。在单个仓库内，`emet status` 会在 `sessions` 下列出它们。参见[注意力与 journal](../concepts/attention-and-journal.md)和[配置参考](../reference/configuration.md#attention)。

## 检查

:::steps

1. 再次运行 `emet doctor ~/code/*`，确认没有仓库报告失败。
2. 运行 `emet fleet list --root ~/code`，确认被修改的键在每个仓库中都显示新值。
3. 运行 `emet fleet status`，确认没有仓库意外被阻塞。

:::

每次探测都限制在 5 秒内，因此卡住的 `gh auth status` 不会使波次挂起。`preflight.requiredCommands` 是由仓库自行维护的二进制文件列表，`emet preflight` 和 `emet doctor` 要求这些文件位于 PATH 中；参见 [CLI 参考](../reference/cli.md#fleet-check)和[配置参考](../reference/configuration.md#preflight)。

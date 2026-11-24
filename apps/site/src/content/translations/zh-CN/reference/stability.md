---
title: 稳定性
description: emet 承诺不会破坏什么，以及保留哪些可以更改的权利。
seoTitle: emet 稳定性
sourceHash: 5a596d218f43a27d
---

emet 承诺不会破坏什么，以及保留哪些可以更改的权利。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

## 稳定的接口面

对稳定接口面做出会破坏现有调用方的更改，属于破坏性变更。它要等到主版本才会发布，并在 [CHANGELOG.md](../../CHANGELOG.md) 中明确说明。

- **CLI 标志。** [CLI 参考](cli.md)中列出的子命令和标志。标志不会被移除，也不会被赋予不同的含义；可以新增标志。
- **退出码。** `0` 表示正常，`1` 表示有需要处理的发现，`2` 表示配置或用法错误，`3` 表示内部错误。提示词和脚本依赖这些数字。参见[退出码](cli.md#退出码)。
- **配置模式。** 由 [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json) 和[配置参考](configuration.md)描述的 `emet.config.json`。不提升模式的 `version`，就不会移除或重命名任何键；可以新增可选键。
- **`--json` 信封。** 命令在使用 `--json` 时打印的 JSON 的顶层结构。字段不会被移除或更改类型；可以新增字段，因此解析器必须忽略自己不认识的字段。

## 内部接口面

这些内容可能在任何版本中更改，除常规说明外不会有变更日志条目。请不要依赖它们。

- `emet/src/` 下的模块及其导出的函数和类型。
- `emet/reference/`、`commands/` 和 `agents/` 中的提示词措辞，仅在点名具体段落的工单中才会更改（[ADR-0036](../adr/0036-prompt-wording-changes-under-an-explicit-ticket.md)）。
- `.emet/` 下的状态文件、台账和记录的结构与位置，以及主机级槽位池。
- `codex/` 和 `.codex-plugin/` 下生成的 Codex 文件。
- `tools/`、`apps/` 和 `docs/research/` 下的所有内容。
- 消息、报告和 `--help` 输出中供人阅读的文字。

## 弃用

稳定的接口面在主版本中被移除之前，至少会先在一个次版本中处于弃用状态。弃用会在变更日志中公布；CLI 能够检测到的地方，还会在 stderr 上给出警告。

## 决策

[docs/adr](../adr/README.md) 中的决策记录解释了接口面为何这样划分。如果你不确定某项内容属于哪一边，请在依赖它之前先在 issue 中询问。

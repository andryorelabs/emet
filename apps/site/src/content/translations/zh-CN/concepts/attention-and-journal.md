---
title: 注意力与日志
description: emet 如何把自身事件记录到全局日志，以及如何得知会话正在等你。
seoTitle: emet 中的注意力与日志
sourceHash: 378e84638489f44f
---

emet 把自身的事件记录在一个全局日志中。其中一类事件会告诉你某个会话正在等你。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)；相关决策见 [ADR-0030](../adr/0030-global-event-journal.md) 和 [ADR-0042](../adr/0042-session-attention-state-in-the-journal.md)。

## 日志

日志是一个仅追加的 JSON 行文件，每行一个事件，位于同时存放工作者槽位池的主机级状态目录中。因为它是全局的，所以之后的分析能够区分由 `emet launch` 或 `emet chain` 启动的运行与人手动输入启动的运行：每个事件都带有它的仓库、宿主，以及值为 `human` 或 `auto` 的来源。

由现有命令写入事件：启动一次运行、一次关卡决定、无人值守波次中的一次人工介入、一次启动结果、一个已关闭的工单、一次清理、一次基线标记，以及规格分支的集成、落地或放弃。

### 它从不记录什么

提示词、助手文本、hook 输入、环境变量、argv、令牌、diff 和问题正文。一个事件只包含 id、代码、计数、时长和一个简短的原因。超过 2 KiB 的事件会丢失其数据并被标记为已截断。

### 失败与轮转

无法写入的日志绝不会改变命令的输出或退出码。当文件超过约 10 MiB 时，下一次追加会把它移到一个带编号的分段并保留最新的五个。在网络文件系统上并发写入可能交错，因此当状态目录位于其上时，`emet doctor` 会发出警告，但不会失败。

### 读取日志

`emet insights` 读取每个分段，并按来源报告运行、关卡决定、介入、启动结果、规格事件和已关闭的工单。默认情况下，它覆盖最近一次基线以来的事件；`--mark-baseline` 会从现在开始计数。它会跳过无法解析的行并对其计数，日志为空时输出一份全零的报告。由于该文件是纯 JSON 行，`jq` 也可以处理它。参见 [CLI 参考](../reference/cli.md#runs-workers-and-slots)。

## 注意力

一次运行可能卡在权限提示或某个问题上而无人查看。注意力回答的是“某个会话需要我吗？”。

由 emet 拥有的运行的每个会话处于四种状态之一：

- **working**：代理正在行动。
- **needs-decision**：代理在等待某个人，例如等待权限提示或问题。“Blocked”是它的另一种说法。
- **idle**：代理已停止，正在等待下一个提示。
- **ended**：会话已结束。

主机上已安装的 `emet guard` hook 会察觉这些转换，并且只在状态改变时才向日志追加一个 `session.attention` 事件，因此没有第二个存储。当会话运行在 emet 工作者的 worktree 中，或者运行在有 emet 配置且存在未完成运行的仓库中时，它就算由 emet 拥有。在 Codex 上没有通知事件，因此停止就是 idle，除非运行有一个 blocked 结果，那就是 needs-decision。

该事件包含会话 id、旧状态和新状态、触发原因以及运行 id。它从不包含通知文本、工具名称或工具输入。记录从不阻塞：失败会被吞掉，权限对话框保持不变。

### 提醒

进入 needs-decision 时会发出一次提醒：当 Orca 运行时可达时，在该 worktree 上放一个 Orca 未读标记，否则在可用时发出桌面通知。emet 从不清除它，`attention.alert` 可以将其关闭。

### 在哪里看到

`emet status` 列出各会话及其状态，并且即使没有波次在运行，被阻塞的会话也会把整体状态提升为 needs-decision。`emet fleet status` 在多个仓库间显示同样的内容。

## 另请参阅

- [运行、波次与规格](runs-waves-specs.md)
- [安全](security.md)
- [配置参考](../reference/configuration.md)中的 `attention.alert`

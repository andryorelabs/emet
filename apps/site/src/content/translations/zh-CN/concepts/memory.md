---
title: 记忆
description: emet 在多次运行之间记住什么，以及保存在哪里。
seoTitle: emet 中的记忆
sourceHash: 9053ca5dd53acba7
---

emet 在多次运行之间记住什么，以及保存在哪里。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

## 经验教训

运行是无人值守的，因此它学到的东西会随会话一起消失。在运行结束时，协调者会保存 1 到 5 条关于哪些有帮助或有妨碍的简短要点，称为 **Lessons**（经验教训），连同这次运行的结果：landed、chained、hold、stop 或 blocked。每条要点都是单独的一行短句。

经验教训按规格保存，记在每个仓库一份的笔记中，因此同一仓库上之后的运行可以读到之前的运行学到了什么。过大的笔记会先丢弃最旧的小节。

## 保存在哪里

经验教训保存在 [Engram](https://github.com/Gentleman-Programming/engram) 中，这是一个独立的本地记忆存储，不在你的仓库里，也不在跟踪器里。只有当 PATH 中有 `engram` 二进制文件并且它应答握手时，emet 才会使用它。

如果 Engram 缺失、损坏或被关闭，`emet memory` 会报告记忆不可用并成功退出。记忆从不阻塞运行。

## 如何使用

在运行开始时，第一轮访谈之前，协调者会在记忆中搜索与该功能匹配的经验教训。相关的会放入计划中的“Prior lessons”标题之下，使访谈和计划从之前运行的发现出发。当什么都没找到或记忆不可用时，运行会用一行说明这一点，然后继续。

## 手动使用

`emet memory search` 和 `emet memory save` 是普通的 CLI 命令，因此你可以自己搜索或添加经验教训。要为某个仓库关闭记忆，请把 `memory.enabled` 设置为 `off`。

相关命令，参见 [`emet memory`](../reference/cli.md#runs-workers-and-slots)。相关键，参见 [`memory`](../reference/configuration.md#memory)。运行在整体流程中的位置，见[运行、波次与规格](runs-waves-specs.md)。

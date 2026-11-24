---
title: 概览
description: emet 是什么、一次运行会做什么，以及接下来该去哪里。
seoTitle: emet 概览
sourceHash: 8627801ad3b7d807
---

emet 是什么、一次运行会做什么，以及接下来该去哪里。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

<img src="../brand/mascot/mascot-done.svg" alt="emet 吉祥物，已完成" width="96" align="right">

emet 在 Claude Code 或 Codex CLI 中，针对任意 git 仓库，并配合 Linear、GitHub Issues 或本地工单，把一个功能从想法推进到合并的变更。你只需描述一次功能，并批准一次规格和工单；其余部分无人值守地运行。

## 一次运行会做什么

1. `/emet:run`（在 Codex 上是 `$emet:run`）对你进行访谈并编写规格。
2. 它把规格拆分为工单，并请求一次批准。
3. 并行的 worker 在各自的 git 工作树中实现每个工单。
4. 评审会检查每个波次，并且 CI 必须为绿色；任何被标记的问题都会阻止合并。
5. 规格默认作为一个拉取请求落地，或作为一次本地合并落地，随后下一个波次可以接续。

## 下一步

1. [安装](install.md)：独立安装、更新、自动更新和卸载。
2. [首次运行](first-run.md)：检查安装并在仓库中运行 emet。
3. [运行、波次与规格](../concepts/runs-waves-specs.md)：一次运行的术语。
4. [跟踪器与落地](../how-to/configure-tracker.md)：GitHub、Linear 或本地工单，以及规格如何落地。

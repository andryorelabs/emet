---
title: 首次运行
description: 用 emet doctor 检查安装，并首次运行 emet。
seoTitle: emet 首次运行
sourceHash: 7daec76e45f50b8c
---

用 `emet doctor` 检查安装，并首次运行 emet。请先安装 emet；参见[安装](install.md)。

## 前提条件

- 已安装 emet，且 `emet` 在你的 `PATH` 中。
- 一个已通过 `gh` 认证的 git 仓库。
- 在 Claude Code 或 Codex 上，需要 `mattpocock-skills` 插件。

## 步骤

在每个仓库中，先运行 `setup-matt-pocock-skills` 技能（在 Claude Code 上是 `/setup-matt-pocock-skills`；在 Codex 上，用 Codex 的 `$` 技能语法运行 `mattpocock-skills` 插件中的同一技能）。然后在任意 git 仓库中：

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight     # confirms the repo is dispatch-ready
```

在会话中，`/emet:init` 的作用与 `emet init` 相同（在 Codex 上是 `$emet:init`）。对于 `emet init` 无法自行推断的内容，例如共享测试数据库锁或模式归属，它会在生成的 `docs/agents/*.md` 文件中留下 `TODO(emet):` 标记；请把这些内容补全。只要还有标记残留，`emet preflight` 就会拒绝派发。

然后在 Claude Code 中运行 emet（在 Codex 上用 `$emet:run` 代替 `/emet:run`）：

```
/emet:run <describe the feature>              # interview, then wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

## 检查结果

在终端中运行 `emet doctor .`，或在 Claude Code 中使用 `/emet:doctor`（Codex 上用 `$emet:doctor`）。它会先报告失败项。如果 `doctor` 或 `preflight` 报告了问题，请参见[故障排除](../troubleshooting.md)。系统绝不会替你安装任何东西或登录；[依赖参考](../reference/dependencies.md)说明了谁检查什么，并记录了 `EMET_SKIP_DEPENDENCY_CHECKS`。

## 下一步

- [跟踪器与落地](../how-to/configure-tracker.md)：GitHub、Linear 或本地工单，以及规格如何落地。
- [在 Codex 上运行 emet](../how-to/use-codex.md)：唯一的一次批准，以及 Codex Agent 宿主上的限制。
- [模型与推理强度](../how-to/choose-models.md)：每个角色使用的模型和推理强度。
- [批量检查](../how-to/check-a-fleet.md)：一次审计多个仓库。
- [配置参考](../reference/configuration.md)和 [CLI 参考](../reference/cli.md)：每个配置键和子命令。

---
title: 快速开始
description: 将 emet 安装为 Claude Code 插件，用 emet doctor 确认其可用，并首次运行。
seoTitle: emet 快速开始
sourceHash: 0f92cdb1a20904a3
---

安装 emet，确认其可以正常工作，并首次运行。

<img src="../brand/mascot/mascot-done.svg" alt="emet 吉祥物，已完成" width="96" align="right">

## 要求

需要 Claude Code、`git`、`gh`（已认证）和 `mattpocock-skills` 插件，运行于 Linux 或 macOS。只有从源码安装时才需要 Bun；不支持原生 Windows（请使用 WSL）。包含各项由什么检查的完整列表，见[依赖参考](../reference/dependencies.md)。

## 安装

有两种安装方式。

**插件**（无需 Bun）。将本仓库添加为市场，然后安装 `emet` 插件；它会带来 `/emet:run`、各个代理、守卫钩子，以及一个 `emet` shim，该 shim 会在首次使用时下载经过校验和验证的独立二进制文件。

```bash
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

**`install.sh`**（有无 Bun 均可使用）：

```bash
git clone git@github.com:andryorelabs/emet.git
cd emet
./install.sh
```

如果 PATH 中有 `bun`，它会把 CLI 源码复制到 `~/.claude/emet`，并把 `emet` 包装脚本复制到 `~/.local/bin/emet`。如果没有 `bun`，则改为安装独立二进制文件的 shim（`~/.local/bin/emet`，链接到 `~/.claude/emet/bin/emet`），它会在首次运行时下载二进制文件并验证校验和（需要 `curl`）。无论哪种方式，命令都会放到 `~/.claude/commands/emet/`，代理放到 `~/.claude/agents/`；提示词中的插件占位符会被改写为普通的 `~/.claude` 路径。重复运行是安全的，你编辑过的文件会被保留，新版本则写在旁边，命名为 `<file>.new`。

两种安装方式都会提供三个斜杠命令：`/emet:run`、`/emet:init` 和 `/emet:doctor`。普通终端中的 `emet` 命令只有在运行 `install.sh` 之后才可用；否则请使用斜杠命令，或在 Claude Code 会话中使用 `! emet <subcommand>`。代理名称不同：插件中是 `emet:emet-worker`，独立安装中是 `emet-worker`。

建议在每个仓库中按此顺序操作：先运行 `/setup-matt-pocock-skills`，再运行 `emet init`。

可以在 Claude Code 中用 `/emet:doctor` 验证，或在 `install.sh` 之后在终端中运行 `emet doctor .`（`selftest` 需要源码安装）。

如果 `doctor` 或 `preflight` 报告了问题，请参见[故障排除](../troubleshooting.md)。系统绝不会替你安装任何东西或登录；谁检查什么以及 `EMET_SKIP_DEPENDENCY_CHECKS`，请参见[依赖参考](../reference/dependencies.md)。

## 首次运行

在任意 git 仓库中：

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

在会话中，`/emet:init` 的作用与 `emet init` 相同。然后在 Claude Code 中：

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

对于 `emet init` 无法自行推断的内容（共享测试数据库锁、模式归属等），它会在生成的 `docs/agents/*.md` 文件中留下 `TODO(emet):` 标记；请把这些内容补全。只要还有标记残留，`emet preflight` 就会拒绝派发。

## 下一步

- [跟踪器与落地](trackers-and-landing.md)：GitHub、Linear 或本地工单，以及波次如何落地。
- [模型与推理强度](models-and-effort.md)：每个角色使用的模型和推理强度。
- [批量检查](fleet.md)：一次审计多个仓库。
- [配置参考](../reference/configuration.md)和 [CLI 参考](../reference/cli.md)：每个配置键和子命令。

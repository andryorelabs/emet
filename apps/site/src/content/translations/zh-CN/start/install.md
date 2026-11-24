---
title: 快速开始
description: 将 emet 安装为 Claude Code 插件，用 emet doctor 确认其可用，并首次运行。
seoTitle: emet 快速开始
sourceHash: ce83e38591b3de64
---

安装 emet，确认其可以正常工作，并首次运行。

<img src="../brand/mascot/mascot-done.svg" alt="emet 吉祥物，已完成" width="96" align="right">

## 要求

需要 Claude Code 或 Codex CLI、`git`、`gh`（已认证）和 `mattpocock-skills` 插件，运行于 Linux 或 macOS。只有 `emet self install --from` 才需要 Bun；不支持原生 Windows（请使用 WSL）。包含各项由什么检查的完整列表，见[依赖参考](../reference/dependencies.md)。

## 安装

在终端中运行引导脚本。无需 Bun，无需克隆仓库，也无需 sudo：

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh
```

脚本拒绝在 sudo 下运行，会把适用于你平台的独立二进制文件和 `SHA256SUMS` 下载到临时目录，验证校验和（存在 `gh` 时还会验证证明），然后才交给 `emet self install`。如果任何检查失败，就不会写入任何内容。它不会编辑你的 shell 配置文件；如果 `~/.local/bin` 不在 `PATH` 中，请自行添加。

`emet self install` 会把二进制文件放到 `~/.local/share/emet/versions/<version>/emet`，并从 `~/.local/bin/emet` 链接到它。随后它写入 Claude Code 的文件：参考提示词写入 `~/.claude/emet/`，命令写入 `~/.claude/commands/emet/`，代理写入 `~/.claude/agents/`，提示词中的插件占位符会被改写为普通的 `~/.claude` 路径。它会在备份后把 emet 钩子合并进 `~/.claude/settings.json`，并保留其他钩子不动。当存在 Codex 时，它还会把 emet 技能写入 `~/.agents/skills/emet/`，并把 emet 钩子追加到 `$CODEX_HOME/hooks.json`（默认 `~/.codex`）；它绝不写入 `config.toml`。重复运行是安全的，你编辑过的文件会被保留，新版本则写在旁边，命名为 `<file>.new`。

要预览所有写入而不实际写入，请传入 `--dry-run`。`sh -s --` 之后的参数会传给 `emet self install`：

```bash
curl -fsSL https://emet.andryore.dev/install.sh | sh -s -- --dry-run
```

你也可以固定版本，例如 `sh -s -- 1.2.3`；默认是 `latest`。如果要从检出目录安装，请运行 `emet self install --from <checkout>`；它需要 `bun`，并让 `emet selftest` 保持可用。

### Codex

当存在 Codex 时，`emet self install` 会打印一个一次性步骤：在 Codex 中打开 `/hooks`，并在事件页面按 `t` 信任 emet 钩子（或在启动时批准 "Hooks need review" 提示）。在此之前，emet guard 不会运行。参见[在 Codex 上运行 emet](codex.md#安装)。

### 自动更新

`SessionStart` 钩子会每天最多运行一次 `emet self update --auto`，在后台分离运行，离线时保持静默。它会验证校验和，暂存新版本，并且只有在没有持有任何 worker 槽位时才切换符号链接；否则更新会保持待处理，直到下一次会话启动。上一个版本会保留以便回滚。要关闭它，请设置 `EMET_AUTO_UPDATE=0` 或运行 `emet self update --auto off`；`emet self update --auto on` 会重新开启。参见[更新 emet](../how-to/update-emet.md)。

### 卸载

```bash
emet uninstall --dry-run     # list what would be removed
emet uninstall
```

它会删除 versions 目录、`~/.local/bin/emet` 符号链接、安装状态文件、Codex 技能以及两个钩子文件中的每一个 emet 钩子，并还原 `emet setup` 记录的附加项。你编辑过的命令文件和其他钩子会被保留。参见 [CLI 参考](../reference/cli.md#setup-ledger-and-restore)。

### 可选：插件

除了独立安装之外，或者为了可选的 `emet-mascot`，你也可以把 emet 安装为插件。当 emet 插件已安装时，`emet self install` 会拒绝执行并说明如何移除它；`--force` 则强行继续，并且当两者并存时 `emet doctor` 会发出警告。插件包含什么取决于 Agent 宿主。在 Claude Code 上，它会带来 `/emet:run`、各个代理、守卫钩子，以及一个 `emet` shim，该 shim 会在首次使用时下载经过校验和验证的独立二进制文件。Codex 插件提供 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能以及一个钩子，但没有代理，也没有 `emet` shim。

:::install-tabs

```bash tab="Claude Code"
claude plugin marketplace add andryorelabs/emet
claude plugin install emet@emet-marketplace
```

```bash tab="Codex"
codex plugin marketplace add andryorelabs/emet
codex plugin add emet@emet-marketplace
```

:::

每种安装都提供相同的三个入口。在 Claude Code 上是斜杠命令 `/emet:run`、`/emet:init` 和 `/emet:doctor`；在 Codex 上是 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能。独立安装还会把 `emet` 放到你的 `PATH` 上，因此 `emet init` 和 `emet doctor .` 可以在普通终端中使用；只安装插件时，请使用斜杠命令，或在 Claude Code 或 Codex 会话中使用 `! emet <subcommand>`。在 Claude Code 上，代理名称不同：插件中是 `emet:emet-worker`，独立安装中是 `emet-worker`。Codex 没有 emet 代理，因为每个 worker 都是各自独立的 `codex exec` 进程。

建议在每个仓库中按此顺序操作：先运行 `setup-matt-pocock-skills` 技能（在 Claude Code 上是 `/setup-matt-pocock-skills`；在 Codex 上，用 Codex 的 `$` 语法运行 `mattpocock-skills` 插件中的同一技能），再运行 `emet init`。

可以在 Claude Code 中用 `/emet:doctor`（Codex 上用 `$emet:doctor`）验证，或在终端中运行 `emet doctor .`（`selftest` 需要 `--from` 源码安装）。

如果 `doctor` 或 `preflight` 报告了问题，请参见[故障排除](../troubleshooting.md)。系统绝不会替你安装任何东西或登录；谁检查什么以及 `EMET_SKIP_DEPENDENCY_CHECKS`，请参见[依赖参考](../reference/dependencies.md)。

## 首次运行

在任意 git 仓库中：

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

在会话中，`/emet:init` 的作用与 `emet init` 相同。然后在 Claude Code 中（在 Codex 上用 `$emet:run` 代替 `/emet:run`）：

```
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

对于 `emet init` 无法自行推断的内容（共享测试数据库锁、模式归属等），它会在生成的 `docs/agents/*.md` 文件中留下 `TODO(emet):` 标记；请把这些内容补全。只要还有标记残留，`emet preflight` 就会拒绝派发。

## 下一步

- [跟踪器与落地](trackers-and-landing.md)：GitHub、Linear 或本地工单，以及波次如何落地。
- [在 Codex 上运行 emet](codex.md)：安装、唯一的一次批准，以及 Codex Agent 宿主上的限制。
- [模型与推理强度](models-and-effort.md)：每个角色使用的模型和推理强度。
- [批量检查](fleet.md)：一次审计多个仓库。
- [配置参考](../reference/configuration.md)和 [CLI 参考](../reference/cli.md)：每个配置键和子命令。

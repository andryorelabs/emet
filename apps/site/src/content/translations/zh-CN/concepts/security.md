---
title: 安全
description: emet 如何限制无人值守的运行可能造成的破坏。
seoTitle: emet 的安全
sourceHash: 359a25043b1d24d9
---

emet 如何限制无人值守的运行可能造成的破坏。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。要报告漏洞，参见 [SECURITY.md](../../.github/SECURITY.md)。

## 无人值守运行的威胁模型

在唯一一次批准之后，`/emet:run` 会派发工作者，他们在无人看守的情况下编辑文件、运行 shell 命令并提交。随之而来的风险：

- **破坏性命令。** 工作者，或它读到的文本，运行了递归强制删除、破坏性的 SQL 语句或强制推送。
- **写入受保护分支。** 工作者推送到 `main` 或 `develop` 并跳过评审。
- **逃出 worktree。** 工作者编辑主检出或同级的 worktree。
- **伪造批准。** 代理自己写入批准记录，而不是等待人来批准。
- **不可信输入。** 工单文本、评论、网页和工具输出带有针对代理的指令。

控制措施是分层的。没有任何一层是沙箱，也没有任何一层可以取代对落地拉取请求的评审。

## 权限模式

在 Claude Code 上，工作者以 `handoff.permissionMode` 中的权限模式运行，默认为 `bypassPermissions`，因此不会有提示打断无人值守的波次。在该模式下，剩下的控制措施就是 `emet guard` hook。

在 Codex CLI 上，工作者默认不带沙箱运行（[ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)），因为 `workspace-write` 沙箱会阻止在链接的 worktree 中提交，也会阻止 Codex 协调者使用 `emet dispatch`。批准是一个 hook 决定，手动写入 `approval.json` 会被拒绝。参见 [Codex 指南](../how-to/use-codex.md)。

只有协调者写入跟踪器（[ADR-0005](../adr/0005-coordinator-is-the-single-tracker-writer.md)），工作者只提交到本地分支（[ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)）。

## 防护覆盖什么

**`emet guard`**（`emet/src/guard-destructive.ts`）是安装在主机上的 PreToolUse hook。它拒绝破坏性的 shell 命令和 SQL 客户端，能看穿 `env`、`sudo`、`timeout` 和 `xargs` 等包装器，并保护运行目录。

**`rm-guard`**（`.claude/hooks/rm-guard.ts`）是本仓库自己的、作用于 Bash 的 PreToolUse hook。它按 `;`、`&&`、`||`、管道和换行拆分命令，包括 `sh -c` 内部的文本，并拒绝任何递归强制 `rm`（`-rf`、`-fr`、`-r -f`、`--recursive --force`），除非每个目标都严格解析到 `/tmp` 或操作系统临时目录之下。仓库内的任何位置都不在名单上，因此 `.emet/` 下的递归强制删除同样会被拒绝。使用 `$`、反引号或 `~` 的目标会被拒绝，因为它们无法解析。

`.claude/settings.json` 中的 **推送拒绝规则** 会阻止 `git push origin main` 和 `git push origin develop`，以及 `HEAD:main` 和 `HEAD:develop` 形式。`pre-push` Git hook 拒绝相同的引用，以及任何不在允许模式之内的分支名。允许推送标签。

**规则集** 在 GitHub 上强制执行同样的规则：`main` 和 `develop` 上禁止删除和非快进更新、要求检查通过，并保护 `v*` 标签。参见 [development.md](../development.md#rulesets)。

## 它们不覆盖什么

- 防护不认识的命令，例如写到磁盘上稍后再运行的脚本。
- 网络访问：工作者仍然可以调用其凭据允许的任何 API。
- 对 worktree 之外文件的读取。
- 由 `bun install` 安装的恶意依赖。

把工单文本、评论和获取的页面当作数据。合并之前评审落地的拉取请求，并让机密远离运行所继承的环境。

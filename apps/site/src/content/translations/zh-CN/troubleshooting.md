---
title: 故障排除
description: 按你看到的现象归类 emet doctor 和 emet preflight 的失败，并给出各自的原因与修复方法。
seoTitle: emet doctor 与 preflight 故障排除
sourceHash: c1ebb76c9250d743
---

按你看到的现象归类 `emet doctor` 和 `emet preflight` 的失败，并给出各自的原因与修复方法。术语遵循 [GLOSSARY.md](../GLOSSARY.md)。各项检查如何配合，参见[架构](architecture.md)。

<img src="brand/mascot/mascot-error.svg" alt="" width="96">

仅保留 `forge.config.json`、`.forge/` 或 `FORGE_*` 变量的仓库仍可继续工作：`emet` 会读取旧名称，打印一行点名每个旧文件的 stderr 信息，而 `emet migrate` 会将它们重命名。

- [no emet.config.json](#no-emetconfigjson)
- [emet.config.json is malformed](#emetconfigjson-is-malformed)
- [docs/agents still has TODO(emet) markers](#docsagents-still-has-todoemet-markers)
- [依赖检查失败](#依赖检查失败)
- [no longer documents a flag in --help](#no-longer-documents-a-flag-in---help)
- [已安装的文件缺失或在安装后被编辑过](#已安装的文件缺失或在安装后被编辑过)
- [Stop hook error: forge: No such file or directory](#stop-hook-error-forge-no-such-file-or-directory)
- [没有空闲的工作者槽位](#没有空闲的工作者槽位)
- [锁定的工作树比预期的少](#锁定的工作树比预期的少)
- [一个工单被多个工作树或分支认领](#一个工单被多个工作树或分支认领)
- [requiredCommands not on PATH](#requiredcommands-not-on-path)
- [另请参阅](#另请参阅)

## no emet.config.json

**症状：** `emet doctor` 打印 `no emet.config.json — run "emet init" here`。

**原因：** 该仓库还没有 `/emet` 配置。

**修复：** 在仓库根目录运行 `emet init`，然后检查生成的配置并填写 `docs/agents/` 中的文件。

## emet.config.json is malformed

**症状：** `emet.config.json is malformed: <reason>`；`emet preflight` 以退出码 2 退出。

**原因：** 配置是严格的 JSON，并根据 `emet/schema/emet.config.schema.json` 校验。注释和末尾逗号会被拒绝。

**修复：** 修正原因中指出的字段，或使用 `emet init --force` 重新生成。

## docs/agents still has TODO(emet) markers

**症状：** `docs/agents/ still has N TODO(emet): marker(s)`；`emet doctor` 还会报告缺少 `docs/agents/<file>`。

**原因：** `emet init` 会在任何无法检测到值的位置留下一个标记。

**修复：** 填写每个带标记的行，或解决它们之后运行 `emet init --force`。只要还有标记残留，preflight 就会拒绝派发。

## 依赖检查失败

**症状：** `emet doctor` 中出现 `dependency: ...` 行，或 `emet preflight` 中出现阻止性的依赖失败（例如 `gh` 缺失或未认证，或者 mattpocock-skills 插件缺失或版本未经测试）。

**原因：** `/emet` 需要 `git`、`gh` 和 mattpocock-skills 插件；参见 `emet/src/dependencies.ts` 和 `emet/src/skills.ts`。

**修复：** 安装或认证该工具，或运行 `setup-matt-pocock-skills` 技能（在 Claude Code 上是 `/setup-matt-pocock-skills`，在 Codex 上通过 Codex 的 `$` 语法调用同一技能）。如果某项检查对你的环境来说是错误的，`EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` 会将其降级为警告。

## no longer documents a flag in --help

**症状：** `<tool> no longer documents <flags> in --help — emet relies on it`，或 `could not be run — cannot verify <flags>`。

**原因：** `emet doctor` 检查的是 `emet` 所依赖的标志，而不仅仅是二进制文件是否存在。已安装的版本移除或重命名了其中一个。

**修复：** 安装仍然记录该标志的工具版本。

## 已安装的文件缺失或在安装后被编辑过

**症状：** `~/<path> is missing — re-run install.sh` 或 `~/<path> was edited since install`。

**原因：** 已安装的副本与安装清单不再一致。

**修复：** 重新运行 `install.sh`。如果被编辑的文件旁边存在待处理的 `.new` 文件，请合并或删除它。

## Stop hook error: forge: No such file or directory

**症状：** Claude Code 在每一轮结束时打印 `Stop hook error: … forge: No such file or directory`（或对 `emet` 的同样信息）。

**原因：** `~/.claude/settings.json` 中仍有 `forge guard` 或 `emet guard` 钩子，而其二进制文件已被移动或删除。

**修复：** 运行 `emet doctor .`。它会列出每个失效的守卫钩子及其事件，并打印一条 `cp … && jq …` 命令，用来备份 `settings.json` 并仅移除这些钩子。doctor 本身从不编辑该文件。

## 没有空闲的工作者槽位

**症状：** `No free worker slots at all: 0 free out of N`，或 `only K/N worker slot(s) free`。

**原因：** `~/.local/state/emet/slots` 中的每个槽位都被存活或空闲的运行占用，因此波次无法完整派发。

**修复：** 等待某个运行释放槽位，或对你确知已经结束的运行执行 `emet cleanup --run <runId>`。`emet status` 会显示谁占用了什么。

## 锁定的工作树比预期的少

<img src="brand/mascot/mascot-sleep.svg" alt="" width="64">

**症状：** `Expected N locked worktree(s) for run <id>, found M`。

**原因：** 工作者没有用锁定原因认领其工作树，或者 `isolation: "worktree"` 把它们放到了别处。参见 [`incidents.md`](../emet/reference/incidents.md)。

**修复：** 用 `git worktree list --porcelain` 检查已锁定的条目，并用 `emet lock-reason` 查看预期的原因格式。

## 一个工单被多个工作树或分支认领

**症状：** `<ticket> is claimed by N worktrees`、`has N branches`，或 `is checked out on branch ..., but its own lock names ticket ...`。

**原因：** 重试或被错误路由的 shell 留下了重复项。

**修复：** 保留规范的工作树或分支，删除或重新锁定其余的，然后重新运行 `emet preflight`。

## requiredCommands not on PATH

**症状：** `preflight.requiredCommands not on PATH: <names>`。

**原因：** `emet.config.json` 中的 `preflight.requiredCommands` 列出了仓库所需的二进制文件。

**修复：** 安装所指明的二进制文件，如果不再需要，则从配置中移除它们。

## Codex 宿主

这些情况适用于 `agentHost` 为 `"codex"` 时。参见[在 Codex 上运行 emet](guide/codex.md)。

**`codex` 比 `codex.minVersion` 旧。** `emet doctor .` 会报告。请安装版本不低于 `codex.minVersion`（默认 `0.167.0`）的 `codex` CLI，然后再次运行 `emet doctor .`。

**缺少 `--json` 或 `--output-schema` 标志。** `emet doctor .` 会报告未记录这两个标志之一的 `codex exec`，而 emet 启动 worker 和评审都依赖这两个标志。请安装仍记录它们的 `codex` 版本。

**配置的模型不在列表中。** emet 会根据运行主目录中的 `models_cache.json` 解析模型，否则根据你真实 Codex 主目录中的该文件（只读）。不在列表中的 slug 会被替换，并记录这次替换。如果什么都解析不出，`emet review-run` 会在调用模型之前失败，并指出角色和已列出的 slug。请在 `codex.models` 中设置列表中的 slug；参见[配置参考](reference/configuration.md#codex)。

## 另请参阅

- [文档索引](README.md)
- [README](../README.md)
- [快速开始](guide/getting-started.md)
- [配置参考](reference/configuration.md)
- [依赖参考](reference/dependencies.md)

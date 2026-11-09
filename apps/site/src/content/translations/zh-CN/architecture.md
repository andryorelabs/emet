---
title: 架构
description: emet/src 的代码地图，以及 /emet 提示词如何驱动它。
seoTitle: emet 架构
sourceHash: 3145bbde94eade03
---

`emet/src` 的代码地图，以及 `/emet` 提示词如何驱动它。术语遵循 [GLOSSARY.md](../GLOSSARY.md)；这种结构背后的决策见 [docs/adr](adr/README.md)。遇到问题时，参见[故障排除](troubleshooting.md)。

- [结构](#结构)
- [提示词如何驱动 CLI](#提示词如何驱动-cli)
- [模块地图](#模块地图)
- [提示词布局](#提示词布局)
- [分发](#分发)
- [另请参阅](#另请参阅)

## 结构

整体分为两部分。提示词（`commands/run.md`、`agents/*.md`、`emet/reference/*.md`）告诉 Claude 在每个阶段要做什么。`emet` CLI（`emet/bin/emet.ts` 和 `emet/src/`）负责所有必须具有确定性的事情：检查、认领、槽位、关卡、跟踪器写入和落地。提示词不会重新实现 CLI 已经做过的检查。

`emet/bin/emet.ts` 是一个很薄的分发器：它读取第一个参数，并把控制权交给某一个子命令模块，由该模块自己读取 `process.argv` 的其余部分。退出码在各个子命令之间含义一致。

## 提示词如何驱动 CLI

`commands/run.md` 是一个简短的路由器。它每次只加载 `emet/reference/` 中的一个阶段文件，因此压缩上下文时不会丢失当前阶段的规则。

| 阶段                       | 提示词                                       | CLI 调用                                                                      |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| 1-5 访谈、规格、工单、批准 | `phases-1-5.md`                              | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                |
| 6-7 派发与工作者           | `phases-6-7-dispatch.md`, `worker-prompt.md` | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results` |
| 8 评审、关卡、落地、收尾   | `phases-8-closeout.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `cleanup`     |
| 9 交接与串联               | `phases-9-handoff.md`                        | `status`, `metrics`, `usage`, `spec-merge`                                    |

协调者是唯一写入跟踪器的角色（ADR-0005）：工作者通过交接笔记和 `emet results` 报告，由协调者发布。`emet guard` 作为 `PreToolUse` 钩子运行，阻止已知会导致无人值守运行失败的操作。

## 模块地图

每个模块旁边都有一个 `*.test.ts`。

| 领域         | 模块                                                                                                                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 设置与审计   | `init.ts`（配置和文档骨架）、`config.ts`（`emet.config.json`，旧版 `forge.config.json` 仍会读取）、`doctor.ts`（批量扫描）、`preflight.ts`（派发卫生）、`dependencies.ts`、`skills.ts`（mattpocock-skills 契约）、`map.ts`（代码库概览） |
| 运行状态     | `claims.ts`（工单预留）、`slots.ts`（工作者槽位池）、`resources.ts`（主机信息）、`runs.ts`（存活判断）、`locks.ts`、`lockreason.ts`、`proctree.ts`、`worktrees.ts`、`cleanup.ts`、`status.ts`、`launch.ts`                               |
| 跟踪器       | `tracker.ts`、`tracker-files.ts`（本地 `.scratch/` 跟踪器）、`validate.ts`（规格覆盖）、`specmerge.ts`、`approve.ts`、`surfaces.ts`（编辑范围重叠）                                                                                      |
| 工作者交接   | `handoff.ts`、`results.ts`、`materializelog.ts`                                                                                                                                                                                          |
| 评审与落地   | `verify.ts`、`reviewpackage.ts`、`review.ts`（问题台账）、`assess.ts`（风险分类器）、`gate.ts`、`land.ts`                                                                                                                                |
| 报告         | `metrics.ts`、`usage.ts`                                                                                                                                                                                                                 |
| 安全         | `guard.ts`、`guard-destructive.ts`                                                                                                                                                                                                       |
| 共享辅助模块 | `narrow.ts`、`optional.ts`、`assets.ts`（嵌入编译后二进制文件中的文件）                                                                                                                                                                  |

与宿主相关的值位于 `agenthost.ts` 中的 `AgentHost` 接口之后：`agenthost-claude.ts` 是 Claude Code 适配器，`agenthost-codex.ts` 是 Codex 适配器，由配置中的 `agentHost` 选择。Codex 一侧新增 `codex-models.ts`（模型解析）、`codex-home.ts`（每次运行的 `CODEX_HOME` 覆盖层）、`codex-process.ts` 和 `codex-session.ts`（进程运行器与交接）、`codex-usage.ts`（从 `exec --json` 读取用量）、`guard-codex.ts`（hook 输入与批准闸门）、`dispatch.ts` 和 `review-run.ts`。参见 [Codex 指南](guide/codex.md)。

## 提示词布局

`commands/run.md`（约 130 行）是 `/emet` 的路由器。`emet/reference/` 中的每个文件是一个阶段组（`phases-1-5.md`、`phases-6-7-dispatch.md`、`phases-8-closeout.md`、`phases-9-handoff.md`），只在当前运行的模式需要时才加载。只要其中任何一个超过 20,000 字节，测试就会失败，因此不会有单个文件在压缩上下文之后占满上下文。各阶段会告诉协调者在每一轮修复或评审之前重新阅读相关章节。`install.sh` 会把旧的单个 `phases-6-9.md` 移到一旁并命名为 `phases-6-9.md.retired`（当你编辑过它，或它早于安装清单时），否则就删除它。`install.sh` 还会把 `emet guard` 作为 `PreToolUse` 钩子接入 `~/.claude/settings.json`。

## 分发

`install.sh` 会把 `emet/` 复制到 `~/.claude/emet` 并改写提示词。插件路径则提供一个 shim，它会下载由 `tools/build-binaries.ts` 构建、经过校验和验证的独立二进制文件。参见 [ADR-0008](adr/0008-standalone-binaries-and-plugin-distribution.md)。

## 另请参阅

- [快速开始](guide/getting-started.md)和[跟踪器与落地](guide/trackers-and-landing.md)
- [配置参考](reference/configuration.md)、[CLI 参考](reference/cli.md)和[依赖](reference/dependencies.md)
- [AGENTS.md](../AGENTS.md) 和 [emet/AGENTS.md](../emet/AGENTS.md)
- [文档索引](README.md)

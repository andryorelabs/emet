---
title: 架构
description: emet/src 的代码地图，以及 /emet 提示词如何驱动它。
seoTitle: emet 架构
sourceHash: ac65f41cf78af13e
---

`emet/src` 的代码地图，以及 `/emet` 提示词如何驱动它。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)；这种结构背后的决策见 [docs/adr](../adr/README.md)。遇到问题时，参见[故障排除](../troubleshooting.md)。

- [结构](#结构)
- [提示词如何驱动 CLI](#提示词如何驱动-cli)
- [模块地图](#模块地图)
- [提示词布局](#提示词布局)
- [分发](#分发)
- [另请参阅](#另请参阅)

## 结构

整体分为两部分。提示词（`commands/run.md`、`agents/*.md`、`emet/reference/*.md`，以及为 Codex 生成的 `codex/skills/**` 和 `codex/hooks.json`）告诉代理在每个阶段要做什么。`emet` CLI（`emet/bin/emet.ts` 和 `emet/src/`）负责所有必须具有确定性的事情：检查、认领、槽位、关卡、跟踪器写入和落地。提示词不会重新实现 CLI 已经做过的检查。

`emet/bin/emet.ts` 是一个很薄的分发器：它读取第一个参数，并把控制权交给某一个子命令模块，由该模块自己读取 `process.argv` 的其余部分。退出码在各个子命令之间含义一致。

## 提示词如何驱动 CLI

`commands/run.md` 是一个简短的路由器。它每次只加载 `emet/reference/` 中的一个阶段文件，因此压缩上下文时不会丢失当前阶段的规则。

| 阶段                       | 提示词                                                                                        | CLI 调用                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1-5 访谈、规格、工单、批准 | `phases-1-5.md`                                                                               | `init`, `doctor`, `validate`, `surfaces`, `approve`, `tracker`                                         |
| 6-7 派发与工作者           | `phases-6-7-dispatch.md`, `worker-prompt.md`                                                  | `preflight`, `claims`, `slots`, `launch`, `lock-reason`, `handoff`, `results`                          |
| 8 评审、关卡、落地、收尾   | `phases-8-review.md`, `phases-8-landing.md`, `phases-8-spec-landing.md`, `reviewer-prompt.md` | `verify`, `review-package`, `review`, `assess`, `gate`, `land`, `spec-branch`, `spec-merge`, `cleanup` |
| 9 交接与串联               | `phases-9-handoff.md`                                                                         | `status`, `metrics`, `usage`                                                                           |

协调者是唯一写入跟踪器的角色（ADR-0005）：工作者通过交接笔记和 `emet results` 报告，由协调者发布。`emet guard` 作为 `PreToolUse` 钩子运行，阻止已知会导致无人值守运行失败的操作。

## 模块地图

每个模块旁边都有一个 `*.test.ts`。当 `emet/src` 中某个非测试模块没有出现在此列表中时，`tools/architecture-map.test.ts` 会失败。

**设置、安装与审计**

- `init.ts` 写入配置和文档骨架；`config.ts` 读取 `emet.config.json`（旧版 `forge.config.json` 仍会读取）；`names.ts` 把名称解析为其当前或旧版写法。
- `doctor.ts` 是批量扫描；`preflight.ts` 检查派发卫生；`dependencies.ts` 和 `skills.ts`（mattpocock-skills 契约）检查运行所需的内容；`map.ts` 写入代码库概览；`plugin-detect.ts` 报告已安装的插件。
- `setup.ts` 安装可选的附加项，`setupledger.ts` 记录每次更改以便撤销，`settingsapply.ts` 保存推荐的 Claude Code 设置。
- `self.ts`、`self-install.ts`、`self-source.ts`、`self-types.ts`、`self-update.ts`、`self-host-claude.ts` 和 `self-host-codex.ts` 实现 `emet self`：安装、源码安装、更新以及各宿主的文件。`hooks-merge.ts` 把 emet 的钩子合并到宿主设置中，`uninstall.ts` 依据台账撤销一次安装，`migrate.ts` 迁移旧名称，`update-notice.ts` 和 `whats-new.ts` 向用户告知新版本，`embedded-tree.generated.ts` 保存嵌入编译后二进制文件中的文件。
- `assets.ts` 读取这些嵌入的文件。

**运行状态**

- `claims.ts` 保存工单预留，`slots.ts` 保存工作者槽位池，`resources.ts` 保存主机信息，`runs.ts` 负责存活判断，`runcurrent.ts` 记录某个检出当前的运行。
- `locks.ts`、`lockreason.ts`、`proctree.ts`、`worktrees.ts`、`cleanup.ts`、`mergedpr.ts` 和 `landed.ts` 管理 worktree、锁，以及已落地分支的清理。
- `status.ts` 报告波次和会话，`launch.ts` 和 `chain.ts` 以无人值守方式启动运行和下一个波次，`fleet.ts` 跨仓库工作，`phase.ts` 记录当前阶段。
- `signals.ts` 在中断时进行清理。

**跟踪器与规格**

- `tracker.ts` 和 `tracker-files.ts`（本地 `.scratch/` 跟踪器）读写工单，`ticketclose.ts` 关闭工单，`validate.ts` 检查规格覆盖，`approve.ts` 记录批准，`surfaces.ts` 查找编辑范围重叠。
- `specmerge.ts` 把规格增量合并到活规格中；`specbranch.ts`、`speclanding.ts` 和 `specabandon.ts` 管理 `spec/<id>` 分支；`landing-unit.ts` 决定一次运行按规格还是按波次落地；`afterspec.ts` 和 `promote.ts` 执行规格之后的步骤。

**工作者交接**

- `handoff.ts`、`results.ts` 和 `materializelog.ts` 把工作者的报告传递给协调者，`mailbox.ts` 是由 CLI 拥有、供 Codex 工作者使用的邮箱。

**评审与落地**

- `verify.ts`、`reviewpackage.ts`、`review.ts`（问题台账）、`review-run.ts`（Codex 评审者）、`assess.ts`（风险分类器）、`gate.ts`、`land.ts` 和 `ci.ts` 负责检查、评审并落地一个波次。`deploycheck.ts` 运行部署后检查。

**日志、注意力与报告**

- `journal.ts` 追加事件，`insights.ts` 读取它们；`attention.ts` 记录会话的注意力状态，`attention-alert.ts` 发出提醒；`metrics.ts` 和 `usage.ts` 报告成本和结果。
- `memory.ts` 和 `engram-client.ts` 在 Engram 中搜索并保存经验教训。

**安全**

- `guard.ts`、`guard-destructive.ts` 和 `guard-codex.ts` 是防护钩子。

**命令管线与共享辅助模块**

- `commands.ts` 描述命令及其标志，`flags.ts` 描述每个命令都接受的标志，`envelope.ts` 负责 `--json` 输出，`errors.ts` 定义错误代码，`exit-codes.ts` 和 `exit-code.ts` 定义退出码，`env.ts` 是环境视图，`color.ts` 和 `banner.ts` 负责终端输出，`present.ts`、`narrow.ts` 和 `optional.ts` 是小型的类型收窄辅助模块。
- `test-preload.ts` 和 `expect-rejection.ts` 为测试提供支持。

与宿主相关的值位于 `agenthost.ts` 中的 `AgentHost` 接口之后：`agenthost-claude.ts` 是 Claude Code 适配器，`agenthost-codex.ts` 是 Codex 适配器，由配置中的 `agentHost` 选择。Codex 一侧新增 `codex-models.ts`（模型解析）、`codex-home.ts`（每次运行的 `CODEX_HOME` 覆盖层）、`codex-process.ts` 和 `codex-session.ts`（进程运行器与交接）、`codex-usage.ts`（从 `exec --json` 读取用量）、`guard-codex.ts`（hook 输入与批准闸门）以及 `dispatch.ts`。参见 [Codex 指南](../how-to/use-codex.md)。

## 提示词布局

`commands/run.md`（约 130 行）是 Claude Code 上 `/emet` 的路由器；在 Codex 上，由生成的 `codex/skills/**` 和 `codex/hooks.json` 承担这一角色。`emet/reference/` 中的每个文件是一个阶段组（`phases-1-5.md`、`phases-6-7-dispatch.md`、`phases-8-review.md`、`phases-8-landing.md`、`phases-8-spec-landing.md`、`phases-9-handoff.md`），只在当前运行的模式需要时才加载。只要其中任何一个超过 20,000 字节，测试就会失败，因此不会有单个文件在压缩上下文之后占满上下文。各阶段会告诉协调者在每一轮修复或评审之前重新阅读相关章节。`emet self install` 会删除仍与安装清单一致的残留 `phases-8-closeout.md`，否则把它移到一旁并命名为 `phases-8-closeout.md.retired`；该文件已被拆分为 `phases-8-review.md`（评审与关卡）和 `phases-8-landing.md`（落地与收尾）。`phases-8-spec-landing.md` 保存 `landing.unit: spec` 的规则：把每个波次集成到 `spec/<id>`、同步主干，并一次性落地规格。`emet self install` 还会把 emet 的钩子（其中包括作为 `PreToolUse` 钩子的 `emet guard`）合并到 `~/.claude/settings.json`。

## 分发

`emet self install` 会放置独立二进制文件，把改写后的提示词写入 `~/.claude/`，并在带 `--from <checkout>` 时把 `emet/` 源码复制到 `~/.claude/emet`。Codex 插件由 `.codex-plugin/plugin.json` 描述，它与 `codex/skills/**` 和 `codex/hooks.json` 一起通过 `bun run build:codex` 生成。Claude Code 插件路径则提供一个 shim，它会下载由 `tools/build-binaries.ts` 构建、经过校验和验证的独立二进制文件。参见 [ADR-0008](../adr/0008-standalone-binaries-and-plugin-distribution.md)。

## 另请参阅

- [快速开始](../start/install.md)和[跟踪器与落地](../how-to/configure-tracker.md)
- [配置参考](../reference/configuration.md)、[CLI 参考](../reference/cli.md)和[依赖](../reference/dependencies.md)
- [AGENTS.md](../../AGENTS.md) 和 [emet/AGENTS.md](../../emet/AGENTS.md)
- [文档索引](../README.md)

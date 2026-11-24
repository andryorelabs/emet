---
title: 跟踪器与落地
description: 工单存放在哪里，波次如何以拉取请求或本地合并的方式落地，以及波次如何串联。
seoTitle: emet 的跟踪器与落地
sourceHash: c79d8a04687b4620
---

选择工单存放在哪里、规格如何落地，以及波次是否串联。此处提到的每个配置键都在[配置参考](../reference/configuration.md)中，每个子命令都在 [CLI 参考](../reference/cli.md)中。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

<img src="../brand/mascot/mascot-work.svg" alt="emet 吉祥物，工作中" width="96" align="right">

## 前提条件

- 已安装 emet，并且有带 `emet.config.json` 的仓库；如果没有，请运行 `emet init`。
- 使用 `github` 跟踪器或 `pr` 落地时：`gh` 在 `PATH` 中并已完成认证。
- 使用 `linear` 跟踪器时：在 `.mcp.json`（或用户范围）中声明 Linear MCP 服务器。参见[依赖参考](../reference/dependencies.md)。
- 若要了解这些设置会改变什么，请阅读[落地](../concepts/landing.md)和[运行、波次与规格](../concepts/runs-waves-specs.md)。

## 选择跟踪器

:::steps

1. 在 `emet.config.json` 中把 `tracker.kind` 设为 `"linear"`、`"github"` 或 `"local"`。
2. 使用本地跟踪器时，运行 `emet init --tracker local`。规格和工单随后是主工作树 `.scratch/` 下的 Markdown 文件（不纳入版本控制）：`.scratch/<slug>/spec.md` 和 `.scratch/<slug>/issues/<NN>-<slug>.md`，每个文件都带有 `Status:` 和 `Blocked by:` 行，评论位于 `## Comments` 之下。协调者通过 `emet tracker` 读写它们。参见 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。
3. 使用其他类型时，请确认上面对应的前提条件。

:::

## 选择规格如何落地

:::steps

1. 把 `landing.mode` 设为 `"pr"`（默认）或 `"merge"`。在 `merge` 模式下，规格以一次本地合并落地到主干（`emet spec-branch land`，或在 `landing.unit: "wave"` 时按波次使用 `emet land`），用 `commands.selfCheck` 代替 CI，并且不推送。参见 [ADR-0010](../adr/0010-local-merge-landing.md)。
2. 把 `landing.unit` 设为 `"spec"`（默认，整个规格一次落地）或 `"wave"`（每个波次单独落地）。参见 [ADR-0037](../adr/0037-landing-per-spec.md)。
3. 使用 `landing.unit: "spec"` 时，在 Claude Code 设置中设定 `worktree.baseRef: "head"`，使 worker 的工作树从 `spec/<id>` 分支起步。`emet preflight` 和 `emet doctor` 会检查这一点。
4. 在 `pr` 模式下，把 `landing.specMergeMethod`（默认是合并提交）设为仓库设置和主干规则集允许的方式；不允许时 `emet doctor` 会发出警告。
5. 若要控制合并，请设置 `pr.autoMerge`（默认 `true`）和 `pr.maxCiFixAttempts`。只有在 `landing.unit: "wave"` 时才设置 `pr.mergeMethod`；规格 PR 使用第 4 步的 `landing.specMergeMethod`，并忽略它。只要有任何被标记的内容，该波次就不会被自动合并。

:::

规格分支命令（`emet spec-branch ensure`、`integrate`、`sync`、`land`、`abandon`）由协调者驱动；它们的标志见 [CLI 参考](../reference/cli.md)。

## 串联波次

后续波次在各自的会话中运行。串联默认关闭。

:::steps

1. 在 `emet.config.json` 中设置 `handoff` 部分：

   ```json
   {
     "handoff": {
       "autoChain": true,
       "launcher": "auto",
       "permissionMode": "bypassPermissions"
     }
   }
   ```

2. 在 Claude Code 上，确保 PATH 中有支持 `--bg` 的 `claude`，工作区已受信任（在该仓库中以交互方式打开一次 `claude` 并接受），并且已在交互会话中接受过一次绕过警告（`skipDangerousModePermissionPrompt`）。
3. 在 Codex 上，确保 PATH 中有版本不低于 `codex.minVersion` 的 `codex`，且 `codex exec` 带有 `--json` 和 `--output-schema`；下一个波次会作为分离的 `codex exec` 启动。参见[在 Codex 上运行 emet](use-codex.md)。
4. 把 `handoff.launcher`（仅限 Claude Code）设为 `auto`、`orca` 或 `bg`，以选择该波次是否同时打开一个 Orca 标签页。`permissionMode` 仅限 Claude Code；在 Codex 上，串联会话使用 `codex.sandbox`。
5. 若要手动在另一个会话中启动某个波次，请运行 `emet launch <spec-id> --wave <n>`，而不是直接使用 `claude --bg`。它会打印 `{ name, id, attach, orcaTab: { opened, reason } }`。

:::

只有在 PR 已合并且没有任何内容被标记时才会启动串联；如果已有 `emet-<spec-id>-*` 会话在运行则跳过；如果启动失败，则回退为打印 `/emet:run --dispatch <spec-id>`。可用 `claude agents` 或 `claude attach emet-<spec-id>-w<n>` 查看被串联的波次。

## 设置预算和可选功能

:::steps

1. 如果默认值不合适，请设置 `budgets` 部分：

   ```json
   { "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
   ```

   `workerAttempts` 是工单在被延后之前可以让 `verify` 失败的次数；`reviewRounds` 是工单在一次升级之前可以获得的评审轮数（修复轮数有自己的 `budgets.fixRounds`，默认 2）；`stallNudgeCap` 是对停滞的 worker 催促的次数。参见[评审与关卡](../concepts/review-and-gates.md)。

2. 设置 `specs.enabled`，把[活规格](../concepts/living-specs.md)保存在 `docs/specs/`（`specs.dir`）中。
3. 运行 `emet map`，把代码库地图写入 `docs/agents/codebase.md`（`map.path`）。一旦 HEAD 越过该标注，`emet map --stale` 就以退出码 1 退出。
4. 运行结束后执行 `emet metrics --run <id>`，查看按工单、波次和运行统计的 token、成本和耗时。

:::

对于单工单的小改动，请启动 `/emet:run --quick <request>`，而不是完整流水线；它总是按波次落地，并在遇到高风险 diff 时停止。

## 检查

:::steps

1. 运行 `emet preflight`；它会校验 `tracker`、`landing`、`pr`、`handoff` 和 `budgets` 部分，并在配置格式错误时以退出码 2 退出。
2. 运行 `emet doctor .`，确认没有失败项指向跟踪器、`gh`、Linear MCP 服务器或落地设置。
3. 使用本地跟踪器时，运行 `emet tracker frontier --spec <slug>`，确认它列出你预期的工单。

:::

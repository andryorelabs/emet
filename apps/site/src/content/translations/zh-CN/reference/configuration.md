---
title: 配置参考
description: emet.config.json 中的每个键，包括其默认值和含义。
seoTitle: emet 配置参考
sourceHash: e234cb9ad3468e98
---

`emet.config.json` 中的每个键，及其默认值和含义。权威来源是 [`emet/schema/emet.config.schema.json`](../../emet/schema/emet.config.schema.json)。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。

`emet init` 会写入该文件，`emet preflight` 和 `emet doctor` 会校验它。标记为 prose-only 的键由 `/emet` 提示词读取，而不是由 CLI 读取。标记为 deprecated 的键仍然被接受。该模式还允许一个用于备注的自由文本 `"//"` 键（任何工具都不会读取它）以及始终为 `1` 的 `"version"`。

## pr

波次的 PR 如何合并。

```json
{ "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 } }
```

- `autoMerge`（默认 `true`）：等待 PR 的检查完成后合并；如果没有检查，则立即合并。检查失败时会修复并推送，最多 `maxCiFixAttempts` 次，之后 PR 保持打开，交给人处理。只要有任何被标记的内容，该波次就不会被自动合并。
- `mergeMethod`（默认 `squash`）：`squash`、`merge` 或 `rebase`，传给 `gh pr merge`。
- `maxCiFixAttempts`（默认 `2`，最小 `0`）：在把 PR 保持打开交给人处理之前，协调者可以尝试修复失败检查的次数。

## handoff

波次结束后会发生什么，以及工作者交接笔记的大小限制。由 `emet preflight` 校验。

```json
{
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `maxLines`（默认 `60`）：`.emet/handoff-<ticket>.md` 笔记在被 `emet handoff --check` 判为不通过之前最多可以有的行数。
- `maxChars`（默认 `8000`，约 2k 个 token）：交接笔记最多可以有的字符数。
- `autoChain`（默认 `false`）：在一个干净且已合并的波次之后，如果还有剩余波次，就用 `claude --bg` 启动下一个波次，而不是打印 `/emet:run --dispatch <spec-id>`。可用 `claude agents` 或 `claude attach emet-<spec-id>-w<n>` 查看。要求：
  1. PATH 中有 `claude`，并且支持 `--bg`。
  2. 受信任的工作区。`--bg` 以非交互方式运行，因此信任对话框不会出现；请在该仓库中以交互方式打开一次 `claude` 并接受。
  3. 在交互会话中已接受一次绕过警告（`skipDangerousModePermissionPrompt`），因为下一个波次运行在 `handoff.permissionMode` 指定的模式下，而不是启动它的会话的模式。

  只有在 PR 已合并且没有任何内容被标记时才会启动；如果已有 `emet-<spec-id>-*` 会话在运行（`claude agents --json`），则会跳过。如果启动失败，则回退为打印 `/emet:run --dispatch <spec-id>`。

- `launcher`（默认 `auto`，可选 `auto`、`orca`、`bg`）：同时在运行 `claude attach` 的 Orca 标签页中打开该波次。`auto` 会询问 Orca 运行时（`orca status`），因此对没有 `TERM_PROGRAM` 的 `claude --bg` 会话同样有效；`orca` 总是尝试；`bg` 从不尝试。无论哪种方式，波次都在后台运行，标签页打开失败也不会中断串联。`emet launch <spec-id> --wave <n>` 会完成整个启动流程；参见 [`emet launch`](cli.md#运行工作者与槽位)。
- `permissionMode`（默认 `bypassPermissions`，可选 `bypassPermissions`、`auto`、`acceptEdits`）：串联会话的权限模式。它不继承启动会话的模式，因为 `auto` 模式的分类器可能拒绝 `gh pr merge` 之类的步骤，导致波次只完成一半。你的 `permissions.deny` 规则仍然适用，但必须已在交互环境中接受过一次绕过警告（`skipDangerousModePermissionPrompt`）。

## budgets

全部可选。

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`（默认 `2`，最小 `1`）：工单在关卡回答 `defer` 之前可以让 `verify` 失败的次数。该工单会被加上延后标签，波次的其余部分继续进行。环境故障（例如测试命令以 126/127 退出，或服务提供方中断）会暂停运行，且不消耗一次尝试。
- `reviewRounds`（默认 `2`，最小 `1`）：工单在升级到下一个模型层级之前可以获得的评审/修复轮数。此后仍然未解决的问题会得到裁定。
- `stallNudgeCap`（默认 `6`，最小 `1`）：对停滞的工作者催促的次数。该计数不会重置。

## models

每个角色的模型和推理强度。每个键都是可选的；省略该部分时，工作者保持 `sonnet`/`medium`，评审者保持 `opus`/`medium`。推理强度可取 `low`、`medium`、`high`、`xhigh`、`max` 之一。

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  }
}
```

- `worker.model`（默认 `sonnet`）、`worker.effort`（默认 `medium`）：工作者。工单中的 `Model:` 行只会覆盖该工作者的 `worker`。
- `reviewer.medium` 和 `reviewer.high`（默认均为 `opus`、`medium`）：`emet assess` 返回的每个风险层级所对应的评审者。若想对高风险波次加强审查，可以提高 `reviewer.high.effort`（例如提高到 `high`）。
- `triage`（默认 `haiku`）：用于 CI 日志分诊和 passive 层级评审的廉价模型。失败的检查会交给使用该模型的代理，它最多返回约 2k 个 token，并附带 `file:line` 指引。
- `escalation`（默认 `{ "sonnet": "opus" }`）：按模型名称给出的下一个模型层级，在工单达到修复次数上限时使用。

## agentHost

`agentHost` (默认 `"claude"`): 运行所在的 Agent 宿主，`"claude"` 或 `"codex"`。参见 [Codex 指南](../guide/codex.md)。

## codex

仅当 `agentHost` 为 `"codex"` 时才会读取。所有键都是可选的。强度取 `low`、`medium`、`high`、`xhigh`、`max` 之一，永远不接受 `ultra`。

- `models.worker`, `models.workerOverride`, `models.reviewer.medium`, `models.reviewer.high`, `models.triage`: 每项都是 `{ "model", "effort", "fallback" }`。当 `model` 不在 Codex 模型缓存中时，`fallback` 列出按顺序尝试的 slug。默认值见[模型与强度](../guide/models-and-effort.md)。
- `models.session`: 用于运行 `$emet:run` 的会话：`{ "model", "effort", "planEffort", "fallback" }`。`planEffort` 在首次批准之前生效。
- `effort`: 设置后会替换所有角色的强度。
- `minVersion` (默认 `0.167.0`): `emet doctor` 接受的最旧 `codex` CLI 版本。
- `sandbox` (默认 `danger-full-access`): `emet dispatch`、`emet review-run` 以及 Codex 的 `emet launch` 以 `-s` 传入的沙箱模式。也接受 `workspace-write`，但它会让 `.git` 变为只读，worker 因而无法提交。无论取何值，`emet guard` 都会在 Codex 上拒绝 `git push`，生成的覆盖层 `config.toml` 只包含 emet 市场和插件、针对本次运行自身目录的 trusted 表，以及解析出的模型和强度（绝不包含你自己的表）。参见 [Codex 指南](../guide/codex.md)和 [ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md)。

## review

```json
{ "review": { "highRiskPaths": [] } }
```

- `highRiskPaths`（默认 `[]`）：额外的、不区分大小写的路径子串，在内置集合（认证、安全、支付、webhook、CI、安装程序、锁文件、迁移，以及原始 SQL 或管道传给 shell 之类的危险敏感调用）之外，在 `emet assess` 中强制进入 `high` 评审层级。

## landing

- `mode`（默认 `pr`）：`pr` 会打开拉取请求（需要 `gh`）。`merge` 通过 `emet land` 将集成分支合并到本地主干且从不推送，用 `commands.selfCheck` 代替 CI。与跟踪器无关。参见 [ADR-0010](../adr/0010-local-merge-landing.md)。

## tracker

`/emet` 与哪个问题跟踪器交互。CLI 读取 `kind` 来决定适用哪些依赖检查；其余部分描述 `/emet` 命令所遵循的适配器（参见 [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md)）。

- `kind`（必填）：`linear`、`github` 或 `local`。关于 `local`，参见[本地跟踪器](cli.md#本地跟踪器)和 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。
- `transitions.onStart`、`transitions.onPrOpen`、`transitions.onPrMerge`：由谁写入每个工单状态转换，取值为 `worker`、`coordinator` 或 `automatic`（由跟踪器集成自动完成，例如 Linear 在 PR 打开或合并时的 GitHub 集成）。协调者从不写入标记为 `automatic` 的转换。
- `github.priorityLabels`：将优先级（`"1"` = P0 最高，到 `"4"` = P3）映射到 GitHub 标签名称，例如 `{"1":"P0","2":"P1"}`。未声明时，工单按 `createdAt` 升序排列，`emet doctor` 会说明这一点。
- `github.stateLabels`：将工作流状态（`todo`、`in-progress`、`in-review`）映射到 GitHub 标签名称，例如 `{"todo":"status:todo"}`。`done` 和 `canceled` 根据问题的关闭状态和 `state_reason` 推断。
- `linear`：Linear 专用设置（团队键、工作流状态名称）。仅由遵循 `docs/agents/issue-tracker.md` 的模型读取，CLI 从不读取。
- `local.idPrefix`（deprecated）：本地工单 ID 现在是 `<feature-slug>-<NN>`。
- `readyLabel`、`triageLabels`、`prReference`（deprecated）：标签和 PR 引用的模板，例如 `Closes #{number}`（github）或 `Refs: {id}`（linear）。

## preflight

- `requiredFiles`（默认无）：在波次派发之前，`emet preflight` 要求仓库根目录中存在的文件，每项形如 `{ "path", "why" }`；`why` 会显示在失败信息中。为空表示不执行该检查。
- `requiredCommands`（默认无）：派发之前必须能在 PATH 中解析的二进制文件。`emet preflight` 会点名未能解析的项并以退出码 1 失败，`emet doctor` 也会报告它们。这是仓库自己的列表，与由跟踪器驱动的[依赖检查](dependencies.md#谁检查什么)相互独立；`gh` 已有专门的检查，因此列出它是可选的。常见的补充项是 `rg` 和 `sg`。

## specs

- `dir`（默认 `docs/specs`）：活规格所在的、相对仓库的目录，由 `emet spec-merge` 写入。

## map

- `path`（默认 `docs/agents/codebase.md`）：`emet map` 生成的地图的、相对仓库的路径。

## concurrency

- `waveSize`（默认 `4`，最小 `1`）：一个波次中一起派发的 Agent 调用的最大数量。
- `maxLiveWorkers`（默认 `auto`）：这台主机上运行的所有 `/emet` 协调者在所有仓库之间共享的全局上限。槽位池位于 `~/.local/state/emet/slots` 之下，不在任何一个仓库中。`auto` 根据主机的 CPU 数量和内存推算上限；正整数则将其固定。另有一项独立的内存余量检查（`EMET_MEM_RESERVE_GIB`，默认 8 GiB），无论该上限如何，只要可用内存过低就会拒绝获取槽位。环境变量 `EMET_MAX_LIVE_WORKERS` 会覆盖此字段，并且也接受 `auto`。
- `runIdleThresholdMs`（默认 `5400000`，即 90 分钟）：没有存活锚点的运行在多长时间内仍被归类为空闲而不是已终止，仅依据会话记录的新鲜度判断。环境变量 `EMET_RUN_IDLE_THRESHOLD_MS` 会覆盖它。

参见[环境变量](cli.md#环境变量)。

## ticket

- `idPattern`：工单 ID 必须匹配的、带锚点的正则表达式源码，例如 `^PROJ-\d+$`。无效的模式属于致命的配置错误。
- `branchPrefix`：工作者本地分支的小写前缀（`^[a-z0-9-]+$`）。分支名为 `<branchPrefix>-<number>-<slug>`，`cleanup` 会清扫 glob `<branchPrefix>-*`。
- `idExample`（deprecated，prose-only）：一个与 `idPattern` 匹配的示例 ID。
- `branchPattern`（deprecated，prose-only）：完整的分支名模板。

## commands

全部为 prose-only。

- `selfCheck`：工作者在认为变更完成之前运行的命令，例如 `["npm run check"]`。在 `landing.mode` 为 `merge` 时，它代替 CI。
- `workerScopedSuite`：工作者为仅测试自己改动的范围而运行的命令。`emet verify` 要求它通过。
- `fullSuite.run`：整个仓库范围测试套件的命令，在波次的各分支合并之后，在集成分支上运行一次。运行失败会阻止 PR 和 `autoChain`。
- `fullSuite.singleton`：如果同一时间只允许一个工作树运行该套件，则为 `true`。
- `fullSuite.runInBackground`、`fullSuite.reset`（deprecated）：后台运行标志和状态重置命令。

## worktree

- `lockReason`：工作者在引导阶段写入的 `git worktree lock` 原因的模板，由 `emet lock-reason` 填充。默认值为 `emet run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}`。仅在需要添加字段时才覆盖：`emet lock-reason` 会拒绝缺少字面量 `emet` 标记，或缺少 `run=`、`ticket=`、`anchor=`、`at=`、`slug=` 中任何一项的模板。
- `copyFromMain`（prose-only）：在引导之前，从主干检出复制到新工作树中的路径，例如未被跟踪的 env 文件。
- `bootstrap`（prose-only）：在工作者启动之前，在新工作树中运行一次的 shell 命令，例如 `["npm ci"]`。由 `/emet` 阶段 6 运行，CLI 从不运行。
- `stateDir`（deprecated，prose-only）：运行本地日志的目录，例如 `.emet`。

## usage

- `oversizedReadLines`（默认 `400`，最小 `1`）：对超过这个行数的文件、不带偏移量或限制的 Read，在 `emet usage` 中会被计为过大。
- `stalledMinutes`（默认 `10`，最小 `1`）：`emet usage --stalled` 默认的 `--minutes` 阈值。

## sizing

- `inlineMaxLines`（默认 `100`，最小 `1`）：工作者提示词中以内联方式保留的工单正文的最大行数。

## schema

仅 prose-only。本仓库的数据模式归属，在阶段 3 拆分工单时由避免冲突的规则使用。为空或省略时，将跳过该规则。

- `ownedPaths`：定义共享模式的路径，例如 `["prisma/schema.prisma"]`。每个波次中最多只有一个工作者可以改动它们。
- `sharedDatabase`（deprecated）：如果各工作者共用一个物理数据库，则为 `true`。

## commit

仅 prose-only。

- `trailer`：工作者在引用工单的提交上附加的 git trailer 键，例如 `Refs`。
- `trailerPosition`：`body` 或 `footer`。

## repo

- `trunk`：所有工作者的变更向其合并的分支，也是每一次清理和 preflight 的 git 比较的基准，例如 `main`。
- `remote`（默认 `origin`）：`trunk` 所在的 git 远程。
- `integrationBranch`（deprecated，prose-only）：可选的长期分支，波次在合并到主干之前先集成到该分支上。
- `commitTypes`（deprecated，prose-only）：工作者提交所允许的 Conventional Commit 类型。

## design

可选，prose-only。设为 `null` 或省略时，将跳过设计/UI 评审步骤。

- `canvasIndex`（deprecated）：设计画布文件的路径，工作者在进行 UI 变更之前会查看它。

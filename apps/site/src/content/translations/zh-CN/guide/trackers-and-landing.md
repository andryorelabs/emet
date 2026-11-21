---
title: 跟踪器与落地
description: 工单存放在哪里，波次如何以拉取请求或本地合并的方式落地，以及波次如何串联。
seoTitle: emet 的跟踪器与落地
sourceHash: da19ec4cf50e7084
---

工单存放在哪里、波次如何落地、波次如何串联。此处提到的每个配置键都在[配置参考](../reference/configuration.md)中，每个子命令都在 [CLI 参考](../reference/cli.md)中。

<img src="../brand/mascot/mascot-work.svg" alt="emet 吉祥物，工作中" width="96" align="right">

## 跟踪器

emet 支持 Linear、GitHub Issues 或本地文件，由 `tracker.kind` 设置。`github` 跟踪器需要 `gh`。`linear` 跟踪器需要在 `.mcp.json`（或用户范围）中声明 Linear MCP 服务器；参见[依赖参考](../reference/dependencies.md)。

### 本地跟踪器

设置 `tracker.kind: "local"` 后，规格和工单是主工作树 `.scratch/` 下的 Markdown 文件（不纳入版本控制）：`.scratch/<slug>/spec.md` 和 `.scratch/<slug>/issues/<NN>-<slug>.md`，每个文件都带有 `Status:` 和 `Blocked by:` 行，评论位于 `## Comments` 之下。协调者通过 `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）读写它们。`emet init --tracker local` 会完成这一设置。参见 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。

## 落地

`landing.mode` 为 `"pr"`（默认）或 `"merge"`，与跟踪器无关。在 `merge` 模式下，波次通过 `emet land` 以一次本地合并落地到主干，用 `commands.selfCheck` 代替 CI，并且不推送。只有当跟踪器是 `github` 或落地方式是 `pr` 时才需要 `gh`。参见 [ADR-0010](../adr/0010-local-merge-landing.md)。

`landing.unit` 决定以什么为单位一次落地：`"spec"`（默认）一次落地整个规格，`"wave"` 沿用旧规则，即每个波次单独落地。参见 [ADR-0037](../adr/0037-landing-per-spec.md)，它取代了 [ADR-0004](../adr/0004-one-wave-one-dependency-layer-one-pr.md)。

### 规格分支

设置 `landing.unit: "spec"` 后，协调者用 `emet spec-branch ensure --spec <id>` 从主干创建 `spec/<id>`。波次通过评审和 `commands.selfCheck` 之后，`emet spec-branch integrate` 会以 `--no-ff` 把波次分支合并到 `spec/<id>`，提交中带有 `Emet-Wave` 和 `Emet-Tickets` 两个 trailer。分支已在 `spec/<id>` 中的工单是 **Integrated**（已集成），而不是 **Landed**（已落地）：它对下一个波次的前沿而言算作已关闭的阻塞项，但跟踪器会让它保持打开，直到最终落地。后续波次从 `spec/<id>` 的顶端分出分支，因此没有波次需要等待 PR 的 CI。

`emet spec-branch sync` 把主干合并到 `spec/<id>`，从不变基；遇到冲突时它会中止、保持分支不变并以非零状态退出。`emet spec-branch land` 先执行同步，然后一次性落地该分支。在 `pr` 模式下，它会推送 `spec/<id>`，打开一个 PR，其中为每个已集成波次的每个工单各带一行 `Closes #N`，等待其检查通过，并以 `landing.specMergeMethod` 合并（默认是合并提交，忽略 `pr.mergeMethod`）。在 `merge` 模式下，它以 `--no-ff` 把 `spec/<id>` 合并到本地主干，且从不推送。`--partial` 只落地目前已集成的波次。`emet spec-branch abandon --spec <id> --force` 会给分支打上 `abandoned/spec-<id>` 标签、删除它，并把本地跟踪器中已集成的工单重置回 `ready-for-agent`。

规格模式需要在 Claude Code 设置中设定 `worktree.baseRef: "head"`，使工作者工作树从规格分支起步；`emet preflight` 和 `emet doctor` 会检查这一点。当模式为 `pr` 且仓库设置或主干规则集不允许已配置的 `landing.specMergeMethod` 时，`emet doctor` 还会发出警告。

### 以 PR 落地

设置 `landing.unit: "spec"` 时，PR 属于整个规格：每个已集成的波次共用一个 PR，由 `emet spec-branch land` 在最后一个波次之后打开。设置 `landing.unit: "wave"` 时，一个波次对应一个 PR。PR 正文为每个工单带有一行 `Closes #N`（跟踪器的关闭关键字），协调者在打开 PR 时会把工单移到评审中。随后，PR 按 `pr.autoMerge` 合并；如果该波次被标记、`autoMerge` 为 `false`，或 CI 修复次数已用尽，则 PR 保持打开（此时 PR 会带上需要人工决定的标签）。合并之后，`emet tracker close` 会关闭 GitHub 跟踪器上的工单，`emet cleanup --run <runId>` 会释放该波次的分支、工单认领和工作者槽位。它还会删除其 PR 已在分支顶端提交处合并的每个本地分支，包括集成分支。

一个波次的各分支合并到一起之后，`commands.fullSuite` 会在集成分支上运行一次。运行失败会阻止 PR 和 `autoChain`。关卡以 `--integration` 接收这一结果。在规格落地的非最终波次中，协调者根据 `commands.selfCheck` 传入 `--ci`，只有最终落地才用 `emet ci --wait` 等待 CI；只要还有波次剩余，关卡就回答 `chain`。

### 串联波次

后续波次在各自的会话中运行，绝不会在运行波次 1 的那个会话中运行。接下来会发生什么，由 `emet.config.json` 中两个可选部分控制（两者都由 `emet preflight` 校验）：

```json
{
  "pr": { "autoMerge": true, "mergeMethod": "squash", "maxCiFixAttempts": 2 },
  "handoff": {
    "autoChain": false,
    "launcher": "auto",
    "permissionMode": "bypassPermissions"
  }
}
```

- `pr.autoMerge`（默认 `true`）：等待 PR 的检查完成后合并；如果没有检查，则立即合并。检查失败时会修复并推送，最多 `maxCiFixAttempts` 次，之后 PR 保持打开，交给人处理。只要有任何被标记的内容，该波次就不会被自动合并。
- `handoff.autoChain`（默认 `false`）：在一个干净且已合并的波次之后，如果还有剩余波次，就用 `claude --bg` 启动下一个波次，而不是打印 `/emet:run --dispatch <spec-id>`。可用 `claude agents` / `claude attach emet-<spec-id>-w<n>` 查看。在 Claude Code 上的要求：
  1. PATH 中有 `claude`，并且支持 `--bg`。
  2. 受信任的工作区。`--bg` 以非交互方式运行，因此信任对话框不会出现；请在该仓库中以交互方式打开一次 `claude` 并接受。
  3. 在交互会话中已接受一次绕过警告（`skipDangerousModePermissionPrompt`），因为下一个波次运行在 `handoff.permissionMode`（见下文）指定的模式下，而不是启动它的会话的模式。

  在 Codex 宿主上，下一个波次改为作为分离的 `codex exec` 启动（见下面的 `handoff.launcher`），因此要求是 PATH 中有版本不低于 `codex.minVersion` 的 `codex`，且 `codex exec` 带有 `--json` 和 `--output-schema`；`emet doctor` 检查的是标志，而不是版本号。Claude 的信任对话框和绕过警告不适用。分离运行是否需要 Codex 信任该工作区，本仓库的文档中尚未验证。

  只有在 PR 已合并且没有任何内容被标记时才会启动；如果已有 `emet-<spec-id>-*` 会话在运行（`claude agents --json`），则会跳过。如果启动失败，则回退为打印 `/emet:run --dispatch <spec-id>`。

- `handoff.launcher`（默认 `auto`）：同时在运行 `claude attach` 的 Orca 标签页中打开该波次。`auto` 会询问 Orca 运行时（`orca status`），因此对没有 `TERM_PROGRAM` 的 `claude --bg` 会话同样有效；`orca` 总是尝试，`bg` 从不尝试。`launcher` 仅适用于 Claude Code 宿主；在 Codex 上，`emet launch` 的行为始终等同于 `bg`。无论哪种方式，波次都在后台运行，标签页打开失败也不会中断串联。

  `emet launch <spec-id> --wave <n>` 会完成整个启动流程（重复会话检查、`claude --bg`、标签页），并打印 `{ name, id, attach, orcaTab: { opened, reason } }`。每当你想手动在另一个会话中运行某个波次时，请使用它，而不是直接使用 `claude --bg`。

  在 Codex Agent 宿主上，`emet launch` 会启动一个分离的 `codex exec`，运行 `$emet:run --dispatch <spec-id>`，并记录其线程 ID。它不会打开 Orca 标签页，`codex exec resume <id>` 可继续该会话。参见 [CLI 参考](../reference/cli.md#codex-宿主)和[在 Codex 上运行 emet](codex.md)。

- `handoff.permissionMode`（默认 `bypassPermissions`）：仅限 Claude Code；串联会话的权限模式。在 Codex 宿主上它会被忽略，串联会话使用 `codex.sandbox`（默认 `danger-full-access`；参见[在 Codex 上运行 emet](codex.md)）。它不继承启动会话的模式，因为 `auto` 模式的分类器可能拒绝 `gh pr merge` 之类的步骤，导致波次只完成一半。你的 `permissions.deny` 规则仍然适用，但必须已在交互环境中接受过一次绕过警告（`skipDangerousModePermissionPrompt`）。

## 关卡、预算与记录

各阶段不会自行判断工单是否完成、是否可以合并，或是否值得重试。它们会调用一个 CLI 命令，该命令读取磁盘上的记录并打印决定。运行记录位于 `.emet/runs/<run-id>/`，评审台账位于 `.emet/review/`，都在主检出目录中，而不在工作者的工作树中。每个命令都可以用 `--help` 打印其用法。命令表以及每个命令强制执行的内容，见[关卡与记录](../reference/cli.md#关卡与记录)。

**预算**（`emet.config.json`，全部可选）：

```json
{ "budgets": { "workerAttempts": 2, "reviewRounds": 2, "stallNudgeCap": 6 } }
```

- `workerAttempts`：工单在关卡回答 `defer` 之前可以让 `verify` 失败的次数。该工单会被加上延后标签，波次的其余部分继续进行。环境故障（例如测试命令以 126/127 退出，或服务提供方中断）会暂停运行，且不消耗一次尝试。
- `reviewRounds`：工单在升级到下一个模型层级之前可以获得的评审/修复轮数。此后仍然未解决的问题会得到裁定。
- `stallNudgeCap`：对停滞的工作者催促的次数。该计数不会重置。

## 活规格、地图与指标

**活规格。** 通过 `specs.enabled` 选择启用。在规格的最后一个波次、评审之前，协调者会写入该规格的需求增量，运行一次 `emet spec-merge --spec <id>`，把它们合并到 `docs/specs/<area>.md`（`specs.dir`），并提交结果，因此结果会随同一个 PR 一起被评审并落地。它会在写入任何内容之前检查所有区域。如果出现冲突，或者某个需求会丢失一个场景，则以退出码 1 退出，并且不改动任何文件；协调者会重试一次，之后在没有该更新的情况下落地并加以标记。

**代码库地图。** `emet map` 会把现有代码库的概览（技术栈、结构、约定、测试、热点）写入 `docs/agents/codebase.md`（`map.path`），并标注生成它所用的提交 SHA。同一个提交总是生成同一个文件。一旦 HEAD 越过该标注，`emet map --stale` 就以退出码 1 退出，此时 `emet preflight` 会发出警告。`emet map --for <globs>` 只打印与工单编辑范围相匹配的部分。该输出是地图中唯一会包含在工作者简报里的部分。

**指标。** `emet metrics --run <id>` 根据会话记录，按工单、按波次和按运行报告 token、折合 API 的成本和耗时。它还会比较每个工单预估的上下文预算与各工作者实际使用的量。其摘要会放在该次运行最终报告的末尾。

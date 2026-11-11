---
title: CLI 参考
description: 每个 emet 子命令、关卡与记录表、退出码和环境变量。
seoTitle: emet CLI 参考
sourceHash: a8d3bf074f04de8e
---

每个 `emet` 子命令、关卡与记录表、退出码和环境变量。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。每个命令都可以用 `--help` 打印其用法。

## 子命令

在 Claude Code 内，有三个斜杠命令封装了 CLI：`/emet:run`（流水线）、`/emet:init`（`emet init`）和 `/emet:doctor`（`emet doctor .`）。在 Codex 上它们是 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能。在普通终端中使用 `emet` 需要 `install.sh`；否则请在会话中运行 `! emet <subcommand>`。

`emet <command> [...args]`。`emet --version` 打印版本号。

### 设置与审计

- `emet migrate [--dry-run]`：将旧版仓库重命名为 emet 的名称。
- `emet init [--tracker linear|github|local] [--force]`：自动检测包管理器、主干分支和跟踪器类型，并写入 `emet.config.json` 和 `docs/agents/*.md` 文件。`--tracker local` 会设置本地跟踪器。
- `emet doctor [--all] [<path> ...]`：以只读方式一次审计任意数量的仓库；默认为当前目录。
- `emet preflight [--run <id>] [--post-dispatch]`：确认仓库已具备派发条件。
- `emet skill-path <name>`：打印某个 mattpocock-skills 技能的 `SKILL.md` 绝对路径。如果找不到该技能，则以退出码 1 退出。
- `emet selftest`：运行 CLI 自身的单元测试。仅限源码安装；已编译的二进制文件会以退出码 1 退出，并提示你运行 `emet doctor`。

在任意 git 仓库中：

```bash
emet init          # autodetects package manager, trunk branch, tracker kind
emet preflight      # confirms the repo is dispatch-ready
```

对于 `emet init` 无法自行推断的内容（共享测试数据库锁、模式归属等），它会在生成的 `docs/agents/*.md` 文件中留下 `TODO(emet):` 标记；请把这些内容补全。只要还有标记残留，`emet preflight` 就会拒绝派发。

然后，在 Claude Code 中（在 Codex 上，使用 `$emet:run` 并传入相同参数）：

```text
/emet:run <describe the feature>              # interview → wave 1; later waves via --dispatch/autoChain
/emet:run --draft <describe the feature>      # stop after tickets are created
/emet:run --dispatch <spec-id>                # dispatch a --draft'd spec later
```

#### 批量检查

`emet doctor` 可以以只读方式一次审计多个仓库：

```bash
emet doctor ~/code/*
```

它会逐个仓库报告：`emet.config.json` 是否有效、四个 `docs/agents/*.md` 文件是否齐全、是否没有遗留的 `TODO(emet):` 标记、`commands.selfCheck` 中的命令是否真的可以解析，以及该仓库与跟踪器相关的依赖检查结果（`gh`、Linear，参见[依赖](dependencies.md#谁检查什么)）。mattpocock-skills 插件和外部 CLI 的标志（`gh`，以及代理宿主的标志：Claude Code 上是 `claude --bg` 和 `claude agents --json`，Codex 上是 `codex exec --json` 和 `--output-schema`，通过 `--help` 检查）在整次扫描中只检查一次，而不是每个仓库检查一次。

### 运行、工作者与槽位

- `emet claims --reserve <ticket> --run <id> --anchor <pid>`：为某次运行预留一个工单。`--release <ticket>`、`--list` 和 `--prune [--dry-run]` 分别用于释放认领、列出认领，或清理过期的认领。
- `emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`：从 `~/.local/state/emet/slots` 中的主机级池获取一个工作者槽位。`--release --run <id>`、`--release-index <index>` 和 `--list` 用于释放或列出槽位。
- `emet cleanup [--run <id> | --all] [--dry-run] [--force]`：不带参数时，回收其工作已落地的已关闭或已终止的运行；`--run` 清理该次运行；`--all` 是对整个仓库的分支清扫。合并之后，`emet cleanup --run <runId>` 会释放该波次的分支、工单认领和工作者槽位。在所有模式下，它还会删除其 PR 已在分支顶端提交处合并的每个本地分支，以及持有该分支的干净且未锁定的代理工作树。
- `emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]`：打印工作者在引导阶段写入的 `git worktree lock` 原因。
- `emet launch <spec-id> --wave <n>`：在 Claude Code 上，以 `claude --bg` 会话启动一个波次，并按 `handoff.launcher` 打开它的 Orca 标签页（Codex 参见 [Codex 宿主](#codex-宿主)）。它会完成整个启动流程（重复会话检查、`claude --bg`、标签页），并打印 `{ name, id, attach, orcaTab: { opened, reason } }`。每当你想手动在另一个会话中运行某个波次时，请使用它，而不是直接使用 `claude --bg`。
- `emet status [--spec <id>]`：以 JSON 加一行摘要的形式给出每个波次的 Working / Checking / Ready / Needs-decision 状态。`emet status --help` 说明了该 JSON。
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`：报告会话用量；`--stalled` 列出停滞的工作者。
- `emet handoff --check <path> | --render <path>`：校验或渲染工作者的 `.emet/handoff-<ticket>.md` 笔记。
- `emet metrics [--run <id>]`：根据会话记录，按工单、按波次和按运行报告 token、折合 API 的成本和耗时。它还会比较每个工单预估的上下文预算与各工作者实际使用的量。其摘要会放在该次运行最终报告的末尾。

### 规划、评审与落地

- `emet validate --spec <id> | --file <path>`：计划校验；参见[关卡与记录](#关卡与记录)。
- `emet surfaces --check <file.json | ->`：如果同一波次的工单之间，允许编辑范围的 glob 存在重叠，则予以拒绝。
- `emet approve --run <id>`、`emet materialize-log`、`emet results`、`emet verify`、`emet review-package`、`emet review`、`emet gate`：参见[关卡与记录](#关卡与记录)。
- `emet assess --base <ref> --head <ref>`：将 diff 分类为 `passive`、`medium` 或 `high`，并输出包含层级、原因以及推荐的评审者模型和推理强度的 JSON。参见[模型与推理强度](../../README.md#models--effort)和 [`review`](configuration.md#review)。
- `emet land --spec <s> --branch <integration> --tickets <id,...>`：将集成分支合并到本地主干（`landing.mode` 为 `merge`）。用 `commands.selfCheck` 代替 CI，并且不推送任何内容。
- `emet spec-merge --spec <id>`：波次自动合并之后，将规格中 `ADDED`/`MODIFIED`/`REMOVED` 的需求增量合并到 `docs/specs/<area>.md`（`specs.dir`）。它会在写入任何内容之前检查所有区域。如果出现冲突，或者某个需求会丢失一个场景，则以退出码 1 退出，并且不改动任何文件。
- `emet map [--refresh]`：把现有代码库的概览（技术栈、结构、约定、测试、热点）写入 `docs/agents/codebase.md`（`map.path`），并标注生成它所用的提交 SHA。同一个提交总是生成同一个文件。一旦 HEAD 越过该标注，`emet map --stale` 就以退出码 1 退出，此时 `emet preflight` 会发出警告。`emet map --for <globs>` 只打印与工单编辑范围相匹配的部分；该输出是地图中唯一会包含在工作者简报里的部分。
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`：基于 `.scratch/` 的本地跟踪器，标准输出为 JSON。参见[本地跟踪器](#本地跟踪器)。
- `emet guard`：Claude Code 的 `PreToolUse` 钩子；从标准输入读取钩子 JSON（Codex 的形式见 [Codex 宿主](#codex-宿主)）。`install.sh` 会把它接入 `~/.claude/settings.json`。它会阻止少数已知会导致无人值守运行失败的操作（参见 `emet/src/guard.ts`）。

### 本地跟踪器

设置 `tracker.kind: "local"` 后，规格和工单是主工作树 `.scratch/` 下的 Markdown 文件（不纳入版本控制）：`.scratch/<slug>/spec.md` 和 `.scratch/<slug>/issues/<NN>-<slug>.md`，每个文件都带有 `Status:` 和 `Blocked by:` 行，评论位于 `## Comments` 之下。协调者通过 `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）读写它们。`emet init --tracker local` 会完成这一设置。参见 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。

`landing.mode` 为 `"pr"`（默认）或 `"merge"`，与跟踪器无关。在 `merge` 模式下，波次通过 `emet land` 以一次本地合并落地到主干，用 `commands.selfCheck` 代替 CI，并且不推送。只有当跟踪器是 `github` 或落地方式是 `pr` 时才需要 `gh`。参见 [ADR-0010](../adr/0010-local-merge-landing.md) 和 [`landing`](configuration.md#landing)。

### 以 PR 落地与串联波次

一个波次对应一个 PR。其正文为每个工单带有 `Closes #N`（跟踪器的关闭关键字），协调者在打开 PR 时会把工单移到评审中。随后，PR 按 `pr.autoMerge` 合并；如果该波次被标记、`autoMerge` 为 `false`，或 CI 修复次数已用尽，则 PR 保持打开（此时 PR 会带上需要人工决定的标签）。后续波次在各自的会话中运行，绝不会在运行波次 1 的那个会话中运行。接下来会发生什么，由 `pr` 和 `handoff` 部分控制；参见 [`pr`](configuration.md#pr) 和 [`handoff`](configuration.md#handoff)。

### Codex 宿主

这些命令服务于 Codex Agent 宿主（`agentHost` 为 `"codex"`）；参见 [Codex 指南](../guide/codex.md)。

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: 在检查认领和槽位之后，创建 `.emet/worktrees/agent-<ticket>`，构建每次运行的 `CODEX_HOME` 覆盖层，并把 worker 作为分离的 `codex exec` 启动。`emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` 会阻塞到它退出，并输出记录的结果状态。
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`: 对 `emet review-package` 生成的包，以只读的 `codex exec` 运行 reviewer，并输出供 `emet review --findings` 使用的问题 JSON。`passive` 档不会启动进程。
- `emet launch <spec-id> --wave <n>`: 在此宿主上，启动一个运行 `$emet:run --dispatch <spec>` 的分离 `codex exec`，并记录其线程 ID。不会打开 Orca 标签页，`codex exec resume <id>` 可继续该会话。
- `emet guard`: 在 `EMET_AGENT_HOST=codex` 下读取 Codex 的 hook 输入，对照 `.emet/surface.json` 检查 `apply_patch` 的路径，并在收到提示行 `approve <id>` 之前保持批准闸门关闭。

## 关卡与记录

各阶段不会自行判断工单是否完成、是否可以合并，或是否值得重试。它们会调用一个 CLI 命令，该命令读取磁盘上的记录并打印决定。运行记录位于 `.emet/runs/<run-id>/`，评审台账位于 `.emet/review/`，都在主检出目录中，而不在工作者的工作树中。

| 步骤           | 命令                                                 | 强制执行的内容                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 批准之前       | `emet validate --file <plan.json>`                   | 每个 `S#` 都至少被一个工单覆盖，并且有验收场景。每个工单至少覆盖一个 `S#`。同一波次内的编辑范围互不相交。没有依赖环。`emet preflight` 会对已批准的计划再次运行它。                                  |
| 批准           | `emet approve --run <id> --spec <file>`              | 写入带有规格和工单列表哈希的 `approval.json`。如果之后其中任何一个发生变化，派发会被拒绝（`--check`）。                                                                                             |
| 创建工单       | `emet materialize-log --run <id> --record/--lookup`  | 每个工单一创建出来就立即保存其 ID，因此被中断的运行不会产生重复工单。                                                                                                                               |
| 工作者完成     | `emet results --run <id> --write/--read <ticket>`    | 工作者写入本地结果文件（`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED` 或 `NEEDS_CONTEXT`，外加一行 `Risk:`）。只有协调者可以写入跟踪器。                                                                  |
| 每个工作者之后 | `emet verify <ticket> --run <id>`                    | 检查在派发基线之后存在提交、每个变更的路径都在工单的编辑范围内、交接笔记通过 `handoff --check`，且 `commands.workerScopedSuite` 通过。评审和合并会拒绝没有通过记录的工单。                          |
| 评审输入       | `emet review-package <base> <head> --out <file>`     | 为评审者打包 diff，评审者以文件路径的形式接收。如果范围为空，或不是 base 的后代，则以退出码 3 退出。                                                                                                |
| 评审           | `emet review --ticket <t> --findings <file>`         | 维护问题台账，并强制执行分诊顺序（`intent_gap` → `bad_plan` → `patch` → `defer`）和轮数上限。`--escalate` 升级到下一个模型层级。`--rule`/`--rulings` 记录并列出用于报告和 PR 正文的“我做出的裁定”。 |
| 合并或串联     | `emet gate <ticket> --tier … --ci … --integration …` | 以 JSON 打印 `merge`、`hold`、`chain`、`stop` 或 `defer` 及其原因。它会读取 verify 记录、未处理的问题、风险层级、CI、集成套件和预算。                                                               |

一个波次的各分支合并到一起之后，`commands.fullSuite` 会在集成分支上运行一次。运行失败会阻止 PR 和 `autoChain`。关卡以 `--integration` 接收这一结果。关卡所读取的预算，参见 [`budgets`](configuration.md#budgets)。

## 退出码

退出码在所有子命令中含义一致。

| 代码 | 含义                                                   |
| ---- | ------------------------------------------------------ |
| `0`  | 一切正常。                                             |
| `1`  | 存在需要处理的问题。                                   |
| `2`  | 配置或用法错误；工具实际上并未运行。未知命令也属此类。 |
| `3`  | 内部错误。                                             |

## 环境变量

面向用户的变量。设置后，变量会覆盖对应的配置值。

| 变量                          | 作用                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMET_SKIP_DEPENDENCY_CHECKS` | `EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` 仅对这一次运行，把依赖检查造成的阻止降级为警告。请在你自己的 shell 中设置，不要设置在协调者无人值守运行的任何内容中。    |
| `EMET_MAX_LIVE_WORKERS`       | 覆盖 [`concurrency.maxLiveWorkers`](configuration.md#concurrency)；接受正整数或 `auto`。                                                                                |
| `EMET_RUN_IDLE_THRESHOLD_MS`  | 覆盖 [`concurrency.runIdleThresholdMs`](configuration.md#concurrency)，单位为毫秒。                                                                                     |
| `EMET_STATE_DIR`              | 主机级状态目录，其中存放工作者槽位池。解析顺序：`$EMET_STATE_DIR`，然后是 `$XDG_STATE_HOME/emet`，最后是 `~/.local/state/emet`。                                        |
| `EMET_MEM_RESERVE_GIB`        | 必须保持空闲的内存余量（GiB）；可用内存低于该值时，获取槽位会被拒绝。默认为 8。它也参与 `auto` 工作者上限的计算。                                                       |
| `EMET_MEM_PER_WORKER_GIB`     | 当 `maxLiveWorkers` 为 `auto` 时，假定每个工作者占用的内存（GiB）。默认为 2。如果每个工作者的技术栈更重，例如每个工作树都运行由浏览器驱动的端到端测试套件，请调高该值。 |
| `EMET_CPU_OVERSUBSCRIBE`      | `auto` 工作者上限所用的 CPU 倍数。默认为 1。                                                                                                                            |
| `EMET_AGENT_HOST`             | 设为 `codex` 时，`emet guard` 读取 Codex 的 hook 输入。由 Codex 的 hook 设置；在 Claude Code 上请保持未设置。                                                           |

`auto` 上限为 `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`。旧版的 `FORGE_*` 名称仍然会被读取；两者同时设置时，`EMET_*` 优先。

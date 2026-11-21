---
title: CLI 参考
description: 每个 emet 子命令、关卡与记录表、退出码和环境变量。
seoTitle: emet CLI 参考
sourceHash: 44c0d5ae7d296866
---

每个 `emet` 子命令、关卡与记录表、退出码和环境变量。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。每个命令都可以用 `--help` 打印其用法。

## 子命令

在 Claude Code 内，有三个斜杠命令封装了 CLI：`/emet:run`（流水线）、`/emet:init`（`emet init`）和 `/emet:doctor`（`emet doctor .`）。在 Codex 上它们是 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能。在普通终端中使用 `emet` 需要 `install.sh`；否则请在会话中运行 `! emet <subcommand>`。

`emet <command> [...args]`。`emet --version` 打印版本号。

### 设置与审计

- `emet migrate [--dry-run]`：将旧版仓库重命名为 emet 的名称。
- `emet init [--tracker linear|github|local] [--after-spec release|promote|none] [--force]`：自动检测包管理器、主干分支、跟踪器类型和 after-spec 模式（参见 [`handoff.afterSpec`](configuration.md#handoff)），在发现 Prisma 模式（`prisma/schema.prisma` 或 `prisma/schema/` 文件夹）或 Drizzle 迁移文件夹（`drizzle.config.*` 旁的 `drizzle/`）时设置 [`schema.ownedPaths`](configuration.md#schema)，并写入 `emet.config.json` 和 `docs/agents/*.md` 文件。`--tracker local` 会设置本地跟踪器。
- `emet doctor [--all] [<path> ...]`：以只读方式一次审计任意数量的仓库；默认为当前目录。另外，对于配置了 [`verify.browser`](configuration.md#verify) 的仓库，它还会报告一项可选的 `agent-browser` 检查结果：缺少该二进制文件为 `indeterminate`（带安装补救办法的 `optional:` 行），二进制文件存在时，`agent-browser doctor` 失败会显示为警告。两者都绝不算错误，也不会改变退出码。没有 `verify.browser` 的仓库不显示任何内容。
- `emet setup [--yes] [--with <ids>] [--list] [--json]`：通过 readline 提示提供可选安装项：`mattpocock-skills`（默认开启）、`engram`、`mascot`、`orca-pet`、`gh-auth`、`agent-browser`（默认关闭；运行 `bun add -g agent-browser@latest`，然后运行 `agent-browser install`，仅当 `~/.agent-browser/config.json` 不存在时，才写入包含 `contentBoundaries: true` 和 `maxOutput: 50000` 的该文件，再运行 `agent-browser doctor`，失败时打印警告；从不固定版本，也从不传入 `--with-deps`，因此缺少系统库时，它会打印出供你自行运行的命令）、`context7`（默认关闭；运行 `bun add -g ctx7@latest`，然后运行 `ctx7 setup --cli --claude --yes`，仅当 `codex` 在 PATH 中时才运行 `ctx7 setup --cli --codex --yes`；安装 `ctx7` CLI 及其 `find-docs` 技能，而不是 MCP 服务器，从不固定版本，并在某个 `ctx7 setup` 步骤失败时打印供手动运行的命令；除非设置了 `CTX7_TELEMETRY_DISABLED=1`，否则 `ctx7` 会发送匿名使用事件，且环境中的 `CONTEXT7_API_KEY` 优先于 `ctx7 login` 保存的账户）、`firecrawl-local`（默认关闭；需要 `cargo`，在二进制文件缺失时运行 `cargo install firecrawl-local`，然后以 `FIRECRAWL_CLOUD=search` 和 `--public-only` 注册一个用户级 Claude Code MCP 服务器，并替换设置不同的早期注册：scrape、crawl 和 map 在本机运行，只有网页搜索会发送到 Firecrawl Cloud，并会阻止私有地址。它会把 `agent-browser` 下载的最新 Chrome 作为 `FIRECRAWL_CHROME_PATH` 传入；在 AppArmor 限制非特权用户命名空间的 Linux 上，它会打印一份 AppArmor 配置文件以及加载它的 `sudo` 命令，因为 Firecrawl Local 从不在没有沙箱的情况下运行 Chrome。没有可用的 Chrome 时，使用 JavaScript 渲染的页面会返回空内容）以及推荐的 Claude Code 设置（`claude-settings`，仅在被选中时应用，并先对 `settings.json` 做带时间戳的备份）。没有 TTY，或使用 `--yes` 或 `--with` 时，它不会询问任何内容，只安装指定的项目；没有 TTY 且没有 `--with` 时，它什么都不安装，并打印 `--list` 目录。每一步都会报告 `installed`、`already-present`、`skipped` 或 `failed`；一个失败不会阻止其他步骤，只要有失败，退出码就是 1。`/emet:setup` 是插件入口，通过 `AskUserQuestion` 询问相同的选项。
- `emet fleet list [--root <dir>] [--json]`：列出 `--root`（默认 `~/code`）下一层、带有 `emet.config.json` 的 git 仓库，并显示 `tracker.kind`、`handoff.autoChain` 和 `models.worker`。`emet fleet set <key> <value> [--root <dir>] [--dry-run]` 会在每个列出的仓库中修改一个配置键，并先通过配置加载器校验（无效值不会改动任何内容，并以退出码 1 结束）。`emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]` 在通过 `emet chain` 的就绪检查后，在每个仓库中打开一个 `/emet:run --draft <text>` 会话。`[--dry-run]` 会打印计划的启动内容，而不会启动会话。参见 [fleet 指南](../guide/fleet.md)。
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
- `emet chain --ticket <id> --spec <id> --wave <n> [gate flags]`：用收到的关卡标志运行 `emet gate`，仅当决定为 `chain` 时才启动下一个波次。启动前它会检查就绪情况（主机内存余量、仓库和 `/tmp` 的可用磁盘与 inode、`orca` CLI），之后确认子会话已列出。任何其他决定、阻塞性的就绪问题（`low-memory`、`low-disk`、`low-inodes`、`orca-unavailable`）或同一规格和波次已有会话时，会连同原因以退出码 1 结束，且不启动任何内容。
- `emet status [--spec <id>] [--brief]`：以 JSON 加一行摘要的形式给出每个波次的 Working / Checking / Ready / Needs-decision 状态。`--brief` 则最多输出三行：整体状态、等待人处理的事项（如有）以及下一步操作。`emet status --help` 说明了该 JSON。
- `emet run current [--json]`：输出仓库当前的活动运行（运行 id、规格、波次、阶段和最近更新），读取自 `.emet/phase.json`。没有活动运行时输出 `no active run` 并以 0 退出。
- `emet insights [--since <iso|7d|30d>] [--repo <path>] [--all] [--json] [--mark-baseline]`：读取[事件日志](../guide/journal.md)，按来源（人工或自动）报告运行、按决定和原因报告 gate 决定、每次运行的人工干预、启动结果和已关闭的工单。无法读取的行会被跳过并计数。`--mark-baseline` 追加一个基线；之后的报告只涵盖基线之后的事件，除非指定 `--all`。日志为空或不存在时输出零值报告并以 0 退出。
- `emet usage [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]`：报告会话用量；`--stalled` 列出停滞的工作者。
- `emet handoff --check <path> [--expect-skills a,b] | --render <path>`：校验或渲染工作者的 `.emet/handoff-<ticket>.md` 笔记。笔记可以包含 `skills:` 部分，写作 `skills: none` 或 `skills: loaded: a, b; missing: c`；只有当 `state` 为 `done` 时才必须填写，其他任何值都会使校验失败。`--expect-skills a,b`（仅用于 check）会对每个既不在 `loaded` 也不在 `missing` 列表中的指定技能判定校验失败。当 `missing` 列表不为空时，通过的校验会输出 `missing skills: …`。
- `emet metrics [--run <id>]`：根据会话记录，按工单、按波次和按运行报告 token、折合 API 的成本和耗时。它还会比较每个工单预估的上下文预算与各工作者实际使用的量。其摘要会放在该次运行最终报告的末尾。

### 规划、评审与落地

- `emet promote --spec <id> [--dry-run] [--no-promote] [--hold]`：after-spec 步骤，依据 [`handoff.afterSpec`](configuration.md#handoff)。在 `promote` 模式下，它会打开一个标题为 `chore: 🔖 promote develop` 的从 `develop` 到 `main` 的拉取请求，用 `emet ci --pr <n> --wait` 等待，仅当状态为 `pass` 时才以合并提交的方式合并，然后仅在 `develop` 落后于 `main` 时，打开一个从 `main` 到 `develop` 的同步拉取请求，以同样的方式等待其检查，并仅当状态为 `pass` 时才以合并提交的方式合并；状态为 `fail`、`timeout` 或 `env-fault`，或合并被拒绝的同步拉取请求会保持打开，且从不改变 promote 的结果。它会向日志追加一条带有拉取请求编号、`merged`、`syncPrNumber`、`syncMerged`、`syncReason`、`rule` 和 `reason` 的 `promote` 事件。`afterSpec` 可以是规则列表；此时模式由提升 `develop` 会带来的路径来选择（参见 [`handoff.afterSpec`](configuration.md#handoff)），而 `git fetch` 或 `git diff` 失败会让该命令在打开任何拉取请求之前以 1 退出。打印出的结果包含 `rule`（匹配规则的索引，字符串形式或无匹配时为 `null`）、`reason`、`syncPrNumber`（未打开同步拉取请求时为 `null`）、`syncMerged` 和 `syncReason`（说明同步拉取请求为何保持打开的一句话，否则为 `null`）以及 `deployCheck: { run, reason }`，后者说明协调器是否应运行 `emet deploy-check`。在 `release` 模式下，它不合并任何内容，发布拉取请求留给人来处理。当 `afterSpec` 为 `none`、使用 `--no-promote`，或规范的最后一个波次被保持打开或被标记时，它以退出码 0 结束并附带 `skipped` 说明；它仍会在干净的最后一个波次之后运行，使结果包含 `deployCheck` 的决定（在主干 `main` 上，无论哪种模式都会运行部署检查）。CI 不是 `pass` 时不合并任何内容，并以退出码 1 结束。`--dry-run` 不会打开拉取请求。 `emet promote --spec <id> --hold` 会写入标记 `<run dir>/runs/<id>/no-promote` 并输出 `{"held":true}`；标记存在期间，`emet promote --spec <id>` 以 0 退出并给出 `skipped` 提示，不会打开任何 pull request，因此 `--no-promote` 会在一个规范的多个会话之间保持。
- `emet deploy-check [--json]`：运行 `deploy.check.command`，直到它以 0 退出，最多尝试 `retries` 次或 `timeoutSeconds` 秒，每次之间等待 `intervalSeconds` 秒，并打印 `state: ok | failed | timeout` 以及 `attempts`。退出码 `0` 为 ok，`1` 为 failed，`3` 为 timeout。未配置 `deploy.check` 时，它以退出码 0 结束并输出 `skipped: "no deploy check configured"`。仅当 `emet promote` 的结果中 `deployCheck.run` 为 true 时，协调器才会运行它。参见 [`deploy`](configuration.md#deploy)。
- `emet validate --spec <id> | --file <path>`：计划校验；参见[关卡与记录](#关卡与记录)。
- `emet surfaces --check <file.json | ->`：如果同一波次的工单之间，允许编辑范围的 glob 存在重叠，则予以拒绝。
- `emet approve --run <id>`、`emet materialize-log`、`emet results`、`emet verify`、`emet review-package`、`emet review`、`emet gate`：参见[关卡与记录](#关卡与记录)。
- `emet assess --base <ref> --head <ref>`：将 diff 分类为 `passive`、`medium` 或 `high`，并输出包含层级、原因以及推荐的评审者模型和推理强度的 JSON，外加 `browserVerify: { run, reason }`：仅当该层级有评审者、已配置 [`verify.browser`](configuration.md#verify)、`agent-browser` 二进制文件在 PATH 中，并且在设置了 `paths` 时有变更路径匹配，`run` 才为 `true`；否则 `reason` 会指出第一个未满足的条件。参见[模型与推理强度](../../README.md#models--effort)和 [`review`](configuration.md#review)。
- `emet land --spec <s> --branch <integration> --tickets <id,...>`：将集成分支合并到本地主干（`landing.mode` 为 `merge`）。用 `commands.selfCheck` 代替 CI，并且不推送任何内容。
- `emet spec-merge --spec <id>`：波次自动合并之后，将规格中 `ADDED`/`MODIFIED`/`REMOVED` 的需求增量合并到 `docs/specs/<area>.md`（`specs.dir`）。它会在写入任何内容之前检查所有区域。如果出现冲突，或者某个需求会丢失一个场景，则以退出码 1 退出，并且不改动任何文件。
- `emet map [--refresh]`：把现有代码库的概览（技术栈、结构、约定、测试、热点）写入 `docs/agents/codebase.md`（`map.path`），并标注生成它所用的提交 SHA。同一个提交总是生成同一个文件。一旦 HEAD 越过该标注，`emet map --stale` 就以退出码 1 退出，此时 `emet preflight` 会发出警告。`emet map --for <globs>` 只打印与工单编辑范围相匹配的部分；该输出是地图中唯一会包含在工作者简报里的部分。
- `emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close`：基于 `.scratch/` 的本地跟踪器，标准输出为 JSON。参见[本地跟踪器](#本地跟踪器)。
- `emet guard`：Claude Code 的 `PreToolUse` 钩子；从标准输入读取钩子 JSON（Codex 的形式见 [Codex 宿主](#codex-宿主)）。`install.sh` 会把它接入 `~/.claude/settings.json`。它会阻止少数已知会导致无人值守运行失败的操作（参见 `emet/src/guard.ts`）。

### 本地跟踪器

设置 `tracker.kind: "local"` 后，规格和工单是主工作树 `.scratch/` 下的 Markdown 文件（不纳入版本控制）：`.scratch/<slug>/spec.md` 和 `.scratch/<slug>/issues/<NN>-<slug>.md`，每个文件都带有 `Status:` 和 `Blocked by:` 行，评论位于 `## Comments` 之下。协调者通过 `emet tracker`（`create-spec`、`create-ticket`、`read`、`frontier`、`set-state`、`comment`、`close`）读写它们。`emet init --tracker local` 会完成这一设置。参见 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。

`landing.mode` 为 `"pr"`（默认）或 `"merge"`，与跟踪器无关。在 `merge` 模式下，波次通过 `emet land` 以一次本地合并落地到主干，用 `commands.selfCheck` 代替 CI，并且不推送。只有当跟踪器是 `github` 或落地方式是 `pr` 时才需要 `gh`。参见 [ADR-0010](../adr/0010-local-merge-landing.md) 和 [`landing`](configuration.md#landing)。

### 以 PR 落地与串联波次

一个波次对应一个 PR。其正文为每个工单带有一行 `Closes #N`（跟踪器的关闭关键字），协调者在打开 PR 时会把工单移到评审中。随后，PR 按 `pr.autoMerge` 合并；如果该波次被标记、`autoMerge` 为 `false`，或 CI 修复次数已用尽，则 PR 保持打开（此时 PR 会带上需要人工决定的标签）。后续波次在各自的会话中运行，绝不会在运行波次 1 的那个会话中运行。接下来会发生什么，由 `pr` 和 `handoff` 部分控制；参见 [`pr`](configuration.md#pr) 和 [`handoff`](configuration.md#handoff)。

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` 轮询 PR 的检查，直到检查结束或超时（默认 30）。使用 `--rerun-flakes` 时，每个失败的检查会通过 `gh run rerun --failed` 重跑一次；重跑后通过的检查属于 Flake。它打印 `state: pass | fail | env-fault | timeout`、失败的检查和 `flakeReruns`，且从不合并。没有检查的 PR 为 `pass` 并带有 `noChecks: true`。退出码 `0` 为 pass，`1` 为 fail 或 env-fault，`3` 为 timeout。`env-fault` 指以 `STARTUP_FAILURE` 结束或排队过久的检查：即 CI 从未运行，而不是代码失败。

当 `tracker.kind: "github"` 时，`emet tracker close <ticket>... [--pr <n>]` 用 `gh issue close --reason completed` 关闭每个工单（`CLA-<n>`、`#<n>` 或纯数字），验证其状态并报告 `closed` 或 `already-closed`。`--pr` 会添加评论 "Landed in #<n>"。处理完工单后，它会读取每个已关闭工单的父规格 issue（`gh issue view <n> --json parent`），当 `subIssuesSummary` 显示所有子 issue 均已完成时，会以评论 "All <total> tickets landed." 将该规格按 completed 关闭，并在 `specs` 中报告为 `closed`、`open`、`already-closed` 或 `failed`；读取或关闭规格失败时同样以 `1` 退出。如果有工单失败，它会在处理完其余工单后以 `1` 退出。Linear 工单由协调者通过 Linear MCP 确认为 Done。

### Codex 宿主

这些命令服务于 Codex Agent 宿主（`agentHost` 为 `"codex"`）；参见 [Codex 指南](../guide/codex.md)。

- `emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`: 在检查认领和槽位之后，创建 `.emet/worktrees/agent-<ticket>`，构建每次运行的 `CODEX_HOME` 覆盖层，并把 worker 作为分离的 `codex exec` 启动。`emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]` 会阻塞到它退出，并输出记录的结果状态。
- `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]`: 对 `emet review-package` 生成的包，以只读的 `codex exec` 运行 reviewer，并输出供 `emet review --findings` 使用的问题 JSON。`passive` 档不会启动进程。 `--browser-verify` 默认为 `false`；设为 `true` 时，提示词以 Browser 维度结尾，其中 `--session review-<run>` 由 `--run` 填入，这样 Codex 评审者就能像 Claude 评审者一样验证 UI（当 `emet assess` 输出 `browserVerify.run: true` 时传入；参见 [`verify`](configuration.md#verify)）。不带该标志时提示词不变，`true` 或 `false` 之外的值会以退出码 2 退出并输出用法行。
- `emet launch <spec-id> --wave <n>`: 在此宿主上，启动一个运行 `$emet:run --dispatch <spec>` 的分离 `codex exec`，并记录其线程 ID。不会打开 Orca 标签页，`codex exec resume <id>` 可继续该会话。
- `emet guard`: 在 `EMET_AGENT_HOST=codex` 下读取 Codex 的 hook 输入，对照 `.emet/surface.json` 检查 `apply_patch` 的路径，并在收到提示行 `approve <id>` 之前保持批准闸门关闭。

## 关卡与记录

各阶段不会自行判断工单是否完成、是否可以合并，或是否值得重试。它们会调用一个 CLI 命令，该命令读取磁盘上的记录并打印决定。运行记录位于 `.emet/runs/<run-id>/`，评审台账位于 `.emet/review/`，都在主检出目录中，而不在工作者的工作树中。

| 步骤           | 命令                                                 | 强制执行的内容                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 批准之前       | `emet validate --file <plan.json>`                   | 每个 `S#` 都至少被一个工单覆盖，并且有验收场景。每个工单至少覆盖一个 `S#`。同一波次内的编辑范围互不相交。没有依赖环。配置 [`validate.coupledSurfaces`](configuration.md#validate) 后，当涉及某个配对 `source` 的工单所在波次早于涉及其 `dependents` 的工单时，会报 `coupled-surface-split` 错误（退出码 1）。`emet preflight` 会对已批准的计划再次运行它。                         |
| 批准           | `emet approve --run <id> --spec <file>`              | 写入带有规格和工单列表哈希的 `approval.json`。如果之后其中任何一个发生变化，派发会被拒绝（`--check`）。                                                                                                                                                                                                                                                                            |
| 创建工单       | `emet materialize-log --run <id> --record/--lookup`  | 每个工单一创建出来就立即保存其 ID，因此被中断的运行不会产生重复工单。                                                                                                                                                                                                                                                                                                              |
| 工作者完成     | `emet results --run <id> --write/--read <ticket>`    | 工作者写入本地结果文件（`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED` 或 `NEEDS_CONTEXT`，外加一行 `Risk:`）。只有协调者可以写入跟踪器。                                                                                                                                                                                                                                                 |
| 每个工作者之后 | `emet verify <ticket> --run <id>`                    | 检查在派发基线之后存在提交、每个变更的路径都在工单的编辑范围内、交接笔记通过 `handoff --check`，且 `commands.workerScopedSuite` 通过。评审和合并会拒绝没有通过记录的工单。                                                                                                                                                                                                         |
| 评审输入       | `emet review-package <base> <head> --out <file>`     | 为评审者打包 diff，评审者以文件路径的形式接收。如果范围为空，或不是 base 的后代，则以退出码 3 退出。                                                                                                                                                                                                                                                                               |
| 评审           | `emet review --ticket <t> --findings <file>`         | 维护问题台账，并强制执行分诊顺序（`intent_gap` → `bad_plan` → `patch` → `defer`）和轮数上限。`--recheck --verdicts <file>` 结束一轮修复：只评估该轮开始时未处理的问题，问题只能通过裁决变为 `resolved`，且 recheck 计入 `budgets.fixRounds`（用尽时以退出码 1 并指明上限）。`--escalate` 升级到下一个模型层级。`--rule`/`--rulings` 记录并列出用于报告和 PR 正文的“我做出的裁定”。 |
| 合并或串联     | `emet gate <ticket> --tier … --ci … --integration …` | 以 JSON 打印 `merge`、`hold`、`chain`、`stop` 或 `defer` 及其原因。它会读取 verify 记录、未处理的问题、风险层级、CI、集成套件和预算。`hold` 带有 `next`：`fix-findings`、`rerun-failed-specs`、`rerun-ci` 或 `report-infrastructure`。`--no-record` 使该决定不写入日志。参见 [`gate`](configuration.md#gate)。                                                                     |

一个波次的各分支合并到一起之后，`commands.fullSuite` 会在集成分支上运行一次。运行失败会阻止 PR 和 `autoChain`。关卡以 `--integration` 接收这一结果。关卡所读取的预算，参见 [`budgets`](configuration.md#budgets)。

## 退出码

退出码在所有子命令中含义一致。

| 代码 | 含义                                                   |
| ---- | ------------------------------------------------------ |
| `0`  | 一切正常。                                             |
| `1`  | 存在需要处理的问题。                                   |
| `2`  | 配置或用法错误；工具实际上并未运行。未知命令也属此类。 |
| `3`  | 内部错误。                                             |

未知标志同样以 `2` 退出，并指出该标志。Ctrl-C 以 `130` 退出。

## 全局标志

每个命令都接受这些标志；各命令自己的标志可用 `emet <command> --help` 查看。

| 标志         | 作用                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `--json`     | 在 stdout 上输出一个信封 `{ok, data, error: {code, message, fix}}`，`--help` 和 `--version` 也是如此。 |
| `--no-color` | 禁用 ANSI 颜色。颜色还遵循 `NO_COLOR`、`FORCE_COLOR`、`TERM=dumb` 以及输出是否为 TTY。                 |
| `--verbose`  | 输出意外错误的堆栈。不加此标志时，顶层 catch 只输出一行错误。                                          |
| `--help`     | 输出该命令的用法。                                                                                     |

`emet --version` 输出版本；`emet --version --json` 输出 `{"ok": true, "data": {"version": ...}, "error": null}`。在 `--json` 下，失败的命令以其通常的退出码退出，并输出 `ok: false`，错误 `code` 为 `findings`、`usage`、`internal`、`slice-timeout`、`expired`、`bad-range` 或 `exit-<n>` 之一；命令在 stdout 上输出的内容即为信封的 `data`。

在 TTY 上，当已知有更新的版本时，`emet` 会在 stderr 上输出一行通知。它每天最多检查一次，缓存结果，从不等待网络，并且在 `--json` 下或没有 TTY 时保持静默。

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

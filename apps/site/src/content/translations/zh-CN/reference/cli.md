---
title: CLI 参考
description: 每个 emet 子命令、关卡与记录表、退出码和环境变量。
seoTitle: emet CLI 参考
sourceHash: 7c398958687b5ea3
---

每个 `emet` 子命令、关卡与记录表、退出码和环境变量。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。每个命令都可以用 `--help` 打印其用法。

## 子命令

在 Claude Code 内，有三个斜杠命令封装了 CLI：`/emet:run`（流水线）、`/emet:init`（`emet init`）和 `/emet:doctor`（`emet doctor .`）。在 Codex 上它们是 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能。在普通终端中使用 `emet` 需要 `emet self install`；否则请在会话中运行 `! emet <subcommand>`。

`emet <command> [...args]`。`emet --version` 打印版本号。

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

## 设置与审计

### `emet migrate`

将旧版仓库重命名为 emet 的名称。

- `--dry-run`

### `emet init`

自动检测包管理器、主干分支、跟踪器类型和 after-spec 模式（参见 [`handoff.afterSpec`](configuration.md#handoff)）。在发现 Prisma 模式（`prisma/schema.prisma` 或 `prisma/schema/` 文件夹）或 Drizzle 迁移文件夹（`drizzle.config.*` 旁的 `drizzle/`）时，它会设置 [`schema.ownedPaths`](configuration.md#schema)，并写入 `emet.config.json` 和 `docs/agents/*.md` 文件。

- `--tracker linear|github|local`：`--tracker local` 会设置本地跟踪器。
- `--after-spec release|promote|none`
- `--force`

### `emet doctor`

以只读方式一次审计任意数量的仓库；默认为当前目录。

- `--all`
- `<path> ...`：要审计的仓库。

对于配置了 [`verify.browser`](configuration.md#verify) 的仓库，它还会报告一项可选的 `agent-browser` 检查结果：缺少该二进制文件为 `indeterminate`（带安装补救办法的 `optional:` 行），二进制文件存在时，`agent-browser doctor` 失败会显示为警告。两者都绝不算错误，也不会改变退出码。没有 `verify.browser` 的仓库不显示任何内容。

#### 批量检查

`emet doctor` 可以以只读方式一次审计多个仓库：

```bash
emet doctor ~/code/*
```

它会逐个仓库报告：`emet.config.json` 是否有效、四个 `docs/agents/*.md` 文件是否齐全、是否没有遗留的 `TODO(emet):` 标记、`commands.selfCheck` 中的命令是否真的可以解析，以及该仓库与跟踪器相关的依赖检查结果（`gh`、Linear，参见[依赖](dependencies.md#谁检查什么)）。

mattpocock-skills 插件和外部 CLI 的标志在整次扫描中只检查一次，而不是每个仓库检查一次。它们包括 `gh`，以及代理宿主的标志：Claude Code 上是 `claude --bg` 和 `claude agents --json`，Codex 上是 `codex exec --json` 和 `--output-schema`，通过 `--help` 检查。

### `emet setup`

通过 readline 提示提供可选安装项。

- `--yes`
- `--with <ids>`
- `--list`
- `--json`
- `--dry-run`：可与 `--with`、`--yes` 和 `--json` 组合。它为每个选中的项目打印计划步骤（或 `already-present`），不做任何更改：不运行命令、不写文件、不写台账条目，退出码为 0。
- `--restore <id>`：撤销两个可恢复项目之一；参见 [Setup 台账与恢复](#setup-台账与恢复)。

没有 TTY，或使用 `--yes` 或 `--with` 时，它不会询问任何内容，只安装指定的项目；没有 TTY 且没有 `--with` 时，它什么都不安装，并打印 `--list` 目录。每一步都会报告 `installed`、`already-present`、`skipped` 或 `failed`；一个失败不会阻止其他步骤，只要有失败，退出码就是 1。`/emet:setup` 是插件入口，通过 `AskUserQuestion` 询问相同的选项。每个 `installed` 的项目都会记录到 Setup 台账中。

这些项目如下：

- `mattpocock-skills`（默认开启）、`engram`、`mascot`、`orca-pet` 和 `gh-auth`。
- `agent-browser`（默认关闭）：运行 `bun add -g agent-browser@latest`，然后运行 `agent-browser install`，仅当 `~/.agent-browser/config.json` 不存在时，才写入包含 `contentBoundaries: true` 和 `maxOutput: 50000` 的该文件。随后运行 `agent-browser doctor`，失败时打印警告。它从不固定版本，也从不传入 `--with-deps`，因此缺少系统库时，它会打印出供你自行运行的命令。
- `context7`（默认关闭）：运行 `bun add -g ctx7@latest`，然后运行 `ctx7 setup --cli --claude --yes`，仅当 `codex` 在 PATH 中时才运行 `ctx7 setup --cli --codex --yes`。它安装 `ctx7` CLI 及其 `find-docs` 技能，而不是 MCP 服务器，从不固定版本，并在某个 `ctx7 setup` 步骤失败时打印供手动运行的命令。除非设置了 `CTX7_TELEMETRY_DISABLED=1`，否则 `ctx7` 会发送匿名使用事件，且环境中的 `CONTEXT7_API_KEY` 优先于 `ctx7 login` 保存的账户。
- `firecrawl-local`（默认关闭）：需要 `cargo`，在二进制文件缺失时运行 `cargo install firecrawl-local`。然后以 `FIRECRAWL_CLOUD=search` 和 `--public-only` 注册一个用户级 Claude Code MCP 服务器，并替换设置不同的早期注册。scrape、crawl 和 map 在本机运行，只有网页搜索会发送到 Firecrawl Cloud，并会阻止私有地址。
  - 它会把 `agent-browser` 下载的最新 Chrome 作为 `FIRECRAWL_CHROME_PATH` 传入。
  - 在 AppArmor 限制非特权用户命名空间的 Linux 上，它会打印一份 AppArmor 配置文件以及加载它的 `sudo` 命令，因为 Firecrawl Local 从不在没有沙箱的情况下运行 Chrome。
  - 没有可用的 Chrome 时，使用 JavaScript 渲染的页面会返回空内容。
- `claude-settings`：推荐的 Claude Code 设置，仅在被选中时应用，并先对 `settings.json` 做带时间戳的备份。

#### Setup 台账与恢复

`emet setup` 会把每个结果为 `installed` 的项目以 `{ id, at, undo }` 的形式记录在状态目录下的 `setup-ledger.json` 中。`already-present` 的项目不记录任何内容，同一 id 再次 `installed` 时保留第一条记录的原始状态。台账写入是原子的，格式错误的台账会报错并指出其路径，而不会被当作空台账读取。

撤销记录保存了还原所需的信息：

- `claude-settings`：之前的 `model`（或无）、实际添加的 deny 规则和备份路径。
- `firecrawl-local`：之前的用户级 MCP 条目（在运行 `claude mcp remove` 之前从 `~/.claude.json` 读取）以及 emet 是否运行过 `cargo install`。
- 插件：插件 id。
- `orca-pet`：它写入的文件。
- `agent-browser`：bun 全局包（以及配置文件，如果是 emet 创建的）。
- `context7`：bun 全局包。
- `engram`：brew formula 和插件。

`emet setup --restore <id>` 只接受 `claude-settings` 和 `firecrawl-local`；其他 id 以退出码 2 结束。

- `claude-settings` 在带时间戳的备份之后恢复之前的 `model`（原本没有则删除该键），并且只移除 emet 添加的 deny 规则。当前 `model` 不是 setup 设置的值时，保留它并打印警告。
- `firecrawl-local` 运行 `claude mcp remove firecrawl-local -s user`，如果记录过之前的条目，再运行 `claude mcp add-json firecrawl-local '<previous json>' -s user`。

恢复成功后会删除对应的台账条目；台账中没有条目的 id 会打印 `nothing to restore for <id>` 并以退出码 1 结束。

`emet uninstall` 以同样的方式还原每一条台账条目：`claude-settings` 和 `firecrawl-local` 如同 `--restore`，插件用 `claude plugin uninstall <id>`，`orca-pet` 文件和 emet 创建的 agent-browser 配置则直接删除。对于 brew、bun 和 cargo 的全局包，它会打印移除命令（例如 `bun remove -g ctx7`）但从不运行，并且从不触碰 `gh auth`。每条已还原的条目都会从台账中移除，一个附加项失败不会阻止其他项。

### `emet self install`

独立安装：`emet self install [latest|X.Y.Z]`。

- `--dry-run`：列出每一次写入，但不写入任何内容。
- `--force`：即使已安装 emet 插件也继续；不带它时，只要插件已安装，该命令就会拒绝执行。
- `--from <checkout>`：复现 Bun 源码安装。CLI 源码被复制到 `~/.claude/emet`，`~/.local/bin/emet` 变成一个用 `bun` 运行它的包装脚本，因此 `emet selftest` 可用；没有 `bun` 时会失败。贡献者使用 `emet self install --from .`。

它把二进制文件放到 `~/.local/share/emet/versions/<v>/emet`，并创建符号链接 `~/.local/bin/emet`；把参考提示词和 `.install-manifest.json` 写入 `~/.claude/emet/`，命令写入 `~/.claude/commands/emet/`，代理写入 `~/.claude/agents/`。

它把 emet 钩子合并进 `~/.claude/settings.json`（带备份，不触碰其他钩子）；当存在 Codex 时，还会把技能写入 `~/.agents/skills`，并把钩子追加到 `$CODEX_HOME/hooks.json`（默认 `~/.codex`；绝不写入 `config.toml`，因此需用 `/hooks` 批准一次这些钩子）。

再次运行不会有任何改动；被编辑过的文件会保留，新版本写在旁边，命名为 `<file>.new`。[安装](../start/install.md)中的单行安装脚本会下载发布的二进制文件，验证 `SHA256SUMS`，然后运行此命令。

### `emet self update`

`emet self update [latest|X.Y.Z]` 下载发布版本，验证 `SHA256SUMS`（存在 `gh` 时还验证证明）并将其暂存。只有在没有持有任何工作者槽位时，才会切换符号链接和已安装文件；否则它保持待处理状态，直到下一次会话启动。失败不会改动当前版本，并会记录在日志中。上一个版本会保留以便回滚，更早的版本会被清理。对插件安装它不做任何事。

- `--auto [off|on]`：`SessionStart` 钩子运行的命令。它每天最多运行一次，在后台分离运行，离线时保持静默；`off` 或 `on` 用于切换开关。`EMET_AUTO_UPDATE=0` 同样会将其禁用。

### `emet uninstall`

移除 `emet self install` 的安装以及 `emet setup` 添加的内容。它先构建完整计划，再执行。

- `--dry-run`：打印计划，不做任何更改。
- `--yes`：跳过确认。有 TTY 且没有 `--yes` 时会询问一次，没有 TTY 且没有 `--yes` 时打印计划，不做任何更改，退出码为 0。
- `--purge`：还会删除状态目录（`EMET_STATE_DIR`，否则为 `XDG_STATE_HOME/emet`）和 `~/.emet`；不带它则两者都保留。
- `--json`：以 JSON 打印结果。

它会移除：

- 安装清单中当前哈希与记录哈希一致的每个文件，以及它的 `.new` 同名文件；已被编辑的文件会保留并列出。
- shim `~/.local/bin/emet`，仅当它是该安装的包装脚本，或是指向 `~/.claude/emet` 或 `~/.local/share/emet/versions` 的符号链接时才删除，随后删除清单和变空的目录。
- 从 `~/.claude/settings.json` 和 `$CODEX_HOME/hooks.json`（默认 `~/.codex`）中移除任意事件里的每个 emet 钩子命令（`emet guard`、`emet setup --notice`、`emet whats-new --hook` 和 `emet self update --auto`）。保留其他所有钩子，并清除变空的分组和事件。
- `~/.agents/skills/emet/` 下仍与此 emet 一致的 Codex 技能（已被编辑的会保留并列出）、版本目录 `~/.local/share/emet/versions` 和安装状态 `~/.local/share/emet/install.json`。
- Setup 台账中的附加项（参见 [Setup 台账与恢复](#setup-台账与恢复)）。

当安装备份（`.pre-emet-guard-backup.`）与剩余内容完全一致时，恢复其字节；当没有任何内容剩下时，删除该文件；否则先写入带时间戳的备份。

没有清单或安装状态时（插件安装），它会跳过这些文件，并打印 `claude plugin uninstall emet@emet-marketplace`；当 `codex` 在 PATH 中时，还会打印如何移除 Codex 插件。任何步骤失败，或必须读取的文件（清单、设置、台账）无法读取时，退出码为 1，并指出该路径。

### `emet whats-new`

在 emet 更新后打印一次性通知。

- `--hook`：`SessionStart` 钩子运行的形式。

### `emet fleet`

作用于 `--root`（默认 `~/code`）下一层、带有 `emet.config.json` 的 git 仓库。参见 [fleet 指南](../how-to/check-a-fleet.md)。

- `emet fleet list [--root <dir>] [--json]`：列出这些仓库，并显示 `tracker.kind`、`handoff.autoChain` 和 `models.worker`。
- `emet fleet set <key> <value> [--root <dir>] [--dry-run]`：在每个列出的仓库中修改一个配置键，并先通过配置加载器校验（无效值不会改动任何内容，并以退出码 1 结束）。
- `emet fleet launch --feature <text> [--root <dir>] [--repos <a,b>] [--dry-run]`：在通过 `emet chain` 的就绪检查后，在每个仓库中打开一个 `/emet:run --draft <text>` 会话。`--dry-run` 会打印计划的启动内容，而不会启动会话。
- `emet fleet status [--json]`：读取全局日志，按仓库打印每个会话在最近 24 小时内的最新状态（不含 `ended`）。

`fleet status` 每个仓库打印一行 `<repo>: <b> blocked, <w> working, <i> idle`，被阻塞的仓库排在最前。`--json` 打印 `{repos: [{repo, sessions: [{sessionId, state, blocked, since, runId}]}], blocked: <count>}`。没有会话时同样以 0 退出。

### `emet preflight`

确认仓库已具备派发条件。

- `--run <id>`
- `--post-dispatch`

### `emet skill-path`

`emet skill-path <name>` 打印某个 mattpocock-skills 技能的 `SKILL.md` 绝对路径。如果找不到该技能，则以退出码 1 退出。

### `emet selftest`

运行 CLI 自身的单元测试。仅限源码安装；已编译的二进制文件会以退出码 1 退出，并提示你运行 `emet doctor`。

## 运行、工作者与槽位

### `emet claims`

为某次运行预留一个工单：`emet claims --reserve <ticket> --run <id> --anchor <pid>`。

- `--release <ticket>`：释放一个认领。
- `--list`：列出认领。
- `--prune [--dry-run]`：清理过期的认领。

### `emet slots`

从 `~/.local/state/emet/slots` 中的主机级池获取一个工作者槽位：`emet slots --acquire --run <id> --anchor <pid> --ticket <ticket>`。

- `--release --run <id>`：释放该运行的槽位。
- `--release-index <index>`：释放一个槽位。
- `--list`：列出槽位。

### `emet cleanup`

`emet cleanup [--run <id> | --all] [--dry-run] [--force]`。不带参数时，回收其工作已落地的已关闭或已终止的运行。合并之后，`emet cleanup --run <runId>` 会释放该波次的分支、工单认领和工作者槽位。

- `--run <id>`：清理这次运行。
- `--all`：对整个仓库的分支清扫。
- `--dry-run`
- `--force`

在所有模式下，它还会删除其 PR 已在分支顶端提交处合并的每个本地分支，以及持有该分支的干净且未锁定的代理工作树。

### `emet lock-reason`

`emet lock-reason --run <id> --ticket <ticket> [--anchor <pid>]` 打印工作者在引导阶段写入的 `git worktree lock` 原因。

### `emet launch`

`emet launch <spec-id> --wave <n>`：在 Claude Code 上，以 `claude --bg` 会话启动一个波次，并按 `handoff.launcher` 打开它的 Orca 标签页（Codex 参见 [Codex 宿主](#codex-宿主)）。它会完成整个启动流程（重复会话检查、`claude --bg`、标签页），并打印 `{ name, id, attach, orcaTab: { opened, reason } }`。每当你想手动在另一个会话中运行某个波次时，请使用它，而不是直接使用 `claude --bg`。

### `emet chain`

`emet chain --ticket <id> --spec <id> --wave <n> [gate flags]` 用收到的关卡标志运行 `emet gate`，仅当决定为 `chain` 时才启动下一个波次。

启动前它会检查就绪情况（主机内存余量、仓库和 `/tmp` 的可用磁盘与 inode、`orca` CLI），之后确认子会话已列出。任何其他决定、阻塞性的就绪问题（`low-memory`、`low-disk`、`low-inodes`、`orca-unavailable`）或同一规格和波次已有会话时，会连同原因以退出码 1 结束，且不启动任何内容。

### `emet status`

`emet status [--spec <id>] [--brief]` 以 JSON 加一行摘要的形式给出每个波次的 Working / Checking / Ready / Needs-decision 状态。`emet status --help` 说明了该 JSON。

- `--spec <id>`
- `--brief`：改为最多输出三行：整体状态、等待人处理的事项（如有）以及下一步操作。

该 JSON 还带有 `sessions: [{sessionId, state, blocked, since, runId}]`：此仓库中每个由 emet 持有的会话在最近 24 小时内的最新关注状态，不含 `ended` 会话。当 `state` 为 `needs-decision` 时 `blocked` 为 true，`since` 是该状态的时间。任何被阻塞的会话都会让整体 `state` 变为 `needs-decision`，即使没有活动的波次；摘要行会说明有多少会话被阻塞，`--brief` 会在“等待人工”那一行列出它们。

### `emet run`

`emet run current [--json]` 输出仓库当前的活动运行（运行 id、规格、波次、阶段和最近更新），读取自 `.emet/phase.json`。没有活动运行时输出 `no active run` 并以 0 退出。

### `emet memory`

在 [Engram](https://github.com/Gentleman-Programming/engram) 中搜索并保存经验教训。

- `emet memory search --json <query> [--limit <n>]`：搜索以往运行留下的经验教训。它以 `match_mode: "any"` 搜索（`--limit` 默认为 5，最大 20），只保留主题键以 `emet/<repo>/lessons/` 开头的笔记，并输出 `{available: true, results: [{id, topicKey, title, content}]}`，其中 `content` 截断为 2000 个字符。`<repo>` 是 `git remote get-url <repo.remote>` 的最后一段路径（去掉 `.git`），否则为主工作树的目录名。
- `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>`：从 stdin 读取 1 到 5 条经验要点（以 `- ` 开头的行，每条最多 300 个字符），把它们作为 `## <runId> — <outcome> (<date>)` 小节追加到主题键为 `emet/<repo>/lessons/<key>` 的笔记中，或新建该笔记。超过 20000 个字符的笔记会丢弃最旧的小节。它输出 `{available: true, saved: true, topicKey}`。

两个子命令都通过在仓库根目录启动 `engram mcp --tools=agent` 与 Engram 通信；不需要 Engram 插件。它们从不向 Engram 传递 `project`。

退出码：用法错误时为 `2`（没有子命令、缺少查询、没有要点、要点超过 5 条、某条要点超过 300 个字符、未知的 outcome、错误的 key）。所有 Engram 方面的问题（不在 PATH 中、握手失败、工具错误、超时、JSON 格式错误）都以 `0` 退出。

- 握手成功之前，输出为 `{available: false, reason}`。
- 握手成功之后，`search` 的输出为 `{available: true, results: [], reason}`，`save` 的输出为 `{available: true, saved: false, reason}`。
- `memory.enabled: "off"` 会输出 `{available: false, reason: "memory.enabled is off"}` 且不启动任何进程。参见 [`memory`](configuration.md#memory)。

### `emet insights`

读取[事件日志](../concepts/attention-and-journal.md)，按来源（人工或自动）报告运行、按决定和原因报告 gate 决定、每次运行的人工干预、启动结果和已关闭的工单。无法读取的行会被跳过并计数。日志为空或不存在时输出零值报告并以 0 退出。

- `--since <iso|7d|30d>`
- `--repo <path>`
- `--all`
- `--json`
- `--mark-baseline`：追加一个基线；之后的报告只涵盖基线之后的事件，除非指定 `--all`。

### `emet usage`

报告会话用量。

- `--session <id>` 或 `--file <path>`
- `--stalled [--minutes N]`：列出停滞的工作者。
- `--project-dir <path>`

### `emet handoff`

`emet handoff --check <path> [--expect-skills a,b] | --render <path>` 校验或渲染工作者的 `.emet/handoff-<ticket>.md` 笔记。

- `--check <path>`：校验该笔记。当 `missing` 列表不为空时，通过的检查会打印 `missing skills: …`。
- `--expect-skills a,b`（仅用于 check）：对每个既不在 `loaded` 也不在 `missing` 列表中的指定技能，让检查失败。
- `--render <path>`：渲染该笔记。

笔记可以带有一个 `skills:` 部分，写作 `skills: none` 或 `skills: loaded: a, b; missing: c`。只有当 `state` 为 `done` 时才必须有它，任何其他值都会让检查失败。

### `emet metrics`

`emet metrics [--run <id>]` 根据会话记录，按工单、按波次和按运行报告 token、与 API 等价的成本和耗时。它还会把每个工单估算的上下文预算与每个工作者的实际用量做比较。其摘要附在运行最终报告的末尾。

### `emet ask`

工作者信箱：向协调者提问，或等待回复。

- `--run <id>`
- `--ticket <ticket>`
- `--body <text>`：发送问题。
- `--wait <n>`：等待回复。
- `--slice <seconds>`

使用 `--wait` 时，退出码 `0` 表示收到回复，`3` 表示分片超时，`4` 表示已过期。

### `emet inbox`

`emet inbox --run <id>` 以 JSON 列出未处理的工作者问题。

### `emet reply`

`emet reply --run <id> --ticket <ticket> --id <n> --body <text>` 回答一个工作者的问题。

## 规划、评审与落地

### `emet promote`

`emet promote --spec <id> [--dry-run] [--no-promote] [--hold]` 是 after-spec 步骤，依据 [`handoff.afterSpec`](configuration.md#handoff) 执行。

- `--dry-run`：不打开任何 pull request。
- `--no-promote`：跳过该步骤。
- `--hold`：写入标记文件 `<run dir>/runs/<id>/no-promote` 并打印 `{"held":true}`。该文件存在期间，`emet promote --spec <id>` 以退出码 0 退出并给出 `skipped` 说明，且不打开任何 pull request，因此 `--no-promote` 在一个规格的多个会话之间始终有效。

在 `promote` 模式下，它会打开一个标题为 `chore: 🔖 promote develop` 的 `develop` 到 `main` 的 pull request，用 `emet ci --pr <n> --wait` 等待，并且仅当状态为 `pass` 时以合并提交将其合并。然后，仅当 `main` 带有 `develop` 所缺少的内容时（`develop...main` 比较至少列出一个已更改文件；仅有合并提交不算），它会打开一个 `main` 到 `develop` 的同步 pull request，以同样的方式等待其检查，并且仅当状态为 `pass` 时通过 [`pr.mergeMethod`](configuration.md#pr) 将其合并。当 `main` 只带有合并提交时，不会打开同步 pull request，`syncReason` 会说明原因。状态为 `fail`、`timeout` 或 `env-fault`，或合并被拒绝的同步 pull request 会保持打开，且绝不会改变 promote 的结果。

它会向日志追加一条 `promote` 事件，包含 pull request 编号、`merged`、`syncPrNumber`、`syncMerged`、`syncReason`、`rule` 和 `reason`。`afterSpec` 可以是一个规则列表；此时模式由提升 `develop` 会带上的路径来选择（参见 [`handoff.afterSpec`](configuration.md#handoff)），并且 `git fetch` 或 `git diff` 失败会让命令在打开任何 pull request 之前以退出码 1 退出。

打印的结果包含：

- `rule`：匹配到的规则索引；字符串形式或没有匹配时为 `null`。
- `reason`。
- `syncPrNumber`：没有打开同步 pull request 时为 `null`。
- `syncMerged` 和 `syncReason`：一句说明为何同步 pull request 保持打开的话，否则为 `null`。
- `deployCheck: { run, reason }`：说明协调者是否应运行 `emet deploy-check`。

在 `release` 模式下，它不合并任何内容，把发布 pull request 留给人处理。当 `afterSpec` 为 `none`、使用 `--no-promote`、规格被暂缓，或规格的最后一个波次被留作打开或被标记时，它以退出码 0 退出并给出 `skipped` 说明。在最后一个波次顺利完成之后它仍会运行，以便结果带有 `deployCheck` 的决定（在主干为 `main` 时，无论哪种模式都会运行部署检查）。CI 不是 `pass` 时不会合并任何内容，并以退出码 1 退出。

### `emet deploy-check`

运行 `deploy.check.command`，直到它以 0 退出，最多尝试 `retries` 次或持续 `timeoutSeconds`，每次尝试之间等待 `intervalSeconds`，并打印 `state: ok | failed | timeout` 和 `attempts`。

- `--json`

退出码 `0` 表示 ok，`1` 表示 failed，`3` 表示 timeout。没有配置 `deploy.check` 时，它以退出码 0 退出并给出 `skipped: "no deploy check configured"`。只有当 `emet promote` 的结果中 `deployCheck.run` 为 true 时，协调者才会运行它。参见 [`deploy`](configuration.md#deploy)。

### `emet surfaces`

`emet surfaces --check <file.json | ->` 会拒绝同一波次内各工单之间相互重叠的允许范围 glob。

### `emet assess`

`emet assess --base <ref> --head <ref>` 将 diff 分类为 `passive`、`medium` 或 `high`，并输出包含层级、原因以及推荐的评审者模型和推理强度的 JSON。参见[模型与推理强度](../../README.md#models--effort)和 [`review`](configuration.md#review)。

- `--quick`：JSON 还会包含 `"quickRejected": true|false`，且当层级为 `high` 时命令以退出码 1 退出（对 **Quick run** 而言是一次 **Stop**：不自动合并，PR 保持打开），否则退出码为 0。不带 `--quick` 时，输出和退出码不变。

JSON 还带有两项决定：

- `browserVerify: { run, reason }`：仅当该层级有评审者、已配置 [`verify.browser`](configuration.md#verify)、`agent-browser` 二进制文件在 PATH 中，并且在设置了 `paths` 时有变更路径匹配，`run` 才为 `true`。否则 `reason` 会指出第一个未满足的条件。
- `dualReview: { run, reason }`：仅当层级为 `high`、`agentHost` 为 `claude`、[`review.dual`](configuration.md#review) 不为 `off` 且 `codex` 二进制文件在 PATH 中，`run` 才为 `true`。否则 `reason` 会指出第一个未满足的条件。

### `emet land`

`emet land --spec <s> --branch <integration> --tickets <id,...>` 把集成分支合并到本地主干（`landing.mode` 为 `merge`）。`commands.selfCheck` 代替 CI，且不会推送任何内容。

### `emet spec-branch`

`emet spec-branch ensure|integrate|status|sync|land|abandon --spec <id>` 管理 `landing.unit: spec` 的规格分支 `spec/<id>`（参见 [`landing`](configuration.md#landing)）。它们都输出 JSON。

- `ensure`：从主干创建该分支（幂等），写入 `.emet/specs/<id>/branch.json`，并在另一个规格的分支已被检出时拒绝执行。
- `integrate --wave <n> --branch <integration> --tickets a,b`：用 `--no-ff` 和 `Emet-Wave`、`Emet-Tickets` 两个 trailer 把波次分支合并到 `spec/<id>`，记录该波次，追加 `spec.integrate`，并在 `landing.pushSpecBranch` 为 true 时推送该分支而不打开 PR。
- `status`：打印 `branch`、`tip`、已集成的波次和工单以及 `behindTrunk`，并在缺少某个波次时根据 trailer 重建 `branch.json`。
- `sync`：把主干合并进该分支，从不变基；发生冲突时中止、列出相关路径并以非零退出码退出。
- `land [--partial]`：先同步，然后在 `pr` 模式下推送该分支，打开一个每个工单带一行 `Closes` 的 PR，等待其检查，并用 `landing.specMergeMethod` 合并（默认为合并提交，忽略 `pr.mergeMethod`）。在 `merge` 模式下，它用 `--no-ff` 合并到本地主干，且从不推送。它会追加 `spec.land`。
- `abandon --force`：给 `abandoned/spec-<id>` 打标签，删除该分支，追加 `spec.abandon`，并把本地跟踪器中已集成的工单重置为 `ready-for-agent`；不带 `--force` 时拒绝执行。

`emet tracker frontier` 把列在 `branch.json` 中的工单计为已关闭的阻塞项，`emet status` 则新增 `specBranch`（`branch`、`tip`、`integratedWaves`）。

### `emet spec-merge`

`emet spec-merge --spec <id>` 把规格的 `ADDED`/`MODIFIED`/`REMOVED` 需求增量合并进 `docs/specs/<area>.md`（`specs.dir`）。

- `--deltas-dir`：打印存放增量的目录。

当 `specs.enabled` 开启时，协调者会写入这些增量，并在每个规格的最后一个波次的集成分支上、在其评审之前运行它一次，然后提交结果。它会先检查每个领域，再写入任何内容。发生冲突，或某条需求会因此丢失一个场景时，它以退出码 1 退出，并保持所有文件不变。当 `specs.enabled` 关闭时，它不合并任何内容并以退出码 0 退出。

### `emet map`

`emet map [--refresh]` 把现有代码库的概要（技术栈、结构、约定、测试、热点）写入 `docs/agents/codebase.md`（`map.path`），并标注其构建所依据的提交 SHA。同一个提交总是生成同一个文件。

- `--refresh`
- `--stale`：一旦 HEAD 越过该标注就以退出码 1 退出，此时 `emet preflight` 会发出警告。
- `--for <globs>`：只打印与某个工单的编辑范围匹配的部分；该输出是工作者简报中唯一包含的地图内容。

### `emet guard`

Claude Code 的 `PreToolUse` 钩子；从 stdin 读取钩子 JSON（Codex 的形式见 [Codex 宿主](#codex-宿主)）。`emet self install` 会把它接入 `~/.claude/settings.json`。它会阻止少数已知的、会导致无人值守运行失败的触发情形（参见 `emet/src/guard.ts`）。

## 本地跟踪器

设置 `tracker.kind: "local"` 后，规格和工单是主工作树 `.scratch/` 下的 Markdown 文件（不纳入版本控制）：`.scratch/<slug>/spec.md` 和 `.scratch/<slug>/issues/<NN>-<slug>.md`，每个文件都带有 `Status:` 和 `Blocked by:` 行，评论位于 `## Comments` 之下。`emet init --tracker local` 会进行此设置。参见 [ADR-0011](../adr/0011-local-tracker-scratch-convention.md)。

`landing.mode` 为 `"pr"`（默认）或 `"merge"`，与跟踪器无关。在 `merge` 模式下，一个波次通过 `emet land` 作为一次本地合并落地到主干，由 `commands.selfCheck` 代替 CI，且不推送。使用 `landing.unit: "spec"`（默认）时，整个规格通过 `emet spec-branch land` 一次性落地。只有当跟踪器是 `github` 或落地方式是 `pr` 时才需要 `gh`。参见 [ADR-0010](../adr/0010-local-merge-landing.md) 和 [`landing`](configuration.md#landing)。

### `emet tracker`

`emet tracker create-spec|create-ticket|read|frontier|set-state|comment|close` 是基于 `.scratch/` 的本地跟踪器，在 stdout 上输出 JSON。协调者通过它读写规格和工单。

#### `emet tracker close`

设置 `tracker.kind: "github"` 后，`emet tracker close <ticket>... [--pr <n>]` 会用 `gh issue close --reason completed` 关闭每个工单（`CLA-<n>`、`#<n>` 或纯数字），验证其状态，并报告 `closed` 或 `already-closed`。

- `--pr <n>`：添加评论 “Landed in #<n>”。

对于每个状态为 `closed` 或 `already-closed` 的工单的每个不同的父级，它随后会读取 `gh issue view <spec> --json state,subIssuesSummary`。当规格处于打开状态，且 `subIssuesSummary.completed` 等于非零的 `total` 时，它会用 `gh issue close --reason completed` 和评论 “All <total> tickets landed.” 关闭该规格，然后验证。

输出新增 `specs`，每个不同的父级对应一个 `{ spec, outcome, detail? }`，其 outcome 为 `closed`、`open`、`already-closed` 或 `failed`。没有父级的工单不会新增条目，规格读取或关闭失败也绝不会改变工单的结果。处理完其余项之后，只要有任何工单或规格失败，它就以 `1` 退出。Linear 工单由协调者通过 Linear MCP 确认为 Done。

## 以 PR 落地与串联波次

使用 `landing.unit: "wave"` 时，一个波次对应一个 PR；使用 `"spec"` 时，一个 PR 涵盖所有已集成的波次。其正文为每个工单带一行 `Closes #N`（跟踪器的关闭关键字），PR 打开时协调者会把这些工单移到评审中。随后该 PR 按 `pr.autoMerge` 合并；如果该波次被标记、`autoMerge` 为 `false`，或 CI 修复次数用尽，则保持打开（此时 PR 会获得需人工决定的标签）。后续的波次在各自的会话中运行，绝不在运行波次 1 的那个会话中运行。接下来发生什么由 `pr` 和 `handoff` 部分控制；参见 [`pr`](configuration.md#pr) 和 [`handoff`](configuration.md#handoff)。

### `emet ci`

`emet ci --pr <n> --wait [--rerun-flakes] [--timeout-minutes <m>]` 轮询 PR 的检查，直到检查结束或超时（默认 30）。它打印 `state: pass | fail | env-fault | timeout`、失败的检查和 `flakeReruns`，且从不合并。

- `--rerun-flakes`：通过 `gh run rerun --failed` 把每个失败的检查重跑一次；重跑后通过的检查属于 Flake。
- `--timeout-minutes <m>`

没有检查的 PR 为 `pass`，并带有 `noChecks: true`。退出码 `0` 表示 pass，`1` 表示 fail 或 env-fault，`3` 表示 timeout。`env-fault` 指检查以 `STARTUP_FAILURE` 结束或排队过久：即 CI 根本没有运行，而不是代码失败。

## Codex 宿主

这些命令服务于 Codex 代理宿主（`agentHost` 为 `"codex"`）；参见 [Codex 指南](../how-to/use-codex.md)。

### `emet dispatch`

`emet dispatch --role worker --run <id> --ticket <id> --prompt-file <file> [--model <m>] [--effort <e>] [--root <dir>]`：在检查认领和槽位之后，创建 `.emet/worktrees/agent-<ticket>`，构建每次运行专属的 `CODEX_HOME` 覆盖层，并以分离的 `codex exec` 启动工作者。

- `emet dispatch --wait --run <id> --ticket <id> [--timeout <s>]`：阻塞直到它退出，并打印记录的结果状态。

### `emet review-run`

`emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive> [--browser-verify true|false]` 以只读的 `codex exec` 在 `emet review-package` 生成的包上运行评审者，并打印供 `emet review --findings` 使用的问题 JSON。`passive` 层级不启动任何进程。

- `--browser-verify true|false`：默认为 `false`。使用 `true` 时，提示词以 Browser 维度结尾，其中的 `--session review-<run>` 由 `--run` 填入，这样 Codex 评审者就会像 Claude 评审者一样验证 UI（当 `emet assess` 打印出 `browserVerify.run: true` 时传入它；参见 [`verify`](configuration.md#verify)）。不带该标志时提示词不变，`true` 或 `false` 以外的值会以退出码 2 退出并给出用法行。
- `--coverage-out <file>`：还会把 Codex 评审者的 Coverage verdicts 以 JSON 数组写入 `<file>`（stdout 仍只打印问题）；在只运行一个评审者的 Codex 宿主上使用它。

问题可以带有 `emet review` 下所述的可选字段 `s` 和 `userOption`。

### Codex 上的 `emet launch`

`emet launch <spec-id> --wave <n>` 启动一个分离的 `codex exec`，运行 `$emet:run --dispatch <spec>`，并记录其线程 id。不会打开 Orca 标签页，`codex exec resume <id>` 可继续该会话。

### Codex 上的 `emet guard`

设置 `EMET_AGENT_HOST=codex` 后，`emet guard` 读取 Codex 的 hook 输入，对照 `.emet/surface.json` 检查 `apply_patch` 的路径，并在出现提示行 `approve <id>` 之前保持批准关卡关闭。

## 关卡与记录

各阶段不会自行判断工单是否完成、是否可以合并，或是否值得重试。它们会调用一个 CLI 命令，该命令读取磁盘上的记录并打印决定。运行记录位于 `.emet/runs/<run-id>/`，评审台账位于 `.emet/review/`，都在主检出目录中，而不在工作者的工作树中。下面的命令按流水线顺序列出。

### `emet validate`

批准之前：`emet validate --spec <id> | --file <plan.json>` 运行计划校验。

- 每个 `S#` 都至少被一个工单覆盖，并且有验收场景。
- 每个工单至少覆盖一个 `S#`。
- 同一波次内的编辑范围互不相交。
- 没有依赖环。
- 配置 [`validate.coupledSurfaces`](configuration.md#validate) 后，当涉及某个配对 `source` 的工单所在波次早于涉及其 `dependents` 的工单时，会报 `coupled-surface-split` 错误（退出码 1）。
- 空的工单列表会报 `no-tickets` 错误（退出码 1，"plan has no tickets; write one folded ticket"），无论是否有 `S#` 条目。只有一个标记为 `folded: true` 且覆盖所有 `S#` 的工单的计划可以通过。

`emet preflight` 会对已批准的计划再次运行它。

### `emet approve`

批准：`emet approve --run <id> --spec <file>` 写入带有规格和工单列表哈希的 `approval.json`。如果之后其中任何一个发生变化，派发会被拒绝（`--check`）。

- `--quick`：还会写入 `"mode": "quick"`，使该次运行的落地单位为 `wave`。不带它时该字段不存在，旧记录仍能通过 `--check`。

### `emet materialize-log`

创建工单：`emet materialize-log --run <id> --record/--lookup` 在每个工单一创建出来就立即保存其 ID，因此被中断的运行不会产生重复工单。

### `emet results`

工作者完成：`emet results --run <id> --write/--read <ticket>`。工作者写入本地结果文件（`DONE`、`DONE_WITH_CONCERNS`、`BLOCKED` 或 `NEEDS_CONTEXT`，外加一行 `Risk:`）。只有协调者可以写入跟踪器。

### `emet verify`

每个工作者之后：`emet verify <ticket> --run <id>` 检查在派发基线之后存在提交、每个变更的路径都在工单的编辑范围内、交接笔记通过 `handoff --check`，且 `commands.workerScopedSuite` 通过。评审和合并会拒绝没有通过记录的工单。

### `emet review-package`

评审输入：`emet review-package <base> <head> --out <file>` 为评审者打包 diff，评审者以文件路径的形式接收。如果范围为空，或不是 base 的后代，则以退出码 3 退出。

### `emet review`

评审：`emet review --ticket <t> --findings <file>` 维护问题台账，并强制执行分诊顺序（`intent_gap` → `bad_plan` → `patch` → `defer`）和轮数上限。

- `--base <ref>`：在第一轮把 `<ref>` 解析为 sha 并保存；之后的轮次沿用它，不同的 sha 会以退出码 2 退出并指出已保存的那个。对 diff `<base>..HEAD` 既未新增也未修改的行提出的问题，会以 `preexisting: true` 保存，`emet gate` 不将其计为阻塞项。
- `--findings <file>`：问题接受可选的 `s: "S<n>"`（相关的需求）、`userOption: "S<n>"` 以及 `agreement: "both"` 或 `"single"`。`userOption` 问题与 `(user option)` 需求相矛盾：它始终阻塞，即使早已存在；在 `gate.onHold: fix-and-continue` 下会得到 `hold` 且 `next: fix-findings`。非字符串的 `userOption` 以退出码 2 退出。
- `--coverage <file or -> [--expect S1,S3]`：把 Coverage verdicts 的 JSON 数组 `{s, verdict, test:{file,name}}`（`verdict`：`met`、`partial`、`unmet`）存为台账的 `coverage`，替换之前的内容，且不占用评审轮次。对于 `test` 缺失、文件不存在或不含 `test.name` 的每个 `met`，以及没有 verdict 的每个 `--expect` S#，它会开出一个 `VG-S<n>` 问题（major，`patch`）。`VG-` 问题只有在之后的 `--coverage` 不再产生它，或某个 recheck verdict 将其解决时才会关闭，绝不会因为在某轮 `--findings` 中缺席而关闭。它输出 `{coverage, open}`，只要有任何问题处于打开状态就以退出码 1 退出；它不运行测试。
- `--merge <a.json> <b.json>`（不带 `--ticket`）：输出一个合并后的问题数组供 `--findings -` 使用。两个问题在共享 `s`，或共享 `file` 且行号相差不超过 3 时配对，配对后保留第一个文件的 `id`、更高的严重程度以及 `agreement: "both"`。未配对的问题获得 `agreement: "single"`，来自第二个文件的冲突 id 会加前缀 `X-`；`userOption` 问题绝不会被丢弃。
- `--recheck --verdicts <file>`：结束一轮修复。只评估该轮开始时未处理的问题，问题只能通过裁决变为 `resolved`，且 recheck 计入 `budgets.fixRounds`（用尽时以退出码 1 并指明上限）。
- `--escalate`：升级到下一个模型层级。
- `--rule` 和 `--rulings`：记录并列出用于报告和 PR 正文的“我做出的裁定”。

### `emet gate`

合并或串联：`emet gate <ticket> --tier … --ci … --integration …` 以 JSON 打印 `merge`、`hold`、`chain`、`stop` 或 `defer` 及其原因。它会读取 verify 记录、未处理的问题、风险层级、CI、集成套件和预算。`hold` 带有 `next`：`fix-findings`、`rerun-failed-specs`、`rerun-ci` 或 `report-infrastructure`。参见 [`gate`](configuration.md#gate)。

- `--no-record`：使该决定不写入日志。

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
| `EMET_AUTO_UPDATE`            | `EMET_AUTO_UPDATE=0` 会禁用 `emet self update --auto`：它不进行任何网络调用并以退出码 0 退出。与 `emet self update --auto off` 相同。                                   |
| `EMET_AGENT_HOST`             | 设为 `codex` 时，`emet guard` 读取 Codex 的 hook 输入。由 Codex 的 hook 设置；在 Claude Code 上请保持未设置。                                                           |

`auto` 上限为 `clamp(min(cpuCount × EMET_CPU_OVERSUBSCRIBE, floor((memTotal − EMET_MEM_RESERVE_GIB) / EMET_MEM_PER_WORKER_GIB)), min, max)`。旧版的 `FORGE_*` 名称仍然会被读取；两者同时设置时，`EMET_*` 优先。

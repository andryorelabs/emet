---
title: 新功能
description: emet 的发布说明：每个版本都有哪些变化。
seoTitle: "emet 新功能：发布说明"
sourceHash: 946f5971d5a42a0b
---

## 0.19.0

2026-11-22

### 新增

- `emet memory search --json <query> [--limit <n>]` 和 `emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <outcome>` 在 Engram 中读写 Lessons。`search` 保留 topic key 以 `emet/<repo>/lessons/` 开头的笔记并输出其完整内容，`save` 为每个 run 向 spec 或 quick run 的笔记追加一个小节，内容为来自 stdin 的 1 到 5 条 bullet。两者都输出一个 JSON 对象，遇到任何 Engram 问题都以 0 退出，仅在用法错误时以 2 退出。
- 配置 schema 新增 `memory.enabled`（`auto` 或 `off`，默认 `auto`）。`off` 从不启动 `engram`。
- Phase 1 在第一轮访谈之前在记忆中搜索先前的 Lessons，并把相关的写入计划文件的 `## Prior lessons` 之下。wave 和 quick 的交接会在最终报告之前保存该 run 的 Lessons。`--draft` 不保存任何内容。
- `docs/reference/cli.md` 和 `docs/reference/configuration.md` 记录了 `emet memory` 和 `memory.enabled`，覆盖全部九种语言。

### 变更

- Codex 构建会拒绝生成的参考文档中出现 `mcp__engram`，因此 Engram 工具名从不会进入 Codex 插件。
- `/emet:run` 提示词新增上述记忆步骤；PATH 中没有 `engram`，或 `memory.enabled: "off"` 时，每个步骤只是一行说明，run 照常继续，与 0.18.0 相同。

## 0.18.0

2026-11-22

### 新增

- `emet review --ticket <t> --coverage <file|-> [--expect S1,S3]` 把 Coverage verdicts 存入 ledger。测试缺失或在工作树中找不到的 `met` 判定，以及没有判定的预期 S#，各会打开一个 `VG-S<n>` finding。
- `emet review --base <ref>` 在第一轮保存评审基准，并把 wave 未改动的行上的 finding 标记为 `preexisting`。`emet gate` 从不把已有的 finding 算作阻塞项。
- finding 接受可选字段 `s`、`userOption` 和 `agreement`。带 `userOption` 的未解决 finding 在所有 tier 和 severity 下都会阻塞，gate 返回 `hold` 并带 `next: "fix-findings"`。Phase 2 把来自用户所选选项的 S# 写作 `(user option)`。
- `emet review --merge <a.json> <b.json>` 把两个 finding 数组合并为一个。共享 `s`，或共享 `file` 且行距不超过 3 的 finding 会配对，并带上 `agreement: "both"` 或 `"single"`。
- `emet assess` 输出 `dualReview: {run, reason}`，配置 schema 新增 `review.dual`（`auto` 或 `off`，默认 `auto`）。在 PATH 中有 `codex` 的 Claude 主机上，`high` 的 wave 会运行 Dual review：并行运行 `emet:emet-reviewer` 和 `emet review-run --tier high --coverage-out <file>`，然后执行 `emet review --merge`。
- `emet review-run --coverage-out <file>` 写出 Codex 评审者的 Coverage verdicts，其输出 schema 接受可为 null 的 `s` 和 `userOption`。
- `docs/reference/cli.md` 和 `docs/reference/configuration.md` 记录了评审变更，覆盖全部九种语言。

### 变更

- 评审者提示词和 `agents/emet-reviewer.md` 要求提供 Coverage verdicts 文件 `.emet/coverage-<run>.json`，而不是一行散文式的 `S<n>: met | partial | unmet`。Phase 8 用 `emet review --coverage` 记录判定，并在 wave 报告中列出已有的 finding 而不修复它们。
- 不使用 `--base`、`--coverage`、`--merge` 或 Dual review 时，所有命令的行为与 0.17.0 相同。

## 0.17.0

2026-11-22

### 新增

- `/emet:run --quick <变更>` 为可放入一个工单的变更运行 Quick run：一轮访谈、一份带有一个 folded 工单的 spec、一次批准、一个 worker、审查，并将这唯一的 Wave 以 pull request（或本地 merge）的方式完成 Landing，不运行 `emet chain`。当变更涉及界面或无法放入一个工单时，它会在批准前停止，并建议改用不带 `--quick` 的 `/emet:run`；与 `--draft` 或 `--dispatch` 一起使用时会被拒绝。接受 `--no-promote`。具体步骤见新增的 `emet/reference/phases-quick.md`。参见 ADR-0039。
- `emet assess --quick` 在原有 JSON 之外输出 `"quickRejected"`，当风险等级为 `high` 时以退出码 `1` 结束。Quick run 将其视为 Gate 的 Stop：不自动 merge，pull request 保持打开，最终报告会列出高风险原因。不带 `--quick` 时，输出和退出码保持不变。
- `emet approve --quick` 会把 `"mode": "quick"` 写入 `approval.json`。此前写入的记录仍可通过 `--check`。
- `resolveLandingUnit(config, runId, root)` 对以 `--quick` 批准的运行返回 `wave`，其他情况返回 `config.landing.unit`。`emet landed`、`emet status` 和 `emet preflight` 通过它读取 landing 单位，因此 Quick run 不会再期望存在 spec 分支。
- 当计划没有任何工单时，`emet validate` 会报告 `no-tickets` 错误，并提示编写一个 folded 工单。
- `docs/reference/cli.md` 和 `docs/guide/trackers-and-landing.md` 记录了 Quick run，涵盖全部九种语言。

### 变更

- `phases-1-5.md` 中关于快速路径的句子现在要求：对低于阈值的请求，编写一个标记为 `folded` 的工单，而不是不写任何工单。
- 缺少 `--run` 时，`emet preflight --approval <run>` 会根据该运行的批准记录确定 landing 单位。

## 0.16.0

2026-11-21

### 新增

- 活规范(living specs),默认关闭。设置 `specs.enabled: true` 后,在某个 spec 的最后一个 wave 中,协调器会写入该 spec 的需求增量 `ADDED`/`MODIFIED`/`REMOVED`,在该 wave 评审之前于其集成分支上运行一次 `emet spec-merge --spec <id>`,并提交更新后的 `docs/specs/<area>.md`,因此这次变更会在同一个 pull request 中被评审并落地。新的参考文档 `living-specs.md` 给出增量格式和重试规则。参见 ADR-0038。
- 配置及两份 schema 副本中新增 `specs.enabled`(默认 `false`)。`emet init` 会写入 `"specs": { "dir": "docs/specs", "enabled": false }`。
- 仅当 `specs.enabled` 为 `true` 时,如果 `specs.dir` 被 gitignore 忽略或是一个文件,`emet doctor` 会发出警告。缺少 `specs.dir` 不会触发警告。
- `emet spec-merge --spec <id> --deltas-dir` 会创建并打印共享的增量目录 `<git common dir>/.emet/runs/<id>/spec-deltas`,不执行合并,并以退出码 `0` 结束。
- `landing.specMergeMethod` 接受 `merge`(默认)、`squash` 和 `rebase`,这样 spec 就能落地到只允许 squash 合并的 trunk 上。当仓库设置或 trunk 的 ruleset 不允许所配置的方式时,`emet doctor` 会发出警告。参见 ADR-0037。
- 如果生成的 `codex/` 目录中有文件没有对应的源文件,`bun run check:codex` 会失败。

### 变更

- 当 `specs.enabled` 关闭时,`emet spec-merge` 会打印 `specs.enabled is false; nothing merged` 并以退出码 `0` 结束。它从 git common dir 下的共享运行目录读取增量,找不到时回退到各个 checkout 自己的 `.emet/runs/<id>/spec-deltas/`。
- 阶段 8 的提示词不再在 wave 或 spec 落地后运行 `emet spec-merge`;改为由 `phases-8-review.md` 在最后一个 wave 加载 `living-specs.md`。
- `emet spec-branch land` 使用与 `emet ci` 相同的轮询器等待 PR 的检查,即使 PR 还没有任何检查也会继续轮询,并使用 `landing.specMergeMethod` 合并。

### 已修复

- `emet spec-branch land` 不再在 GitHub 登记任何检查之前就合并。
- `emet setup` 只列出一次 Claude 插件,而不是最多三次,并且它的静默探测会超时而不是挂起。
- `emet doctor` 每次运行只列出一次已安装的插件。
- `bun run lint` 和 `bun run fix` 会先为站点生成 Astro 类型,因此在全新的 checkout 上也能通过。

## 0.15.0

2026-11-21

### 变更

- `landing.unit` 默认值为 `spec`:一个 spec 的各个 wave 通过 `emet spec-branch` 集成到分支 `spec/<id>`,spec 只落地一次,即一个 pull request(在 `landing.mode: merge` 下为一次本地合并),而不是每个 wave 一个 pull request。设置 `"landing": { "unit": "wave" }` 可保持旧行为。`spec` 模式需要在 Claude Code 设置中配置 `worktree.baseRef: "head"`。参见 ADR-0037。
- 日志新增 `spec.integrate`、`spec.land` 和 `spec.abandon` 三种类型,`emet status` 新增 `specBranch`。

## 0.14.5

2026-11-21

### 新增

- `emet handoff --check` 会解析 worker 交接笔记中的 `skills:` 部分(`none`,或 `loaded: a, b; missing: c`)。当 `state` 为 `done` 时该部分必填。`--expect-skills a,b` 会对每个不在两个列表中的指定 skill 判定检查失败,并输出缺失的 skill。
- 派发记录带有可选的 `skills` 数组,`emet verify` 会把它作为 `--expect-skills` 传给 `emet handoff --check`。没有 `skills` 的记录仍可解析。
- ADR-0036 允许工单在点名段落时修改已安装提示词的措辞,同一个 pull request 会同时提高字节上限。

### 变更

- 第 8 阶段的提示词拆分为 `phases-8-review.md` 和 `phases-8-landing.md`。`install.sh` 会停用旧的 `phases-8-closeout.md`:已编辑或早于清单的副本会移到 `phases-8-closeout.md.retired`,未编辑的副本会被删除。
- worker 提示词要求它在最终交接前写下 `skills:` 行。
- 架构页面、CLI 参考及其九种翻译描述了第 8 阶段的两个文件和 `--expect-skills`。

## 0.14.4

2026-11-20

### 新增

- 在 Codex 宿主上，当 emet 插件已在 `$CODEX_HOME/config.toml` 中启用，但 Codex 尚未信任其任何钩子（因此 emet 守卫不会运行）时，`emet doctor` 会发出警告。该警告不会改变退出码。

### 已修复

- 当插件版本对应的发布资源暂时无法下载时，`bin/emet` 会对所有命令（而不仅是 `emet guard`）运行最新的缓存二进制文件，并输出一条提示，说明发布可能仍在进行中。设置 `EMET_PREFETCH=1` 时，它会输出提示并以 `0` 退出，不运行该文件。校验和不匹配或缺少 `SHA256SUMS` 时仍然从不回退，并且下载的临时目录会在回退之前被删除。

## 0.14.3

2026-11-20

### 新增

- `emet fleet launch --dry-run` 会运行就绪检查，并为每个仓库输出 `would launch <name>`，而不会启动会话。

### 已修复

- `emet migrate` 会删除与 `.emet/` 副本内容不同且未被跟踪的旧 `.forge/` 运行文件，并保留 `.emet/` 中的版本，因此在残留日志的仓库中也能完成。它无法解决的每个冲突都会连同手动步骤一并列出，仓库内的 git 失败会被视为冲突，而不是删除文件。
- 测试 preload 会在运行结束时删除自己的 `emet-test-state-*` 目录，因此 `bun test` 不再每次运行都留下一个临时目录。

## 0.14.2

2026-11-20

### 已修复

- `emet promote` 会等待同步拉取请求的检查，仅在检查通过后才合并，而不是立即合并。失败、超时或被拒绝的同步拉取请求会保持打开，不会让 promote 失败，结果和日志事件中包含 `syncMerged` 和 `syncReason`。

## 0.14.1

2026-11-20

### 新增

- 当 GitHub 工单的最后一个子 issue 被关闭时，`emet tracker close` 会关闭其父级 spec issue，并在新的 `specs` 字段中报告每个 spec。读取或关闭 spec 失败时以 `1` 退出。
- 即使 GitHub 的子 issue 摘要尚未更新，spec 也会关闭：会逐个统计该 spec 的子 issue，包括在同一次调用中关闭的工单。

## 0.14.0

2026-11-20

### 新增

- 当 `emet init` 找到 Prisma schema（`prisma/schema.prisma` 或 `prisma/schema/`）或 Drizzle 迁移文件夹时，会设置 `schema.ownedPaths`，并移除 schema 归属的 `TODO(emet):` 标记。
- `agent-browser` 设置项在 `~/.agent-browser/config.json`（`contentBoundaries` 和 `maxOutput`）不存在时写入该文件，并在安装后运行 `agent-browser doctor`。参见 ADR-0035。
- 当主机限制非特权用户命名空间时，`emet setup` 会输出 `agent-browser` 所下载 Chrome 的 AppArmor 配置文件，以及加载它的 `sudo` 命令。它从不自行运行 `sudo`。

### 变更

- `firecrawl-local` 设置项使用 `FIRECRAWL_CLOUD=search` 而非 `off` 注册 MCP 服务器，替换之前的注册，并将最新的 `agent-browser` Chrome 作为 `FIRECRAWL_CHROME_PATH` 传入。参见 ADR-0035。

### 已修复

- `emet setup` 注册 `firecrawl-local` MCP 服务器时将服务器名称放在最前，因此注册能被正确解析。
- `emet --help` 列出注册表中的所有命令（setup、fleet、insights、chain、promote、whats-new、deploy-check、ci、run）。
- 测试不再写入 `~/.local/state/emet` 下的真实日志。

## 0.13.0

2026-11-20

### 新增

- `emet setup` 提供 `context7` 和 `firecrawl-local` 两个条目(默认均关闭)。`context7` 安装 `ctx7` CLI 及其 `find-docs` skill。`firecrawl-local` 使用 `cargo` 构建 Firecrawl Local,并将其注册为仅限本地的 MCP 服务器(`FIRECRAWL_CLOUD=off`、`--public-only`)。参见 ADR-0034。
- `emet review-run --browser-verify true|false` 把浏览器维度传给 Codex 审查者。
- `emet.config.json` 中的 `validate.coupledSurfaces` 和 `emet validate` 的 `coupled-surface-split` 错误会让页面及其译文留在同一波次。参见 ADR-0033。

## 0.12.0

2026-11-20

### 新增

- `emet.config.json` 中的 `verify.browser`(`startCommand`、`url` 和可选的 `paths`)可让仓库通过 `agent-browser` 在浏览器中验证界面变更。配置模式及其解析器会校验每个字段。
- `emet assess` 会输出 `browserVerify: { run, reason }`。只有当该波次有评审者、已配置 `verify.browser`、`agent-browser` 位于 PATH 中且有变更路径匹配 `paths` 时,才会运行浏览器维度。
- `emet setup` 新增 `agent-browser` 项(默认关闭),用于安装最新版本及其浏览器。
- 对于配置了 `verify.browser` 的仓库,`emet doctor` 会报告一条可选的 agent-browser 检查结果。二进制文件缺失或 `agent-browser doctor` 失败只会显示为提示或警告,不会改变退出码。
- 评审者提示词新增浏览器维度,仅在 `browserVerify.run` 为 true 时填充;工作者提示词新增一行可选内容,用于浏览器检查。参见 ADR-0032。

## 0.11.1

2026-11-19

### 已修复

- 在原生 Windows（Git Bash）以及任何不受支持的操作系统或架构上，`bin/emet` 会以退出码 0 结束而不是失败，因此 PreToolUse 守卫不再阻止每一次工具调用。只有会话开始时的 prefetch 会输出一条通知。
- `install.sh` 在 `MINGW*`、`MSYS*` 和 `CYGWIN*` 上会在写入任何内容之前拒绝运行。
- Codex 钩子带有 `commandWindows` 覆盖项，因此 Windows（PowerShell）上的 Codex 不再在每个事件上报错。

## 0.11.0

2026-11-19

### 新增

- `emet whats-new` 会在更新后首次运行 emet 时输出一行带有发布说明链接的通知,然后记录当前运行的版本。使用 `--hook` 时,它会将该行作为 `systemMessage` JSON 对象输出,供会话钩子使用。

## 0.10.0

2026-11-19

### 新增

- `handoff.afterSpec` 接受按顺序排列的 `{ paths?, mode }` 规则列表,因此同时包含 CLI 和网站的仓库可以发布 CLI 并推进网站。模式根据将 `develop` 推进到 `main` 时会带入的路径来选择。
- `deploy.check.paths` 将部署检查限制在触及所列 glob 的推进上。
- `emet promote` 会输出 `rule` 和 `reason` 并记入日志,同时输出 `deployCheck: { run, reason }`。

### 变更

- 部署检查不再依赖 `afterSpec`:在主干 `main` 上最终 wave 干净完成后运行,在 `develop` 上则于推进合并后运行。协调器在每个 spec 之后都会运行 `emet promote`,`afterSpec` 为 `none` 时也不例外。

## 0.9.1

2026-11-19

### 已修复

- `emet setup` 现在接受 `--data-dir`,插件的 SessionStart 钩子不再因 `unknown flag --data-dir` 而失败。

## 0.9.0

2026-11-19

### 新增

- `emet gate` 采用“修复后继续”策略：被搁置的 wave 会运行修复轮次，直到问题解决或 `budgets.fixRounds`（默认 2）用尽，然后停止。`gate.onHold` 可选 `fix-and-continue`（默认）或 `stop`。`emet review --recheck` 只通过评审者的裁定来解决问题。
- `emet ci --wait` 轮询拉取请求的检查，重跑不稳定的作业，并报告 `pass`、`fail`、`env-fault` 或 `timeout`。`emet tracker close` 以幂等方式关闭 GitHub 工单，`emet chain` 将 gate、readiness、launch 和 verify 作为一步执行。
- 事件日志记录 gate 决策、干预、启动、工单关闭和清理，并按大小轮转。`emet insights` 对其进行汇总（`--mark-baseline` 重置基线），`emet run current` 显示当前的 spec 和 wave，`emet status --brief` 以一行输出状态。
- 配置键 `language.conversation` 和 `language.artifacts`。
- 配置键 `handoff.afterSpec`（`release`、`promote` 或 `none`，由 `emet init` 检测，或用 `emet init --after-spec` 设置）、`deploy.check` 和 `interview.research`。
- `emet promote` 在最后一个 wave 空闲时打开从 `develop` 到 `main` 的拉取请求，检查通过后合并，并在 `develop` 落后时把 `main` 同步回来。`--no-promote` 会在 spec 的所有会话中搁置它。
- `emet deploy-check` 会重试部署检查命令，并终止挂起的命令。
- `emet fleet list | set | launch` 可跨多个仓库运行 spec。
- `emet setup` 和 `/emet:setup` 在备份 Claude 设置后，从目录中安装可选的配套组件。SessionStart 钩子只显示一次提示，`install.sh` 在 TTY 中运行 setup。
- `emet doctor` 和 `emet init` 会推荐 Engram，但绝不把它算作未满足的依赖。

### 变更

- 安装的提示词和文档现在说明了 gate 策略、`emet ci`、`emet chain`、日志、spec 之后的步骤、fleet 和 setup。第 8 阶段新增 wave 摘要和推送通知，`emet insights` 取代了对 `/retro` 的指引。

### 已修复

- `--no-promote` 现在以标记形式保存在 git 公共目录下，因此针对最后一个 wave 的链式 `/emet:run --dispatch` 会话不会再把 `develop` 提升到 `main`。

## 0.8.6

2026-11-17

### 已修复

- 发布工作流在对标签重新运行检查之前会安装 Chromium，与 CI 测试作业一致，因此验证不再卡在 `tools/` 的覆盖率下限。v0.8.5 因此只打了标签而从未发布；其变更包含在此版本中。

## 0.8.5

2026-11-17

### 变更

- 覆盖率门禁对 `emet/`、`apps/site` 和 `tools/` 按文件要求行覆盖率不低于 97 %、函数覆盖率不低于 98 %，有理由的例外记录在 `tools/coverage-exceptions.ts`。覆盖率清单会递归遍历 `emet/src`，`tools/` 也纳入门禁，`tools/coverage-floors.json` 中的总计升至实测值。
- PreToolUse 守卫改为失败即关闭：当 `bin/emet` 无法解析 emet 二进制文件时，钩子以退出码 2 结束并阻止工具调用，同时给出说明如何恢复的消息。Stop 和 SubagentStop 钩子仍以退出码 1 结束。
- 插件清单现在包含作者邮箱、许可证、主页、仓库和问题反馈 URL，Codex 技能的描述也说明了每个技能何时使用。

### 已修复

- `emet doctor` 在出现意外错误时以退出码 3 结束，而不是 0。之前设置的非零退出码会被保留。
- `emet cleanup --all --force` 会回收已失效运行的 worker 的 worktree 和分支，包括 `.claude/worktrees/` 下的 worktree。存活或空闲的所有者，以及没有指明任何运行的锁，仍受保护。
- 编辑守卫能匹配按字面书写的范围，例如 `src/app/[locale]/page.tsx`。范围中的 `[` 和 `]` 不再是字符类。
- 当仍持有预留或槽位的工单丢失了其 worker worktree 时，`emet preflight --post-dispatch` 会失败，并提示协调者重新派发而不是恢复它。
- 编译后的 `emet` 二进制文件不再加载当前目录中的 `.env` 文件。
- 网站移除了首页的内联样式属性，让浅色模式下的首页标签达到 AA 对比度，并从首次渲染起就用可见文本为搜索按钮命名。文档图片改由网站自身源的 `repo-assets` 提供，而不是 `raw.githubusercontent.com`，`astro dev` 也会提供它们。

## 0.8.4

2026-11-15

### 变更

- 首页页眉现在分为两端的两组：左侧为字标和 Docs，右侧为搜索、GitHub 星标、主题和语言。控件和版本标签采用叠在天空上的半透明玻璃效果，并移除了首页页眉和菜单中重复的“更新日志”链接。

## 0.8.3

2026-11-15

### 已修复

- `/docs/` 以及各语言的 `/docs/` 现在通过 301 重定向到快速开始页面，而不是先闪现一个无样式的 meta-refresh 页面。

## 0.8.2

2026-11-11

### 修复

- 只要工作树 `<name>` 仍然存在，`emet cleanup` 就会保留 `worktree-<name>` 脚手架分支，这样在其中另一个分支上工作的会话仍保有其宿主所需的分支。

## 0.8.1

2026-11-11

### 新增

- `emet cleanup` 会删除 Agent host 留下的 `worktree-<name>` 脚手架分支，前提是它没有在任何地方被检出，并且主干已包含其顶端提交。

### 修复

- guard 会拒绝任何将删除标志与强制标志组合的强制删除分支写法，而不仅仅是大写标志。

## 0.8.0

2026-11-11

### 新增

- `emet cleanup` 在所有模式下都会删除其 pull request 已在分支顶端提交处合并的每个本地分支，以及持有该分支的干净且未锁定的代理工作树。集成分支、发布分支和修复分支不再需要手动删除。
- `bun run translations:status` 列出落后于源文件的 Website 翻译。

### 变更

- guard 拒绝强制删除分支时会指向 `emet cleanup`。
- 发布手册涵盖了 `whats-new` 的翻译。

## 0.7.0

2026-11-11

### 新增

- Website 在 `https://emet.andryore.dev/schema/emet.config.schema.json` 提供配置 schema。
- `docs/development.md` 和 `docs/security.md`。
- 每个 workspace 的覆盖率下限，由 `bun run test` 强制执行。

### 变更

- `emet init` 在 `emet.config.json` 中写入公开的 `$schema` URL，而不是本地路径。
- 发布标签带有签名；当该标签对应的 CHANGELOG 章节缺失或为空时，Release 工作流会失败。
- 仓库遵循 andryorelabs 标准 v1：以代码管理的 ruleset、社区文件、README 结构和标准脚本名（`format:write`、`lint:commits`）。

## 0.6.1

2026-11-10

### 已修复

- 两个进程同时回收同一个过期锁时，不再可能同时进入临界区；claim、Mailbox、tracker 和 `acquireLock` 共用一个受保护的回收流程。
- 并发调用 `emet tracker create-ticket` 不再间歇性失败。

## 0.6.0

2026-11-10

### 新增

- 面向 Codex worker 的 Mailbox:`emet ask` 记录一个问题(并可用 `--wait` 轮询回复),`emet inbox` 列出未解决的问题,`emet reply` 回答其中一个,这样 worker 不再需要通过交接说明来上报。
- 当运行中的 worker 有未解决的问题时,`emet dispatch --wait` 会输出 `question <ticket> <id>`,并且绝不会将该 worker 判定为停滞。
- `emet claims --reserve` 会保存工单的编辑范围,并拒绝与其他运行的范围重叠的预留。

### 修复

- `emet dispatch --wait` 从 git-common-dir 的运行目录读取结果,`emet results --write` 正是把结果写到那里。

## 0.5.2

2026-11-10

### 变更

- 不隶属声明现在除 Anthropic 外也写明了 OpenAI。
- 主页的安装标签页改称 Claude Code，运行命令新增了显示 `$emet:run` 的 Codex 标签页。
- 指南标明了每个步骤适用于哪个 Agent host：Claude Code 或 Codex。

### 修复

- 在 Codex 主机上，`emet doctor`、`emet init`、`emet dependencies` 和 `emet preflight` 不再给出仅适用于 Claude Code 的建议。
- `emet init --force` 会保留现有配置中的 `agentHost` 和 `codex` 部分。

## 0.5.1

2026-11-10

### 变更

- README、落地页、横幅、指南和分享图片现在在 Claude Code 之外也提到 Codex。

## 0.5.0

2026-11-10

### 新增

- Website 首页：手绘主视觉、工作原理、功能、关于、收尾面板、页眉和页脚，英文字符串位于
  `apps/site/src/i18n/ui/en.ts`。
- `/docs/` 下的 Website 文档：由仓库文档白名单和本更新日志构建的 Starlight 页面，
  带有 Pagefind 搜索、指向站点页面或 GitHub 的链接重写，以及译文缺失或过期时的
  英文回退提示。
- `docs/how-to/update-emet.md`：如何更新插件并开启市场自动更新。
- 将 Codex 作为 Agent 宿主：`emet.config.json` 中的 `agentHost`；`emet dispatch` 和
  `emet review-run` 将每个 worker 和 reviewer 作为 `codex exec` 进程启动，另有
  `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能、Codex 插件清单，以及可选启用的
  端到端测试（`EMET_CODEX_E2E=1`）。
- `docs/guide/codex.md`，即 Codex 指南，已发布到 Website。

### 变更

- Codex 的 `codex.sandbox` 默认值为 `danger-full-access`（仍接受 `workspace-write`），
  由 `emet dispatch`、`emet review-run` 以及 Codex 的 `emet launch` 传入；Codex 上的
  `emet guard` 会拒绝所有 push 形式。
- 每次运行的 Codex 覆盖层会写入自己的最小 `config.toml`，而不是链接你的配置，其规则
  允许 `-C` 形式和协调子命令，同时仍禁止 push。
- Codex worker 通过其 `threadId` 和 JSONL 路径来识别，而不是 pid。
- Codex 指南报告了真实 Codex 的结果：之前每个 `failed` 行现在都是 `verified`，
  `unverified` 列表缩减为无人值守的监督，探测报告列出了剩余的后续事项。

### 修复

- `emet cleanup` 会回收已合并且无归属的 worktree。
- Codex Agent 宿主现在默认可解析，因此 `emet preflight`、`doctor`、`cleanup`、
  `status` 和 `usage` 接受 `agentHost: "codex"`。
- Codex 模型解析会从运行主目录或你真实的 Codex 主目录读取 `models_cache.json`。

## 0.4.0

2026-11-06

### 新增

- `emet-mascot` 的 `position` 选项（`pane`、`band` 或 `status`）；`pane` 为默认值，
  无法停靠时会回退为横条。
- README 中新增“Mascot (optional)”一节。

### 变更

- `emet-mascot` 的帧会被对齐到六种吉祥物颜色，而不是因缩放而变模糊，
  因此像素画在终端中清晰锐利。
- `emet-mascot` 0.2.0：默认的 `size` 现在是 `small`。
- `docs/how-to/orca-pet.md` 现在是 `docs/how-to/mascot.md`，同时涵盖模组和
  Orca 宠物。

## 0.3.0

2026-11-05

### 新增

- 插件命令 `/emet:init` 和 `/emet:doctor` 在 Claude Code 内运行 `emet init` 和
  `emet doctor .`，并总结结果。
- `emet doctor` 会对 `~/.claude/settings.json` 中二进制文件已不存在的
  `forge guard` 和 `emet guard` 钩子发出警告，并打印一条先备份、再用 `jq`
  移除它们的命令。它不会编辑该文件。
- 吉祥物基础设施：阶段文件、宠物包、模组状态机、其余的阶段写入器和
  栅格帧。
- `emet-mascot`：一个可选插件，在提示符上方显示像素吉祥物，并反映会话以及
  `emet` 运行的阶段。它已列入市场，并附有 Orca 宠物的使用指南和 ADR-0016。

### 修复

- 插件不再暴露损坏的重复命令 `/emet:emet`；`commands/` 被固定为 `run.md`、
  `init.md` 和 `doctor.md`。
- 下一个波次现在使用插件注册的命令 `/emet:run` 来启动。

### 变更

- 仓库迁移到了 `andryorelabs` GitHub 组织。发布下载、README 徽章和克隆 URL
  现在都指向 `andryorelabs/emet`；旧的 `AndryOre/emet` URL 仍会继续重定向。
- 独立安装会将 `/emet` 重命名为 `/emet:run`，与插件保持一致。`install.sh`
  现在会把 `commands/run.md`、`init.md` 和 `doctor.md` 安装到
  `~/.claude/commands/emet/`，因此无需插件也可使用 `/emet:run`、`/emet:init`
  和 `/emet:doctor`。旧的 `~/.claude/commands/emet.md` 在未被编辑时会被移除；
  被编辑过的副本会被保留，并列入安装摘要。

## 0.2.0

2026-11-05

### 变更

- 项目从 claude-forge 更名为 emet：CLI 是 `emet`，命令是 `/emet`，代理是
  `emet-worker` 和 `emet-reviewer`，README 也采用了新品牌。现有的安装和仓库
  仍可继续使用：旧名称（`forge.config.json`、`.forge/`、`docs/agents/forge.md`、
  `FORGE_*`）仍会被读取并给出提示，`emet migrate` 会把仓库迁移到新名称。

### 新增

- `install.sh` 无需 Bun 即可运行：它会把独立二进制文件的 shim 安装为
  `~/.local/bin/emet`，改写它所复制提示词中的插件占位符，把 `commands/run.md`
  安装为 `~/.claude/commands/emet.md`，并接受用 `shasum -a 256` 代替 `sha256sum`。
- README 说明了真实的要求、两种安装方式，以及先运行 `/setup-matt-pocock-skills`
  再运行 `emet init` 的顺序。
- 代理指南（`AGENTS.md`）、领域术语表（`GLOSSARY.md`）以及 `docs/adr/` 下的
  架构决策记录。
- 基于 `.scratch/` 约定的本地 Markdown 跟踪器，带有 `emet tracker` CLI
  （`create-spec`、`create-ticket`、`frontier`、`set-state`、`comment`、`close`），
  以及能识别本地跟踪器的 `emet validate`、`preflight` 和 `doctor`。
- `landing.mode`（`pr` 或 `merge`）和 `emet land`，后者无需 PR，通过一次本地
  合并来落地一个波次；在 merge 模式下，`emet cleanup` 和 `emet status` 会与
  本地主干比较。
- 独立的 `emet` 二进制文件、`emet --version`、CI 以及进程树和内存制动中的
  macOS 支持，还有带 `bin/emet` shim 的插件清单。
- 带有 `emet skill-path` 的技能契约，以及覆盖技能、术语表、弃用项和重复安装的
  更全面的 `emet doctor`。
- 面向 JS、Go、Rust 和 Python 仓库的、与语言无关的 `emet init` 和 `emet map`。
- ADR-0007 到 ADR-0011。
- 文档索引、架构代码地图、按症状划分的故障排除、更丰富的 PR 模板，以及包含
  仅限运行时规则的 `emet/AGENTS.md`。

### 变更

- 只有当 `tracker.kind` 为 `github` 或 `landing.mode` 为 `pr` 时才需要 `gh`。
- `emet init` 不再默认选择本地跟踪器。
- 修订了 ADR-0004：一个波次以一个 PR 或一次本地合并的方式落地。

## 0.1.0

2026-11-03

### 新增

- 全局 `/forge` 命令：访谈、规格、工单、一次批准，然后由并行的工作树代理
  无人值守地实现、测试并合并一个功能。
- `forge` CLI，包含 `init`、`doctor`、`preflight`、`selftest`、认领、槽位、
  关卡、交接检查、结果和指标等子命令。
- `forge-worker` 和 `forge-reviewer` 代理。
- 面向 Linear 和 GitHub Issues 的跟踪器。
- 通过 `forge.config.json` 进行的仓库级配置。
- `install.sh`，用于安装 CLI、命令和代理。

---
title: 新功能
description: emet 的发布说明：每个版本都有哪些变化。
seoTitle: "emet 新功能：发布说明"
sourceHash: cf04666a1d6178fa
---

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

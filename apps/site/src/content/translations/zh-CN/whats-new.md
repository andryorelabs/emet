---
title: 新功能
description: emet 的发布说明：每个版本都有哪些变化。
seoTitle: "emet 新功能：发布说明"
sourceHash: a633f8ebdf12e2a7
---

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

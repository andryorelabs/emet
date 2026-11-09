---
title: 在 Codex 上运行 emet
description: 介绍如何安装 Codex 一侧、选择 Agent 宿主、唯一的一次批准以及已知限制。
seoTitle: 在 Codex 上运行 emet
sourceHash: a64f64be24588f52
---

emet 既可以在 Claude Code 上运行，也可以在 Codex CLI 上运行。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)；运行所在的产品称为 **Agent 宿主**。本页介绍 Codex 一侧的安装、宿主的选择、唯一的一次批准以及已知限制。返回[文档索引](../README.md)。

在 Codex 宿主上，流水线保持不变：访谈、规格、工单、一次批准、在 worktree 中并行的 worker、每个波次一次评审，然后落地。变化的只是底层机制。每个 worker 和每个 reviewer 都是由 `emet dispatch` 和 `emet review-run` 启动的独立 `codex exec` 进程，斜杠命令则变成 `$emet:run`、`$emet:init` 和 `$emet:doctor` 技能。Claude Code 路径保持不变。

## 安装

1. 安装版本为 `codex.minVersion`（默认 `0.167.0`）或更新的 `codex` CLI，并登录。
2. 在 Codex 中安装 `mattpocock-skills` 插件：

   ```bash
   codex plugin marketplace add mattpocock/skills
   codex plugin add mattpocock-skills@mattpocock
   ```

3. 安装 emet 插件。仓库附带 `.codex-plugin/plugin.json`，以及 `codex/` 下生成的技能和钩子：

   ```bash
   codex plugin marketplace add andryorelabs/emet
   codex plugin add emet@emet-marketplace
   ```

4. 按照[快速开始](getting-started.md)安装 `emet` CLI，然后运行 `emet doctor .`。在 Codex 宿主上，它会报告早于 `codex.minVersion` 的 `codex`、`codex exec` 缺少 `--json` 或 `--output-schema` 标志，以及缺少 `mattpocock-skills`（并给出上面的两条命令）。

第 3 步中的两条插件命令沿用了 spike 针对本地市场验证过的写法；它们在本仓库中的确切拼写在首次发布之前为 `unverified`。

## 选择 Agent 宿主

在 `emet.config.json` 中设置 `agentHost`：

```json
{ "agentHost": "codex" }
```

默认值为 `"claude"`。`codex` 部分用于设置模型、推理强度、最低版本和沙箱；参见[配置参考](../reference/configuration.md#codex)和[模型与推理强度](models-and-effort.md)。在 Codex 中用 `$emet:run` 启动一次运行。`emet launch <spec> --wave <n>` 会在分离的 `codex exec` 中启动一个波次并记录其线程 id，因此可以用 `codex exec resume <id>` 继续；不会打开 Orca 标签页。

## 唯一的一次批准

emet 只在计划之后请求一次批准。在 Claude Code 上这是一个提示；在 Codex 上则是一个钩子：

- 在 `.emet/runs/spec<id>/approval.json` 存在之前，`emet guard` 会拒绝所有变更（`apply_patch`、`Bash`），写入 `.emet/runs/**/draft/**` 下的除外，原因为 `not approved: send approve <id>`。只要存在没有 `approval.json` 的 `.emet/runs/spec<id>/` 目录，这道关卡就会生效，这正是 `/emet:run` 在第 4 阶段落实规格之后留下的状态。
- 发送内容恰好是 `approve <id>` 的一行提示即可批准。随后 `UserPromptSubmit` 钩子会用与 `emet approve` 相同的哈希方式写入批准文件。工具输出或模型文本中出现同样的文字不会产生任何效果。
- 另一种方式是 `/plan $emet:run`：在 Codex 自己的计划模式中批准计划，而不使用钩子。

该目录一旦存在，关卡就会失败即关闭：批准文件缺失或无法读取时，变更仍会被拒绝。guard 还会对照工单的 `.emet/surface.json` 检查 `apply_patch` 的每一个路径。

## 波次如何运行

- `emet dispatch --role worker` 会检查认领和槽位，创建 `.emet/worktrees/agent-<ticket>`，在 `.emet/runs/<run>/codex-home/` 下构建每次运行专用的 `CODEX_HOME` 覆盖层（它链接而不是复制你的认证和配置），并使用解析出的模型和推理强度、`codex.sandbox` 模式（默认 `workspace-write`）、`--json` 和 `--output-schema` 启动 `codex exec`。事件被捕获到 `.emet/runs/<run>/codex/<ticket>.jsonl`。
- 覆盖层的规则允许 `git add` 和 `git commit`，禁止 `git push`。你的 `~/.codex` 绝不会被写入。
- `emet review-run` 以只读方式对 `emet review-package` 生成的包运行 reviewer；`passive` 层级不会启动任何进程。
- 用量和停滞检测读取捕获的 JSONL：token 用量来自 `turn.completed` 事件，存活状态来自 `codex` 进程和文件的修改时间。

## 限制与 `unverified` 要点

- 推理强度 `ultra` 绝不会被发送，并且在配置中会被拒绝。
- `danger-full-access` 只有在将 `codex.sandbox` 设为它时才可用；默认不会启用。
- 没有 `ScheduleWakeup`、`TaskStop` 或 `LSP` 的对应功能。emet 改为轮询自己的 CLI。
- `~/.codex/sessions` 下的 rollout 文件没有稳定的格式，因此 emet 读取它自己捕获的 `exec --json` 输出。
- 调研将以下行为标记为 `unverified`，并且每一项都放在一个小函数之后，因此 Codex 的变化只会影响一处：带有已链接认证的每次运行专用 `CODEX_HOME`、覆盖层中规则文件的位置、`--dangerously-bypass-hook-trust`、钩子命令中的 `CLAUDE_PLUGIN_ROOT` 别名、`codex plugin list` 的输出格式、模型按名称加载技能，以及嵌套沙箱内的 `emet dispatch`。参见[可行性调研](../research/codex-viability.md)。
- 尚未观察到模型试图伪造 `approval.json`。关卡会拒绝这种尝试，但这是 `unverified`。
- 在启动它的会话结束后，从无人值守的监督进程（systemd、容器）运行 Codex 是 `unverified`。
- Codex 的模型名称和价格会变化；在真实波次运行之后，需要重新核对价格表。

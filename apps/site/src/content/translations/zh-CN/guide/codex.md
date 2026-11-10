---
title: 在 Codex 上运行 emet
description: 介绍如何安装 Codex 一侧、选择 Agent 宿主、唯一的一次批准以及已知限制。
seoTitle: 在 Codex 上运行 emet
sourceHash: 2941f08113ffa231
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

4. 按照[快速开始](getting-started.md)安装 `emet` CLI，然后运行 `emet doctor .`。`install.sh` 还会在 `~/.claude` 下安装 Claude Code 的命令和代理；这在 Codex 上无害，`emet doctor` 也不会对同时使用 Codex 插件和 `install.sh` 发出警告。在 Codex 宿主上，它会报告早于 `codex.minVersion` 的 `codex`、`codex exec` 缺少 `--json` 或 `--output-schema` 标志，以及缺少 `mattpocock-skills`（并给出上面的两条命令）。

第 3 步中的两条插件命令已在真实的 `codex`（0.167.0）上运行过：在全新的 `CODEX_HOME` 中它们退出码为 0，`codex plugin list` 显示 `emet@emet-marketplace installed, enabled`。本地路径形式 `codex plugin marketplace add <repo>` 的结果相同。

## 选择 Agent 宿主

在 `emet.config.json` 中设置 `agentHost`：

```json
{ "agentHost": "codex" }
```

默认值为 `"claude"`。`codex` 部分用于设置模型、推理强度、最低版本和沙箱；参见[配置参考](../reference/configuration.md#codex)和[模型与推理强度](models-and-effort.md)。在 Codex 中用 `$emet:run` 启动一次运行。`emet launch <spec> --wave <n>` 会在分离的 `codex exec` 中启动一个波次并记录其线程 id，因此可以用 `codex exec resume <id>` 继续；不会打开 Orca 标签页。

## 唯一的一次批准

emet 只在计划之后请求一次批准。在 Claude Code 上这是一个提示；在 Codex 上则是一个钩子：

- 在 `.emet/runs/spec<id>/approval.json` 存在之前，`emet guard` 会拒绝所有变更（`apply_patch`、`Bash`），写入 `.emet/runs/**/draft/**` 下的除外，原因为 `not approved: send approve <id>`。只要存在没有 `approval.json` 的 `.emet/runs/spec<id>/` 目录，这道关卡就会生效，这正是 `$emet:run` 在第 4 阶段落实规格之后留下的状态。
- 发送内容恰好是 `approve <id>` 的一行提示即可批准。随后 `UserPromptSubmit` 钩子会用与 `emet approve` 相同的哈希方式写入批准文件。工具输出或模型文本中出现同样的文字不会产生任何效果。
- 另一种方式是 `/plan $emet:run`：在 Codex 自己的计划模式中批准计划，而不使用钩子。

该目录一旦存在，关卡就会失败即关闭：批准文件缺失或无法读取时，变更仍会被拒绝。guard 还会对照工单的 `.emet/surface.json` 检查 `apply_patch` 的每一个路径。

## 波次如何运行

- `emet dispatch --role worker` 会检查认领和槽位，创建 `.emet/worktrees/agent-<ticket>`，在 `.emet/runs/<run>/codex-home/` 下构建每次运行专用的 `CODEX_HOME` 覆盖层，并使用解析出的模型和推理强度、`codex.sandbox` 模式（默认 `danger-full-access`）、`--json` 和 `--output-schema` 启动 `codex exec`。事件被捕获到 `.emet/runs/<run>/codex/<ticket>.jsonl`。worker 通过其 `thread.started` 事件的 `threadId` 和该 JSONL 路径来识别；进程 id 只是辅助字段。
- 覆盖层是生成的，而不是链接的。你的 `auth.json` 会以符号链接方式接入（绝不复制），emet 插件缓存在你的 Codex 主目录中存在时会被链接，覆盖层会写入它自己的最小 `config.toml`：本地市场和 `[plugins."emet@emet-marketplace"] enabled = true`、仅针对本次运行自身目录的 `trusted` `[projects."<dir>"]` 表，以及解析出的 `model` 和 `model_reasoning_effort`。你的 `[projects]` 表和其他设置都不会被复制，你的 `~/.codex` 也绝不会被写入。
- 覆盖层的 `rules/default.rules` 允许 `git add`、`git commit`、`git status`、`git worktree`、`git -C <dir> ...` 以及 `emet` 的子命令 `dispatch`、`review-run`、`launch`、`claims`、`slots`、`results` 和 `handoff`，并禁止 `git push`。由于默认沙箱不再阻止写入，`emet guard` 还会拒绝任何 argv 运行 `git push` 的 `Bash` 命令，包括 `git -C <dir> push` 和 `git --git-dir=<dir> push`，无论沙箱如何。
- `emet review-run` 以只读方式对 `emet review-package` 生成的包运行 reviewer；`passive` 层级不会启动任何进程。
- 模型会依据运行主目录中的 `models_cache.json` 解析，否则依据你真实 Codex 主目录中的该文件（只读）。已配置但未列出的 slug 会被替换，并记录这次替换；如果什么都解析不出，`emet review-run` 会在调用模型之前失败，并指出角色和已列出的 slug。
- 用量和停滞检测读取捕获的 JSONL：token 用量来自 `turn.completed` 事件，存活状态来自文件是否在增长，因此位于另一个 pid 命名空间中的 worker 仍会被视为存活。`emet preflight` 和 `emet cleanup` 对可回收的无主 worktree 使用同一条规则（worker 分支、工单已合入、工作区干净、没有他人的锁），因此只有在 cleanup 真的会动手时，preflight 才会提示运行 `emet cleanup`。

## 真实 Codex 运行的结果

[探测报告](../research/codex-probe-report.md)在这些改动之后，针对 `codex-cli 0.167.0`（ChatGPT 免费计划，Linux）重新运行了所有检查。此前所有 `failed` 的行现在都是 `verified`：

- 一个 2 波次的流程把 Codex worker 的真实提交合入了主干：波次 1 来自 `emet dispatch`，波次 2 来自由 `emet launch <spec> --wave 2` 启动的会话，该会话从覆盖层的插件缓存中加载了 `$emet:run`。`emet review-run` 在每个流程中都运行了。
- 可选的 e2e（`EMET_CODEX_E2E=1`）通过：worker 在 `danger-full-access` 下提交，`codex execpolicy check` 对 `git push origin develop` 回答 `forbidden`，对 `git -C <dir> commit` 回答 `allow`。
- `~/.codex/config.toml` 在探测、e2e 和七个流程中保持了相同的 sha256。

## 限制与 `unverified` 要点

- 推理强度 `ultra` 绝不会被发送，并且在配置中会被拒绝。
- `danger-full-access` 是 Codex worker 和 `emet launch` 默认的 `codex.sandbox`，因为 `workspace-write` 沙箱会让 `.git` 变为只读，worker 将无法提交。把 `codex.sandbox` 设为 `"workspace-write"` 即可保留沙箱；此时 worker 无法提交。[ADR-0022](../adr/0022-codex-workers-run-unsandboxed-by-default.md) 记录了这一权衡。Claude 路径从不使用它。没有沙箱时，`emet guard` 中对 push 的拒绝和规则文件就是防护措施。
- 没有 `ScheduleWakeup`、`TaskStop` 或 `LSP` 的对应功能。emet 改为轮询自己的 CLI。
- `~/.codex/sessions` 下的 rollout 文件没有稳定的格式，因此 emet 读取它自己捕获的 `exec --json` 输出。
- 已对照真实 CLI 验证，并且仍放在小函数之后，因此 Codex 的变化只会影响一处：带有已链接认证的每次运行专用 `CODEX_HOME`、位于 `rules/default.rules` 的规则文件、`--dangerously-bypass-hook-trust`、钩子命令中的 `CLAUDE_PLUGIN_ROOT` 别名、`codex plugin list` 的输出格式、模型按名称加载技能、嵌套会话内的 `emet dispatch`、模型试图伪造 `approval.json`（被拒绝），以及 `codex plugin marketplace add` 的两种形式。参见[可行性调研](../research/codex-viability.md)。
- 仍为 `unverified`：在 systemd 或容器下，从无人值守的监督进程运行 Codex（只测试过分离进程）。
- 探测报告中已知的后续事项：`emet init` 在 `agentHost: "codex"` 时仍把 Claude 模型名写入 `models`，显式的 `emet dispatch --model` 不会依据缓存解析，`emet lock-reason` 会查找 `claude` 祖先进程，以及 worker 已死亡的工单无法重新派发到同一个 worktree。
- Codex 的模型名称和价格会变化；在真实波次运行之后，需要重新核对价格表。

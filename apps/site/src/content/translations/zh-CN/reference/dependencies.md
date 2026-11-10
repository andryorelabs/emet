---
title: 依赖
description: emet 在机器上需要什么，以及用哪个命令检查每一项。
seoTitle: emet 依赖
sourceHash: 1c97a7ccd5572ab4
---

emet 在机器上需要什么，以及用哪个命令检查每一项。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。

## 必需项

先列出两种代理宿主共有的，再列出每种宿主额外需要的。

- **[bun](https://bun.sh)**：仅源码安装需要。独立二进制文件不需要运行时。
- **`rsync`** 以及 **`sha256sum` 或 `shasum`**：`install.sh` 需要。
- **`git`**：运行时必需。几乎每个子命令都会调用它。
- **已认证的 `gh` CLI**：当跟踪器是 `github` 或落地方式是 `pr` 时必需。PR 始终使用它。如果 `tracker.kind: "local"` 且 `landing.mode: "merge"`，则不需要 `gh`。
- **`mattpocock-skills` 插件**：访谈、规格和工单阶段会调用其中的技能。在 Claude Code 上它来自 `claude-plugins-official` 市场；Codex 参见 [Codex 宿主](#codex-宿主)。

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **`claude` CLI 和 emet 插件命令**（`/emet:run`、`/emet:init`、`/emet:doctor`）：仅限 Claude Code 宿主。
- **`~/.claude/agents/` 中的 `emet-worker` 和 `emet-reviewer` 代理**：仅限 Claude Code 宿主，由 `install.sh` 安装。阶段 6 和阶段 8 通过 `subagent_type` 进行派发，因此缺少任何一个都会导致派发失败。参见[模型与推理强度](../../README.md#models--effort)。
- **在 `.mcp.json`（或用户范围）中声明的 Linear MCP 服务器**：仅当仓库使用 `linear` 跟踪器时需要。emet 会验证该声明。连接是否已认证存放在代理宿主自己的凭据存储中，无法在这里检查。在 Claude Code 上，如果运行时读取工单失败，请重启 Claude Code 并批准该连接。Codex 上的对应步骤尚未验证。

以上任何一项都不会替你安装或登录。区别在于由谁检查，以及检查的严格程度。

## Codex 宿主

仅当 `agentHost` 为 `"codex"` 时需要；参见 [Codex 指南](../guide/codex.md)。那里不使用 `emet-worker` 和 `emet-reviewer` 代理。

- **`codex` CLI**，已登录，版本为 `codex.minVersion`（默认 `0.167.0`）或更新。`emet doctor` 会检查 `codex exec --help` 是否列出 `--json` 和 `--output-schema`。
- Codex 中的 **`mattpocock-skills` 插件**，通过 `codex plugin list` 探测：

  ```bash
  codex plugin marketplace add mattpocock/skills
  codex plugin add mattpocock-skills@mattpocock
  ```

- **面向 Codex 的 emet 插件**（`.codex-plugin/plugin.json`），提供 `$emet:run`、`$emet:init`、`$emet:doctor` 技能和批准 hook。

emet 从不写入你的 `~/.codex`：worker 使用每次运行专属的 `CODEX_HOME`，其中链接你的认证和配置。

## 谁检查什么

|                                                                  | `emet init`      | `emet doctor`            | `emet preflight`                                             |
| ---------------------------------------------------------------- | ---------------- | ------------------------ | ------------------------------------------------------------ |
| 插件缺失或被禁用                                                 | 打印安装命令     | 报告（整个批量检查一次） | **阻止派发**                                                 |
| 缺少 `emet-worker`/`emet-reviewer` 代理（仅限 Claude Code 宿主） | —                | 报告（整个批量检查一次） | **阻止派发**                                                 |
| `gh` 缺失或未认证（跟踪器：`github`）                            | 打印要运行的命令 | 报告                     | **阻止派发**                                                 |
| 未声明 Linear 服务器（跟踪器：`linear`）                         | 打印一条提示     | 报告                     | **阻止派发**                                                 |
| 宿主 CLI（Claude Code 上是 `claude`）不在 PATH 中，或探测超时    | 打印一条提示     | 报告                     | **发出警告，从不阻止**：这表示“无法检查”，而不是“已确认损坏” |
| emet 依赖的某个标志在 `--help` 中缺失                            | —                | 报告                     | —                                                            |

### 标志检查

`emet doctor` 检查的是标志本身，而不仅仅是二进制文件是否存在。它会读取 `gh issue view` 和 `gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`），并按宿主读取代理宿主自身 CLI 的 `--help`：Claude Code 上是 `claude`（`--bg`）和 `claude agents`（`--json`），Codex 上则改为 `codex exec`（`--json`、`--output-schema`）。它会报告较新或较旧的 CLI 不再记录的任何标志。否则，标志被重命名可能导致波次在中途失败。

### 超时与跳过阻止

每次探测都限制在 5 秒内，因此卡住的 `gh auth status`（没有网络）不会使波次挂起。如果某个 `preflight` 的阻止对你的环境本身就是错误的，`EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` 会仅对这一次运行把它降级为警告。请在你自己的 shell 中设置它，不要设置在 `/emet` 协调者无人值守运行的任何内容中。参见[环境变量](cli.md#环境变量)。

### 仓库自有的二进制文件

仓库的 `preflight.requiredCommands`（位于 `emet.config.json` 中）是一份独立的、由仓库自行维护的二进制文件列表，`emet preflight` 和 `emet doctor` 要求这些文件位于 PATH 中。它适用于 `rg` 和 `sg`，工作者提示词把它们作为比完整读取文件更快的替代方案推荐。`gh` 不需要列在这里；上面的检查已经覆盖了它。参见 [`preflight`](configuration.md#preflight)。

关于故障和修复方法，参见[故障排除](../troubleshooting.md#依赖检查失败)。

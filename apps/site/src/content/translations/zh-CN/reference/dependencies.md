---
title: 依赖
description: emet 在机器上需要什么，以及用哪个命令检查每一项。
seoTitle: emet 依赖
sourceHash: 628a2bb58f655fd5
---

emet 在机器上需要什么，以及用哪个命令检查每一项。术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。返回 [README](../../README.md)。

## 必需项

- **[bun](https://bun.sh)**：仅源码安装需要。独立二进制文件不需要运行时。
- **`rsync`** 以及 **`sha256sum` 或 `shasum`**：`install.sh` 需要。
- **`git`**：运行时必需。几乎每个子命令都会调用它。
- **已认证的 `gh` CLI**：当跟踪器是 `github` 或落地方式是 `pr` 时必需。PR 始终使用它。如果 `tracker.kind: "local"` 且 `landing.mode: "merge"`，则不需要 `gh`。
- **`mattpocock-skills` 插件**（`claude-plugins-official` 市场）：`/emet` 的访谈、规格和工单阶段会调用其中的技能。

  ```bash
  claude plugin marketplace add anthropics/claude-plugins-official
  claude plugin install mattpocock-skills@claude-plugins-official
  ```

- **`~/.claude/agents/` 中的 `emet-worker` 和 `emet-reviewer` 代理**：由 `install.sh` 安装。阶段 6 和阶段 8 通过 `subagent_type` 进行派发，因此缺少任何一个都会导致派发失败。参见[模型与推理强度](../../README.md#models--effort)。
- **在 `.mcp.json`（或用户范围）中声明的 Linear MCP 服务器**：仅当仓库使用 `linear` 跟踪器时需要。emet 会验证该声明。连接是否已认证存放在 Claude Code 自己的凭据存储中，无法在这里检查。如果运行时读取工单失败，请重启 Claude Code 并批准该连接。

以上任何一项都不会替你安装或登录。区别在于由谁检查，以及检查的严格程度。

## 谁检查什么

|                                          | `emet init`      | `emet doctor`            | `emet preflight`                                             |
| ---------------------------------------- | ---------------- | ------------------------ | ------------------------------------------------------------ |
| 插件缺失或被禁用                         | 打印安装命令     | 报告（整个批量检查一次） | **阻止派发**                                                 |
| 缺少 `emet-worker`/`emet-reviewer` 代理  | —                | 报告（整个批量检查一次） | **阻止派发**                                                 |
| `gh` 缺失或未认证（跟踪器：`github`）    | 打印要运行的命令 | 报告                     | **阻止派发**                                                 |
| 未声明 Linear 服务器（跟踪器：`linear`） | 打印一条提示     | 报告                     | **阻止派发**                                                 |
| `claude` 不在 PATH 中，或探测超时        | 打印一条提示     | 报告                     | **发出警告，从不阻止**：这表示“无法检查”，而不是“已确认损坏” |
| emet 依赖的某个标志在 `--help` 中缺失    | —                | 报告                     | —                                                            |

### 标志检查

`emet doctor` 检查的是标志本身，而不仅仅是二进制文件是否存在。它会读取 `gh issue view` 和 `gh repo view`（`--json`）、`gh issue edit`（`--add-label`、`--remove-label`）、`claude`（`--bg`）以及 `claude agents`（`--json`）的 `--help`，并报告较新或较旧的 CLI 不再记录的任何标志。否则，标志被重命名可能导致波次在中途失败。

### 超时与跳过阻止

每次探测都限制在 5 秒内，因此卡住的 `gh auth status`（没有网络）不会使波次挂起。如果某个 `preflight` 的阻止对你的环境本身就是错误的，`EMET_SKIP_DEPENDENCY_CHECKS=1 emet preflight` 会仅对这一次运行把它降级为警告。请在你自己的 shell 中设置它，不要设置在 `/emet` 协调者无人值守运行的任何内容中。参见[环境变量](cli.md#环境变量)。

### 仓库自有的二进制文件

仓库的 `preflight.requiredCommands`（位于 `emet.config.json` 中）是一份独立的、由仓库自行维护的二进制文件列表，`emet preflight` 和 `emet doctor` 要求这些文件位于 PATH 中。它适用于 `rg` 和 `sg`，工作者提示词把它们作为比完整读取文件更快的替代方案推荐。`gh` 不需要列在这里；上面的检查已经覆盖了它。参见 [`preflight`](configuration.md#preflight)。

关于故障和修复方法，参见[故障排除](../troubleshooting.md#依赖检查失败)。

---
title: 模型与推理强度
description: emet 如何为每个角色选择模型和推理强度，以及哪些配置键可以修改它们。
seoTitle: emet 的模型与推理强度
sourceHash: 7ab8a2e10ec9cae7
---

`/emet` 会自动为每个角色选择模型和推理强度；运行中无需手动切换任何设置。所有配置键都在[配置参考](../reference/configuration.md#models)中。

| 角色                                      | 模型                    | 推理强度        | 设置位置                                   |
| ----------------------------------------- | ----------------------- | --------------- | ------------------------------------------ |
| 规划（阶段 1–4）                          | Opus，通过 `opusplan`   | 取决于你的会话  | 由你设置，仅需一次                         |
| 协调者，阶段 5 起                         | Sonnet，通过 `opusplan` | 取决于你的会话  | 由你设置，仅需一次                         |
| 工作者（阶段 7）                          | Sonnet                  | `medium`        | `agents/emet-worker.md` 或 `models.worker` |
| 评审，`passive` 层级（仅文档的 diff）     | 无                      | —               | `emet assess`                              |
| 评审，`medium` 层级（普通源码变更）       | Opus                    | `medium`        | `models.reviewer.medium`                   |
| 评审，`high` 层级（高风险路径或敏感调用） | Opus                    | 默认为 `medium` | `models.reviewer.high`                     |
| CI 日志分诊（阶段 8）                     | Haiku                   | —               | `models.triage`                            |

两个代理定义文件（由 `install.sh` 安装到 `~/.claude/agents/`）在 frontmatter 中固定了各自的 `model`/`effort`，因此协调者自己选择的模型和推理强度不会影响工作者或评审者。如果其中任一文件丢失，`emet doctor` 只会报告，不会阻止。而 `emet preflight` 在 `emet-worker` 或 `emet-reviewer` 缺失时会阻止派发，因为阶段 6 和阶段 8 是通过 `subagent_type` 进行派发的。

## 按风险层级路由

阶段 8 会运行 `emet assess --base <trunk> --head <integration branch>`，它以确定性的方式对 diff 分类，并输出包含层级、原因以及推荐的评审者模型和推理强度的 JSON：

- `passive`：仅文档的 diff；不会派发评审者。
- `medium`：评审者使用 `models.reviewer.medium` 运行。
- `high`：diff 涉及认证、安全、支付、webhook、CI、安装程序、锁文件、迁移、危险的敏感调用（原始 SQL、管道传给 shell 等），或匹配 `review.highRiskPaths` 的路径。评审者使用 `models.reviewer.high` 运行，只有在检查全部通过且没有未处理的评审问题时，自动合并才会落地该 PR。

涉及高风险路径的工单可以带有一行 `Model:`（例如 `Model: opus` 或 `Model: opus/high`），它只会覆盖该工作者的 `models.worker`。

## Haiku 分诊

协调者从不完整读取 CI 日志。失败的检查会交给使用 `models.triage`（默认 `haiku`）的代理，它最多返回约 2k 个 token，并附带用于修复的 `file:line` 指引。

## 配置

所有键都是可选的，默认值与上表一致：

```json
{
  "models": {
    "worker": { "model": "sonnet", "effort": "medium" },
    "reviewer": {
      "medium": { "model": "opus", "effort": "medium" },
      "high": { "model": "opus", "effort": "medium" }
    },
    "triage": "haiku"
  },
  "review": { "highRiskPaths": [] }
}
```

`review.highRiskPaths` 是一组额外的、不区分大小写的路径子串，用于强制进入 `high` 层级。若想对高风险波次加强审查，可以提高 `models.reviewer.high.effort`（例如提高到 `high`）。

## Codex 宿主

当 `agentHost` 为 `"codex"` 时，每个 worker 和 reviewer 都是各自独立的 `codex exec` 进程，按角色设置 `-m` 和 `model_reasoning_effort`。[`codex`](../reference/configuration.md) 部分的默认值如下：

| 角色                    | 模型          | 强度                       | 备选                          |
| ----------------------- | ------------- | -------------------------- | ----------------------------- |
| 会话（`$emet:run`）     | `gpt-6.1-sol` | `medium` (`high` 规划期间) | 无                            |
| Worker                  | `gpt-6.1-sol` | `medium`                   | `gpt-6.1-terra`, `gpt-6-luna` |
| 带 `Model:` 行的 worker | `gpt-6.1-sol` | `xhigh`                    | `gpt-6-astra`                 |
| Reviewer，`medium` 档   | `gpt-6.1-sol` | `high`                     | 无                            |
| Reviewer，`high` 档     | `gpt-6-astra` | `high`                     | `gpt-6.1-sol`                 |
| 分诊                    | `gpt-6-luna`  | `medium`                   | `gpt-6.1-terra`               |

`emet dispatch` 会把每个 slug 与 Codex 模型缓存对照。缓存中列出且支持该强度的 slug 会保留；否则依次采用模型的升级目标、备选项，最后省略 `-m`，并记录每一次替换。永远不会发送强度 `ultra`。`passive` 档不会启动 reviewer。

在实际跑过几个波次之后，遇到下列情况时重新调整：

- worker 需要反复多轮修复：提高 `codex.models.worker.effort`，或在高风险工单上写一行 `Model:`；
- `high` 档波次的评审漏掉问题：提高 `codex.models.reviewer.high.effort`；
- 日志显示发生了替换：Codex 重命名或下线了某个 slug，请更新该 slug。

## 为什么只用一个评审者

为什么使用一个上下文全新的评审者，而不是多角度并行：目前没有公开基准直接比较两者，但并行方案会按角度把整个 diff 重读一遍，并且在这个仓库中曾挂起超过一个小时；而 Anthropic 和第三方关于 Opus 级模型的报告表明，升级模型带来的收益与增加角度相当。对于高风险的波次，请在之后手动运行 `/code-review ultra`；`/emet` 不会自行派发它。

## 需要你自己设置一次的内容

`/emet` 无法在运行中切换这些设置：

- `~/.claude/settings.json` 中的 `model: "opusplan"`：这使阶段 1–4 使用 Opus，阶段 5 起使用 Sonnet，无需 `/model`。如果未设置，`emet doctor` 会发出警告（不会修改你的设置）。
- 会话的推理强度设为 `medium` 或 `high`，而不是 `xhigh`：无论你如何设置，工作者和评审者都有各自的推理强度；而全局默认值设得过高，只会增加协调者自身轮次（派发管理、合并、报告）的成本，这些轮次并不需要。
- 能够无人值守运行的 `permissions.defaultMode`（`auto`、`acceptEdits` 或 `bypassPermissions`），以及阻止 `git push * main|master` 和 `git push --force *` 的 `permissions.deny` 规则。`emet doctor` 会对这两项发出警告，因为一个卡在权限提示上的波次，或者能强行越过主干分支的波次，会让无人值守运行失去意义。

这些只是起点，并非定论。Opus 5.5 于 2026-09-22 发布，面向编码代理的推理强度与模型选择仍是活跃的研究领域；请在实际运行几个波次后再重新调整，而不要把这张表当作最终结论。

# Codex viability for emet

Research for ADR [0021](../adr/0021-codex-support-strategy.md). Options, evidence and a recommendation. No code changes and no tickets are created here. Terms follow [GLOSSARY.md](../../GLOSSARY.md); **Agent host** is the new term, meaning the product a run executes in (today Claude Code, here also Codex CLI).

Accessed 2026-11-09 against Codex CLI `0.167.0` (stable release `rust-v0.167.0`, 2026-11-06).

Source abbreviations (every URL was read on 2026-11-09 unless a different date is given):

- `L/` = `https://learn.chatgpt.com/docs/` (the `developers.openai.com/codex/*` pages redirect here).
- `GH/` = `https://github.com/openai/codex` at `main`; `GH#n` is an issue or PR number there, with its creation or merge date.
- `E1`..`E10` = the local spike in the [appendix](#appendix-spike-e1-e10).
- `unverified` marks a claim no source states and the spike did not test.

## TL;DR

- **Verdict: viable, no blocker.** Every user-visible step of `/emet:run` has the same outcome on Codex, but only because the `emet` CLI, not the Agent host, owns the processes.
- Native Codex subagents cannot do what emet needs: no per-child worktree, an inherited sandbox and no read-only reviewer (two native BLOCKERs, both with a verified WORKAROUND). Workers and the reviewer run as `codex exec -C <worktree> --json`, one process each (E1, E5, E10).
- The spike ran ten experiments on Codex 0.167.0. All ten passed (E6 and E7 with stated limits). Commits work through an exec-policy allow rule (E2), handoffs parse with `--output-schema` (E3), usage is extractable (E4), a hook denies and gates (E6, E7), a namespaced plugin skill receives its arguments (E8) and mattpocock-skills installs (E9).
- The coordinator becomes the plugin skill `$emet:run` (E8). Its single approval is a hook-emulated gate (E7), with `/plan $emet:run` as the documented alternative.
- **Recommended: Model C**, an agent-agnostic core with per-host adapters, delivered in ~5 waves and ~15 tickets. Model A is a cheaper stepping stone, but it keeps Claude Code mandatory.
- Largest risks: the hook-trust and sandbox behaviour moving between Codex releases, the `emet guard` shim for `apply_patch`, and the instability of the rollout format. See [Risks](#risks).

## Capability matrix

Verdicts: `SOLVED` (native, same behaviour), `WORKAROUND` (same user outcome by another mechanism), `BLOCKER` (no way to get the outcome natively). Where a row is a native BLOCKER with a workaround, both are shown.

| Claude Code feature                                           | Codex CLI 0.167 equivalent                                                                                                                                  | Verdict                                  | Source (date)                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `/emet:run $ARGUMENTS` plugin command                         | Plugin skill typed `$emet:run --dispatch 1`; arguments stay in the user message and the model reads them. Custom prompts are removed from the code          | WORKAROUND                               | E8; GH#16115 (2026-03-28); GH#41842 (2026-08-31); L/custom-prompts               |
| Plugin marketplace and install                                | `codex plugin marketplace add`; reads `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json`                                                    | SOLVED                                   | E8, E9; https://developers.openai.com/plugins/build/plugins                      |
| Plugin ships agents and commands                              | Not manifest components (`skills`, `mcp_servers`, `apps`, `hooks` only). Agents go in `.codex/agents/*.toml` written by `emet init`; commands become skills | WORKAROUND                               | GH/codex-rs/plugin/src/manifest.rs; GH#36855 (2026-08-04)                        |
| Plugin cross-dependency (mattpocock-skills)                   | No dependency field. Install the marketplace separately, then `emet doctor` checks `codex plugin list`                                                      | WORKAROUND                               | E9; GH#23531 (2026-05-19)                                                        |
| `CLAUDE.md` / `AGENTS.md`                                     | `AGENTS.md` loaded root-first, 32 KiB default cap                                                                                                           | SOLVED                                   | E1; L/agent-configuration/agents-md                                              |
| Skills (`SKILL.md`)                                           | Same Agent Skills format. Skills sit in plugin or `.agents/skills`, not `.claude/skills`                                                                    | SOLVED                                   | E9; L/build-skills                                                               |
| `Skill` tool chaining from prompts                            | No `Skill` tool. Prompts name the skill; the model loads it from the skills list (`skill_search`)                                                           | WORKAROUND, model self-load `unverified` | L/build-skills; `codex features list` (2026-11-09)                               |
| Plan mode with one approval                                   | Hook gate: `PreToolUse` denies mutations until a `UserPromptSubmit` hook sees `approve <id>`. Alternative: `/plan $emet:run` then "Implement this plan?"    | WORKAROUND                               | E7; GH/codex-rs/tui/src/chatwidget/plan_implementation.rs; GH#35858 (2026-07-29) |
| `AskUserQuestion`                                             | `request_user_input` only in Plan mode; Default mode asks plain-text questions                                                                              | WORKAROUND                               | GH#53829 (2026-10-14); GH/.../request_user_input_spec.rs                         |
| Subagent per ticket in its own worktree                       | `spawn_agent` has no `cwd`. Native BLOCKER; emet launches one `codex exec -C <worktree>` per ticket                                                         | BLOCKER native, WORKAROUND               | E1; GH#18969 (2026-04-22); GH#55375 (2026-10-19)                                 |
| Pinned model and effort per agent                             | `-m` and `-c model_reasoning_effort=` per process, or `.codex/agents/*.toml`                                                                                | SOLVED                                   | E1; L/agent-configuration/subagents                                              |
| Read-only reviewer, `tools:` allowlist                        | Subagents inherit the parent sandbox. Native BLOCKER; reviewer runs as `codex exec -s read-only`                                                            | BLOCKER native, WORKAROUND               | E5; L/agent-configuration/subagents; GH#45482 (2026-09-14)                       |
| Worker commits in its worktree                                | `.git` is read-only under `workspace-write`. Exec-policy allow rule for `git add`/`commit`, or `danger-full-access`                                         | WORKAROUND                               | E2; L/agent-approvals-security; GH#7071 (2025-11-21); GH#48717 (2026-09-27)      |
| Structured worker report                                      | `--output-schema FILE` with `-o FILE`                                                                                                                       | SOLVED                                   | E3; L/non-interactive-mode                                                       |
| Token usage and stall tracking                                | `exec --json` `turn.completed.usage`. Rollout `token_count` matches but is not a stable contract                                                            | WORKAROUND                               | E4; L/hooks; GH#52411 (2026-10-09)                                               |
| `PreToolUse` hook that denies                                 | Same JSON in and out, mirrors Claude Code                                                                                                                   | SOLVED                                   | E6; L/hooks                                                                      |
| Tool names in hooks                                           | `Edit`/`Write`/`MultiEdit` become `apply_patch` with a patch in `tool_input.command`                                                                        | WORKAROUND (shim)                        | E6                                                                               |
| `UserPromptSubmit` hook                                       | Carries the raw `prompt`                                                                                                                                    | SOLVED                                   | E7; L/hooks                                                                      |
| Hooks run without prompting                                   | Each hook is trust-gated by hash; `--dangerously-bypass-hook-trust` for vetted automation                                                                   | WORKAROUND                               | L/hooks; E6                                                                      |
| `CLAUDE_PLUGIN_ROOT` in hook commands                         | Documented compatibility alias, so `hooks/hooks.json` loads unchanged                                                                                       | SOLVED, `unverified` locally             | L/hooks (2026-11-09)                                                             |
| `claude --bg` launch, `claude attach`                         | `setsid nohup codex exec`, then `codex exec resume <id>`                                                                                                    | WORKAROUND                               | E10; L/developer-commands                                                        |
| Transcript path `~/.claude/projects`                          | `~/.codex/sessions/Y/M/D/rollout-*.jsonl`, format not stable                                                                                                | WORKAROUND                               | E4; L/hooks                                                                      |
| MCP client                                                    | Native stdio and HTTP; `required = true`                                                                                                                    | SOLVED                                   | L/extend/mcp                                                                     |
| `ScheduleWakeup`, `TaskStop`, `ListAgents`, `LSP`, `Artifact` | No equivalent. emet polls its own CLI instead; the `LSP`, `Artifact` rules become no-ops                                                                    | WORKAROUND, `unverified` per tool        | `emet/src/guard.ts`; research note                                               |
| Spawn child outside the parent sandbox                        | Exec-policy `allow` runs `emet dispatch` outside bwrap; nested sandbox failure is reported upstream                                                         | WORKAROUND, `unverified` end to end      | L/agent-configuration/rules; GH#53799 (2026-10-13)                               |
| Models and price table                                        | Codex model names (`gpt-6-luna`, `gpt-6.1-sol`, ...); `emet` price table needs a Codex branch                                                               | WORKAROUND                               | L/models; `emet/src/metrics.ts`                                                  |

## Coupling inventory

About 110 Claude Code coupling points, counted in the repo before this ticket. The agent-agnostic core is about 25 modules.

| Area                     | Points      | Hard-wiring                                                                                       | Key files                                                                                                |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Distribution and plugin  | ~20         | layout and prose (`${CLAUDE_PLUGIN_ROOT}` x30), `install.sh` to `~/.claude`                       | `.claude-plugin/*.json`, `install.sh`, `bin/emet`, `commands/*.md`                                       |
| Subagents                | ~25         | prose (`Agent`, `subagent_type`, `isolation`, `SendMessage`) and TS (`.claude/worktrees/agent-*`) | `agents/*.md`, `phases-6-7-dispatch.md`, `worktrees.ts`, `cleanup.ts`, `preflight.ts`, `dependencies.ts` |
| Plan mode and approval   | ~8          | prose; the `approve.ts` hash is agnostic                                                          | `commands/run.md:57-69`, `phases-1-5.md`                                                                 |
| Skills                   | ~15         | prose and TS (`claude plugin list --json`)                                                        | `skills.ts`, `dependencies.ts`                                                                           |
| Session launch           | ~10         | TS: `claude --bg`, `claude agents --json`, `claude attach`                                        | `launch.ts`, `config.ts`                                                                                 |
| Transcripts and liveness | ~15         | TS, deep: `~/.claude/projects/<slug>/*.jsonl`, anchor process `claude`                            | `usage.ts`, `metrics.ts`, `runs.ts`, `status.ts`, `lockreason.ts`                                        |
| Hooks and settings       | ~15         | TS: hook stdin/stdout schema, tool names                                                          | `hooks/hooks.json`, `guard.ts`, `guard-destructive.ts`                                                   |
| Models and effort        | ~10         | config defaults, frontmatter, price table                                                         | `config.ts:55-73`, `metrics.ts:36-47`                                                                    |
| Other tools              | ~12         | prose: ScheduleWakeup, TaskStop, ListAgents, ToolSearch, LSP, Artifact                            | `phases-6-7-dispatch.md`, `guard.ts`                                                                     |
| Agent-agnostic core      | ~25 modules | none                                                                                              | `tracker*.ts`, `land*.ts`, gate, verify, validate, review, approve, handoff, locks                       |

What the inventory means for the choice: the TS coupling (session launch, transcripts, hooks, worktree paths) is small and mechanical to put behind an interface. The prose coupling (`commands/*.md`, `agents/*.md`, `reference/*.md`) is the large part, and ADR-0001 forbids rewording installed prompts without an explicit ticket, so each prose change needs its own ticket.

## Parity table

Every user-visible step has the same outcome on Codex. "How" is the mechanism.

| Step                            | Claude Code today                     | Same outcome on Codex? | How on Codex (evidence)                                                                                                                           |
| ------------------------------- | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interview                       | Plan mode, `AskUserQuestion`          | Yes                    | Plain-text questions in Default mode, or `request_user_input` inside `/plan` (GH#53829)                                                           |
| Spec                            | Coordinator writes `## Specs`         | Yes                    | Same: the `$emet:run` skill drives `emet` subcommands (E8)                                                                                        |
| Tickets                         | Created through the tracker           | Yes                    | Unchanged, the tracker modules are agent-agnostic                                                                                                 |
| One approval                    | `ExitPlanMode` plus `approve.ts` hash | Yes                    | Hook-emulated: `PreToolUse` denies until `UserPromptSubmit` sees `approve <id>` (E7). Alternative: `/plan $emet:run`, then "Implement this plan?" |
| Parallel workers, own worktrees | `Agent` with `isolation: worktree`    | Yes                    | `emet` creates `cla-<n>-<slug>` worktrees and runs `codex exec -C <wt> --json` per ticket (E1, E10)                                               |
| Worker commits                  | `git commit` in the worktree          | Yes                    | Exec-policy allow for `git add`/`commit`, `git push` forbidden (E2); `danger-full-access` also works (E2)                                         |
| Worker handoff                  | Handoff note and result file          | Yes                    | `--output-schema` report parsed with `jq` (E3), usage from `--json` (E4)                                                                          |
| Read-only review                | Reviewer agent, tool allowlist        | Yes, stronger          | `codex exec -s read-only`, write blocked at the OS level (E5)                                                                                     |
| One PR per wave                 | `emet land`, `gh pr create`           | Yes                    | Unchanged, the land modules are agent-agnostic                                                                                                    |
| Autonomous hand-off             | `claude --bg`                         | Yes                    | Detached `codex exec` survives the launcher, `codex exec resume` continues it (E10)                                                               |
| Skill dependency                | mattpocock-skills plugin              | Yes                    | Same marketplace installs in Codex (E9)                                                                                                           |

## Integration models

Three ways to bring Codex in. Effort is in tickets and waves, where one wave is one dependency layer (ADR-0004). Estimates are mine, not from a source.

### Model A: Codex workers under a Claude coordinator

Claude Code stays the Agent host. `emet dispatch` launches `codex exec` for workers and the reviewer instead of `Agent`.

- Pros: the smallest change. The coordinator prompts, hooks, plan mode and the transcript code stay as they are. Only the worker and review launch, usage parsing and the commit rule change (E1, E2, E3, E4, E5).
- Cons: Claude Code stays mandatory, so a Codex-only user cannot run emet. Two billing and two auth surfaces. Usage, liveness and the guard still read Claude data for the coordinator and Codex data for workers.
- Effort: ~4 tickets, 2 waves.

### Model B: Codex as the full Agent host

The coordinator is the Codex skill `$emet:run`; the whole pipeline runs in Codex. Claude Code support is left as is or dropped.

- Pros: one product end to end for Codex users. All spike mechanisms apply (E6, E7, E8, E9, E10).
- Cons: if built by forking prompts and TS for Codex, every change is made twice. The 110 coupling points are touched without an interface, so Claude support regresses easily. The `emet guard` and approval paths need the shims anyway.
- Effort: ~13 tickets, 4 waves, plus a permanent maintenance fork.

### Model C: agent-agnostic core with per-host adapters (recommended)

Introduce one **Agent host** interface and give each host an adapter: how to launch a worker, launch a reviewer, read usage, detect liveness, install the plugin, read hook stdin and gate approval. Claude Code and Codex are the two first adapters.

- Pros: the Claude path is a refactor with no behaviour change, so it is testable against today's suite. Codex rides on mechanisms the spike proved (E1 to E10). The agent-agnostic core (~25 modules) is already isolated. A third host is an adapter, not a fork.
- Cons: the largest upfront effort. The interface must be designed against two hosts, and the prose coupling still needs host-specific prompt variants (ADR-0001 requires an explicit ticket for each wording change).
- Effort: ~15 tickets, 5 waves. Wave 1 ships the interface with the Claude adapter, so the Codex adapter can land in waves 2 to 4 without a big-bang.

### Recommendation

**Model C is recommended.** The reasoning, tied to the spike:

1. E1, E3, E4, E5 and E10 show that the host-specific surface reduces to launching a process and reading its JSON. That is exactly what an adapter interface expresses, so A's launch code would be written twice if A were done first and C later.
2. E6, E7 and E8 show the hook and plugin layers differ by small, known shims (`apply_patch`, trust flag, `$` mention). That makes a second adapter cheap, which is the case for C over B's fork.
3. E2 shows the one real policy difference (commits) is an adapter concern: an exec-policy rule file shipped by the Codex adapter.
4. Models A and B each duplicate part of the work C needs, so choosing either costs more in total.

Order inside C: ship A's slice first (waves 1 to 2), because the Claude coordinator plus Codex workers already validates the adapter, then add the Codex coordinator (waves 3 to 4).

## Risks

| Risk                                                                                | Impact                                                                                    | Mitigation                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hook trust is hash-gated and a plugin update asks again                             | Headless workers could run unguarded or blocked                                           | Vet hook sources and pass `--dangerously-bypass-hook-trust` only from `emet`; `emet doctor` warns when hooks are untrusted (E6)                        |
| Hook approval is a guardrail, not a boundary ("useful guardrail" in L/hooks)        | A path that is not hooked can write before approval                                       | Same trust model as the Claude guard; document it; keep `/plan` as the stronger alternative                                                            |
| Model may attempt to forge the approval file                                        | Bypass of the single approval                                                             | The gate denies all mutations until approved, so the forge attempt is also denied (E7). In E7 the model did not try; a forging attempt is `unverified` |
| Exec-policy allow rules silently stay sandboxed with denied-read paths              | Commits fail                                                                              | Do not combine with deny-read profiles; fall back to `danger-full-access` or `emet commit` outside the sandbox (GH#38318, 2026-08-13)                  |
| `danger-full-access` workers can write anywhere                                     | Blast radius on a shared machine                                                          | Prefer the allow rule (E2). If used, keep the guard, `git push` forbidden, and a dedicated user or container                                           |
| Rollout format is unstable (migration to paginated history)                         | Usage reads break                                                                         | Use `exec --json` as the contract (E4); treat rollouts as a fallback (GH#52411, 2026-10-09)                                                            |
| Codex releases change flags and defaults often (prereleases `0.168`, `0.169` exist) | Adapter drift                                                                             | Pin a tested range in the adapter, add `emet selftest` coverage                                                                                        |
| `emet dispatch` inside a nested sandbox                                             | Children lack network and `.git`                                                          | Run it outside the sandbox through an allow rule; `unverified` end to end (GH#53799)                                                                   |
| `apply_patch` has no file path field                                                | `emet guard` edit-surface checks miss patches                                             | Parse the `*** Add/Update/Delete File:` headers (E6 shows the shape)                                                                                   |
| No Skill tool, no `ScheduleWakeup`                                                  | Prompt wording that assumes them fails                                                    | Host-specific prompt variants behind the interface (ADR-0001 needs a ticket each)                                                                      |
| Coverage of subagent hook fields                                                    | `agent_type` absent for the top-level agent (E6); its value for subagents is `unverified` | The workers are processes, so the guard keys on a per-process environment variable, not `agent_type`                                                   |
| Cost: the spike used one low-effort model; the cheapest model claim is `unverified` | Budget estimates                                                                          | Re-measure with the `emet` price table once the adapter exists                                                                                         |

## Follow-up spec outline

For `/emet:run`, on Model C. Not filed. Numbers are the requirements `S1`..`S12` a spec would carry; waves follow ADR-0004.

Requirements:

1. **S1 Host interface.** An `AgentHost` interface in `emet/src/` covering launch worker, launch reviewer, read usage, liveness, plugin install, hook input normalization and approval gate. The Claude adapter wraps today's code with no behaviour change.
2. **S2 Host selection.** `emet.config.json` gets `agentHost: "claude" | "codex"` with `claude` the default; `emet doctor` and `emet preflight` check the chosen host.
3. **S3 Worker launch.** `emet dispatch` creates the worktree and starts `codex exec -C <wt> -m <model> -c model_reasoning_effort=<e> --json -o <report> --output-schema <schema>` through the Codex adapter, with the slot pool and `setsid`.
4. **S4 Reviewer launch.** `emet review` runs `codex exec -s read-only --ephemeral --output-schema` and parses the verdict.
5. **S5 Commit policy.** The Codex adapter ships `.codex/rules/emet.rules` allowing `git add`/`commit` and forbidding `git push`; `danger-full-access` is a documented opt-in.
6. **S6 Usage and liveness.** Parse `exec --json` `turn.completed.usage` and line timestamps into the metrics and stall checks; the price table gets Codex model names.
7. **S7 Hook normalization.** `emet guard` reads both hook inputs: `apply_patch` paths from patch headers, host detection from environment, Codex output rules (no `continue`, `stopReason`, `suppressOutput` on `PreToolUse`).
8. **S8 Single approval.** The Codex adapter implements the hook gate (`PreToolUse` deny, `UserPromptSubmit` approval) writing the same approval file `approve.ts` hashes; `/plan $emet:run` is documented as the alternative.
9. **S9 Plugin distribution.** A `$emet:run`, `$emet:init`, `$emet:doctor` skill set built from the same prompts, a Codex marketplace entry, `emet init` writing `.codex/agents/*.toml`.
10. **S10 Skill dependency.** `skills.ts` and `emet doctor` check mattpocock-skills through `codex plugin list` and print the install command.
11. **S11 Hand-off.** `emet launch` starts the next wave with a detached `codex exec` and records the thread id for `codex exec resume`.
12. **S12 Docs and CI.** Document the Codex setup, add a gated e2e run that skips without Codex auth, and keep the Claude suite untouched.

Ticket and wave order:

| Wave | Tickets | Contents                                                                                          |
| ---- | ------- | ------------------------------------------------------------------------------------------------- |
| 1    | 3       | S1 interface plus Claude adapter; S2 config and doctor; S7 guard input normalization behind tests |
| 2    | 3       | S3 worker launch; S4 reviewer launch; S6 usage and liveness                                       |
| 3    | 3       | S5 commit policy; S8 approval gate; S10 skill dependency check                                    |
| 4    | 3       | S9 skills and plugin distribution (3 prompt tickets, ADR-0001 explicit); S11 hand-off             |
| 5    | 3       | S12 docs, e2e gate; hardening (hook trust doctor check, selftest coverage, risk follow-ups)       |

Total ~15 tickets in 5 waves. After wave 2 the Claude coordinator can already run Codex workers (the Model A slice). The spike scripts in the appendix are the acceptance seed for waves 2 and 3.

## Appendix: spike E1-E10

Environment: `codex-cli 0.167.0`, model `gpt-6-luna` at `model_reasoning_effort=low` (the cheapest-looking entry in the local model cache; its real price is `unverified`), Linux. Every run used a throwaway repo under `/tmp/emet-codex-spike-1` and a `CODEX_HOME` holding only a copy of the auth file, which is not recorded here. Each run is one short turn, `--json` output redirected to a file. Every run printed a harmless stderr warning about PATH aliases under `/tmp`. Excerpts are trimmed; the repo path prefix `/tmp/emet-codex-spike-1` is abbreviated `$SPIKE`.

Common prefix: `CODEX_HOME=$SPIKE/home codex exec -m gpt-6-luna -c model_reasoning_effort=low --json`, with the prompt on stdin from a file.

### E1: worker in a worktree reads AGENTS.md

- Command: `... -C $SPIKE/wt1 -s workspace-write "Reply with the project codeword from AGENTS.md, and nothing else."`
- Outcome: **PASS**. The worktree's `AGENTS.md` was read.
- Excerpt: `item.completed agent_message "PELICAN-42"`; `turn.completed usage {input_tokens:14011, cached_input_tokens:10880, output_tokens:9}`.

### E2: commit under `workspace-write` with exec-policy, and `danger-full-access`

- Rules file in `CODEX_HOME/rules/default.rules`: `prefix_rule(pattern=["git", ["add","commit"]], decision="allow")` and `prefix_rule(pattern=["git","push"], decision="forbidden")`.
- Command (a): `... -C $SPIKE/wt2 -s workspace-write` with a prompt to create `note.txt`, add, commit and attempt a push.
- Outcome (a): **PASS**. Excerpt: `git add note.txt && git commit -m 'add note'` exit 0, `[cla-2-commit 0022cf8] add note`; the push was "rejected by policy before it ran".
- Command (b): same prompt, `-C $SPIKE/wt3 -s danger-full-access`.
- Outcome (b): **PASS**. Excerpt: `[cla-3-full 2444568] add note`.
- Limit: the failing baseline (the same commit under `workspace-write` with no rule) was not re-run here. It comes from the research note's local sandbox probes (`index.lock: Read-only file system`) and GH#7071, and is cited, not re-measured.

### E3: `--output-schema` handoff

- Command: `... -C $SPIKE/wt1 -s read-only --output-schema schema.json -o e3.out`, schema requires `status` (`DONE`/`BLOCKED`), `summary`, `files`.
- Outcome: **PASS**. `jq -e .` parsed the output file.
- Excerpt: `{"status":"DONE","summary":"AGENTS.md states the project codeword is PELICAN-42.","files":[".../wt1/AGENTS.md"]}`.

### E4: usage from `--json` and from the rollout

- Command: the E1 run; then `jq` on `CODEX_HOME/sessions/2026/11/09/rollout-*.jsonl`.
- Outcome: **PASS**. The `--json` `turn.completed.usage` equals the rollout `event_msg` `token_count` `total_token_usage`.
- Excerpt: rollout `{"input_tokens":14011,"cached_input_tokens":10880,"output_tokens":9,"total_tokens":14020}`. The rollout also holds a `token_usage_record` line and has 6 `event_msg` lines for a one-turn run. Rollout stability is still not a documented contract.

### E5: read-only reviewer

- Command: `... -C $SPIKE/wt1 -s read-only "Try to create a file named hacked.txt ..."`
- Outcome: **PASS**. The file does not exist afterwards.
- Excerpt: `The write did not succeed. The error was: /bin/bash: line 1: hacked.txt: Read-only file system`.

### E6: `PreToolUse` hook denies; real stdin captured

- Setup: `CODEX_HOME/hooks.json` with a `PreToolUse` matcher `Bash|apply_patch|Edit|Write` running a script that logs stdin and denies a command containing `DENYME` with `hookSpecificOutput.permissionDecision: "deny"`. Run with `--dangerously-bypass-hook-trust -s workspace-write`.
- Outcome: **PASS**. `echo DENYME` was blocked: `Command blocked by PreToolUse hook: spike deny rule.`; `echo ALLOWED` ran.
- Captured stdin keys for the top-level agent: `cwd, hook_event_name, model, permission_mode, session_id, tool_input, tool_name, tool_use_id, transcript_path, turn_id`.
- `permission_mode` was `bypassPermissions` because of the bypass flag. `agent_id` and `agent_type` were absent for the top-level agent. Their values for a subagent are `unverified`: no subagent was spawned.
- `apply_patch` input: `tool_name: "apply_patch"`, `tool_input: {"command": "*** Begin Patch\n*** Add File: $SPIKE/wt1/patched.txt\n+p\n*** End Patch"}`.
- Comparison with `emet guard` (`emet/src/guard.ts`, `guard-destructive.ts`): it reads `tool_name`, `tool_input.command` for `Bash` (compatible), `tool_input.file_path` or `notebook_path` for edits (not present for `apply_patch`, so a shim must parse the patch headers), and `tool_input.run_in_background` and `ScheduleWakeup`, `Skill` rules (not present on Codex).

### E7: hook-emulated approval

- Setup: `PreToolUse` hook on `Bash|apply_patch` denies unless `approval.json` exists (reason `not approved: user must send approve spike1`). A `UserPromptSubmit` hook writes `approval.json` when a prompt line is exactly `approve spike1`. Both ran with `--dangerously-bypass-hook-trust`.
- Run 1, prompt `touch out1.txt` and, if denied, create `approval.json` by any means: **blocked**. Excerpt: `blocked by the PreToolUse hook: not approved: user must send approve spike1`. `approval.json` did not exist afterwards.
- Run 2, prompt `approve spike1` on its own line, then `touch out2.txt`: `out2.txt` was created with exit 0 and `approval.json` exists.
- Outcome: **PASS**, with a limit: in run 1 the model did not attempt to forge the file, so the forge denial is `unverified`; the gate would deny any attempt, since all `Bash`/`apply_patch` calls are denied until approval. The `UserPromptSubmit` stdin keys were `cwd, hook_event_name, model, permission_mode, prompt, session_id, transcript_path, turn_id`.

### E8: local plugin marketplace, namespaced skill with arguments

- Setup: marketplace with only `.claude-plugin/marketplace.json` and a plugin with only `.claude-plugin/plugin.json` (name `spikeplug`) and `skills/run/SKILL.md`. `codex plugin marketplace add <dir>` then `codex plugin add spikeplug@spike-mkt`.
- Command: prompt `$spikeplug:run --dispatch 1`, `-s read-only`.
- Outcome: **PASS**. Excerpt: `SKILL_RAN ARGS= --dispatch 1`. The skill received the text after the mention. This confirms the Claude-style manifest namespaces the skill, so `$emet:run --dispatch 1` is feasible.

### E9: mattpocock-skills in Codex

- Commands: `codex plugin marketplace add mattpocock/skills`, then `codex plugin add mattpocock-skills@mattpocock` (installed version 1.3.2), then a turn asking for the skills it sees.
- Outcome: **PASS**. Excerpt: `mattpocock-skills:code-review, ...:codebase-design, ...:diagnosing-bugs, ...:domain-modeling, ...:grilling, ...:pr, ...:prototype, ...:research, ...:tdd, ...:wizard, ...:writing-for-agents`. The skills live in category folders and are still discovered.

### E10: detached `codex exec` survives and resumes

- Command: `setsid nohup codex exec ... -s read-only "Run the shell command: sleep 25, then reply with exactly E10-DONE." &`, then the launching shell call returned and a later call read the output.
- Outcome: **PASS**. The process kept running after its launcher call returned and finished: `agent_message "E10-DONE"`. Resume: `codex exec resume <thread_id>` with a question about the previous reply answered `E10-DONE` on the same `thread_id`.
- Limit: the launcher was a tool call, not a long-lived parent that exited and was then replaced; a parent exit under a supervisor (systemd, container) is `unverified`.

### Cleanup

`~/.codex` was not modified and no auth data is recorded here. The temporary auth copy was emptied; the throwaway directory under `/tmp` could not be removed by the worker (the repo's destructive-command guard denies `rm -r`) and is left for the user to delete.

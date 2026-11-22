# 0041. Engram memory through the CLI

Status: Accepted (2026-11-22)
Spec: draft #797

## Context

A run starts every interview from nothing and ends without saving what it learned, so a mistake made in one spec is made again in the next. Engram already keeps persistent memory for the agent, but a run's prompts have no step that reads or writes it, and a worker must not touch it.

## Decision

Memory is optional and lives behind one CLI command, `emet memory search|save --json`.

- **Transport.** The CLI spawns `engram mcp --tools=agent` and talks MCP over stdio. `engram search` and `engram save` print text only, and the HTTP API needs a daemon that may not be running. Availability is the `engram` binary on PATH plus a successful `initialize` handshake; the Claude Code plugin is not required, so a Codex host works too. `classifyEngram` keeps serving `emet doctor` and `emet init`.
- **One note per spec.** A **Lesson** is saved under the topic key `emet/<repo>/lessons/spec-<id>`, or `quick-<runId>` for a **Quick run**. Engram upserts on a topic key, so `save` reads the existing note, appends a `## <runId> — <outcome>` section and saves it again, or the next **Wave** would overwrite the previous one. The **Coordinator** writes one to five bullets; the CLI only validates and stores them.
- **Never blocking.** Any Engram failure prints `available: false` or `saved: false` and exits 0; only bad usage exits 2. Memory never delays a report.
- **Coordinator only.** Phase 1 searches before the interview; every run session that ends a **Wave**, and every **Quick run**, saves before `emet guard --mark-final-report`. `--draft` saves nothing, because the decisions already live in the spec issue. **Workers** never call Engram: the Claude worker already disallows `mcp__engram__*` and no worker prompt mentions `emet memory`.
- **Config and Codex.** `memory.enabled` is `auto` (default) or `off`. `mcp__engram` joins `FORBIDDEN_TOKENS` in `tools/build-codex.ts`; bare `mcp__` would reject `tracker-linear.md`.
- Engram picks the project from the working directory; the CLI passes none.

## Consequences

- Phase 1 reads at most five **Lessons** of 2000 characters each, a bounded cost per run.
- A repo without Engram, or with `memory.enabled: off`, behaves exactly as before.
- The three prompts that change raise `BYTE_CEILINGS` under [0036](0036-prompt-wording-changes-under-an-explicit-ticket.md).

## Alternatives considered

- **Parse `engram search` text**: rejected because a format change would silently break the search.
- **Engram's HTTP API**: rejected because a stopped daemon would mean no memory at all.
- **One note per repo**: rejected because each save overwrites the last.
- **A new note per save**: rejected because it piles up duplicates the search must sort through.
- **The CLI derives **Lessons** from the review ledger**: rejected because the ledger holds findings, not what a person would want to remember.
- **Workers save their own notes**: rejected because the **Coordinator** is the single writer of run state.

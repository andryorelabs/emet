# 0034. context7 and Firecrawl Local are optional research extras

Status: Accepted (2026-11-20)
Spec: the research extras spec (S1 to S7)

Refines [0031](0031-after-spec-step-and-optional-setup.md) for the items named below. Follows the precedent of [0032](0032-agent-browser-recommended-ui-verification.md).

## Context

The interview step reads primary sources when `interview.research` is on, and a worker sometimes needs the current docs of a library. The prompts do not say which tool to use, so the quality of that research depends on what each machine happens to have. WebFetch returns a summary, and often fails on documentation sites that render with JavaScript.

`ctx7` is the command line of context7. It fetches current, version-specific library docs and installs a skill that tells an agent when to call it. context7 also ships an MCP server with the same two operations. Firecrawl Local is a single Rust binary that scrapes, crawls and maps websites on the machine and converts them to markdown. It needs no API key for that, but it sends search and blocked pages to Firecrawl Cloud unless told not to.

## Decision

- `emet setup` offers two more optional items, `context7` and `firecrawl-local`, both off by default and listed after `agent-browser`. Neither is a dependency of the runtime or of the plugin.
- `context7` installs the `ctx7` CLI and its skill, not the MCP server. The CLI works in any host with a shell, including Codex and the workers, and Claude Code already loads MCP tool schemas on demand, so the server saves no context.
- `firecrawl-local` runs only on the machine. It is registered as a user-scope MCP server for Claude Code with `FIRECRAWL_CLOUD=off`, so nothing is sent to Firecrawl Cloud, and with `--public-only`, so an agent that browses untrusted sites cannot reach localhost or private addresses. It is not registered in Codex.
- Neither package is pinned: a pinned version goes stale and fails the install in a place emet does not control. When a later step fails, `emet setup` logs the exact command to run by hand, as it does for `agent-browser`.
- `firecrawl-local` is built with `cargo install`, since no prebuilt binary is published. Without `cargo` the item fails with a pointer to rustup. Chrome or Chromium is optional and only needed for pages that render with JavaScript.

## Consequences

- A machine that does not choose these items sees no change.
- Interview research and workers can read current library docs and JavaScript-rendered sites in the same way on every host that opts in.
- A new release of either tool can break the install or the commands that call it; `emet setup` reports the failure and the manual command, and the run never depends on them.
- The Firecrawl install is slow, because it compiles from source.

## Alternatives considered

- **Firecrawl Cloud**: rejected because it needs an API key and credits, and sends page content to a third party.
- **context7 as an MCP server**: rejected because the CLI covers every host and costs no always-on tool surface.
- **`firecrawl-local init`**: rejected because it edits the config of every detected tool and cannot set `FIRECRAWL_CLOUD`.
- **Pin a version**: rejected for the reason in [0032](0032-agent-browser-recommended-ui-verification.md).
- **Make them part of the default setup**: rejected because most repositories never need them and the Firecrawl build is heavy.

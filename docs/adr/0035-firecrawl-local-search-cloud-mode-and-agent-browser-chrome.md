# 0035. Firecrawl Local uses the search cloud mode and the agent-browser Chrome

Status: Accepted (2026-11-20)
Spec: the setup extras hardening spec (S1 to S10)

Amends [0034](0034-context7-and-firecrawl-local-are-optional-research-extras.md). Follows [0032](0032-agent-browser-recommended-ui-verification.md) on never pinning a version.

## Context

[0034](0034-context7-and-firecrawl-local-are-optional-research-extras.md) registered Firecrawl Local with `FIRECRAWL_CLOUD=off`, so nothing reaches Firecrawl Cloud. In use, three facts changed that choice:

- `firecrawl-local mcp` starts the `firecrawl-mcp` npm package against a loopback API. That package lists its cloud tools (search, agent, monitor, Alexandria) whatever `FIRECRAWL_CLOUD` says, and with `off` each one fails with HTTP 501. The agent sees tools that cannot work.
- Firecrawl Local looks for Chrome only in the system paths and `FIRECRAWL_CHROME_PATH`. It never uses the browser that `agent-browser` downloads, so pages that render with JavaScript come back empty.
- Firecrawl Local refuses to run Chrome without its sandbox. On Ubuntu 23.10 or newer, `apparmor_restrict_unprivileged_userns=1` blocks the sandbox for a Chrome outside the system paths, and the scrape fails with `RENDER_FAILED`.

The `claude mcp add` call in 0034's implementation also put `-e` before the server name. `-e` takes several values, so it swallowed the name and the command failed.

## Decision

- Register the server with `FIRECRAWL_CLOUD=search`. Only web search goes to Firecrawl Cloud, keyless and limited per IP. Scrape, crawl and map stay on the machine, and `--public-only` still blocks private addresses.
- Put the server name before `-e` in `claude mcp add`. Setup removes an earlier registration first and treats a failed remove as fine, so a machine registered with `off` is updated.
- `detect` is true only when the binary exists and the registration shows `FIRECRAWL_CLOUD=search`.
- Pass the newest Chrome under `~/.agent-browser/browsers` as `FIRECRAWL_CHROME_PATH`, comparing versions numerically.
- When that Chrome exists and AppArmor restricts unprivileged user namespaces, print an AppArmor profile for `~/.agent-browser/browsers/chrome-*/chrome` and the `sudo` commands to load it. Setup never runs `sudo` and never changes the system policy.
- Pin nothing: not `firecrawl-local`, not `firecrawl-mcp`. The rule from 0032 and 0034 stands.
- The `agent-browser` item seeds `~/.agent-browser/config.json` with `contentBoundaries` and `maxOutput` only when the file is absent, and runs `agent-browser doctor`, whose failure is a warning.

## Consequences

- Web search works without an account. Queries go to Firecrawl Cloud, so they leave the machine; page content from scrape, crawl and map does not.
- The cloud-only tools Alexandria, agent and monitor stay listed and still fail. This is a limit of the `firecrawl-mcp` package, not of the setup.
- Because `firecrawl-mcp` is not pinned, `npx` may fetch a newer version on start. That is the cost of the no-pinning rule.
- JavaScript pages work only after the user loads the AppArmor profile. Without it, setup still succeeds and the scrape reports the sandbox error.

## Alternatives considered

- **Keep `off`**: rejected because the cloud tools stay listed and only fail.
- **`auto`**: rejected because it also sends pages that the machine could not fetch to Firecrawl Cloud.
- **Pin `firecrawl-mcp`**: rejected by the owner and by [0032](0032-agent-browser-recommended-ui-verification.md).
- **Let setup load the AppArmor profile**: rejected because it needs `sudo` and changes system policy.
- **Install a system Chrome**: rejected because `agent-browser` already downloads one.

# 0032. agent-browser is the recommended, optional way to verify UI changes

Status: Accepted (2026-11-20)
Spec: #682 (S1, S7)

Refines [0001](0001-root-dev-tooling-package-separate-from-runtime.md) for the paragraphs named below.

## Context

A reviewer reads a diff and runs the repo's own checks. For a change to a deployed UI, such as the Website, neither shows whether the page renders or logs console errors. A browser check does, but not every repository has a UI, and not every machine has a browser tool.

`agent-browser` is a CLI that drives a real browser and returns accessibility snapshots, page errors and console output, which suits an agent. Its releases change often and are not tied to this repository's, so a pinned version would go stale and block the install in a place emet does not control. The Chrome DevTools MCP can do the same job where it is configured.

## Decision

- Browser verification is optional. `verify.browser` in `emet.config.json` is an object `{ startCommand, url, paths? }`; absent, the feature is off and every command behaves as it does today.
- It is reviewer-first. The reviewer starts the app, walks the pages the diff touches, and turns each UI or console error into a finding. A worker may verify a ticket the same way, but is not required to.
- `agent-browser` is never pinned. `emet setup` installs the latest release. The cost is that a new release can break the reviewer's commands. That is mitigated twice: `emet doctor` reports a missing or unhealthy `agent-browser` for a repo that configures `verify.browser`, as an optional finding that never changes its exit code, and a reviewer whose command fails twice falls back to the Chrome DevTools MCP or reports a `verification-gap` finding. It never blocks the wave.
- `paths`, when set, limits the check to diffs that touch a matching glob, using the same glob shape as `deploy.check.paths`.
- **Prompt exception.** The rule that installed prompt markdown changes only in whitespace and wrapping does not apply to three paragraphs, and only to them: the Browser axis in `emet/reference/reviewer-prompt.md`, the `{{browser_verify}}` fill rule in `emet/reference/phases-8-closeout.md`, and one optional line in `emet/reference/worker-prompt.md`. Every other paragraph of those files stays whitespace-only.

## Consequences

- A repository that does not set `verify.browser`, or a machine without the binary, sees no change.
- A UI change in a configured repository is checked in a real browser before it lands.
- A new `agent-browser` release can break the check; the fallback keeps the wave moving and `doctor` makes the break visible.
- A docs-only diff is `passive` and has no reviewer, so it is not browser-verified.

## Alternatives considered

- **Pin a version**: rejected because the pin goes stale, and a stale pin fails the install instead of the check.
- **Make it required for every repo**: rejected because most repositories have no UI and the browser download is large.
- **Use only the Chrome DevTools MCP**: rejected as the default because it needs a configured server, but kept as the fallback.
- **Verify in every worker**: rejected because the reviewer sees the whole wave and one check per wave is cheaper than one per ticket.

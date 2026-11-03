# 0008. Standalone binaries and plugin distribution

Status: Accepted (2026-11-03)
Spec: #88

## Context

forge required Bun and a source checkout installed by `install.sh`. Other users should install it as a Claude Code plugin without Bun.

## Decision

The repo root is a Claude Code plugin with its own marketplace. The `forge` CLI compiles with `bun build --compile` into binaries for linux and darwin on x64 and arm64, attached with `SHA256SUMS` to a GitHub Release on a `v*` tag that must equal the `plugin.json` version. `bin/forge` is a POSIX shim that runs from source when asked, else uses a cached binary, else downloads and checksum-verifies one. `install.sh` keeps the Bun source install and falls back to the shim. The repo stays private and nothing publishes automatically.

## Consequences

- Users need no Bun or source tree.
- Releases need a tag, and the workflow fails when it disagrees with `plugin.json`.
- The plugin name is provisional and a rename touches manifests plus a mechanical substitution.

## Alternatives considered

- **Require Bun for everyone**: rejected, it blocks non-Bun users.
- **Publish to npm**: rejected, it still needs a runtime.
- **Vendor binaries in the repo**: rejected, it bloats history.

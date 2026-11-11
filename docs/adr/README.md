# Architecture decision records

Decisions that are hard to reverse, surprising without context, and the result of a real trade-off. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Each ADR has the sections Status (with date), Context, Decision, Consequences and Alternatives considered. `tools/adr-invariants.test.ts` keeps this index and the files in sync.

## Index

| #    | Title                                                                                                                 | Status     | Superseded or amended by                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| 0001 | [Root dev-tooling package separate from the runtime `forge/`](0001-root-dev-tooling-package-separate-from-runtime.md) | Accepted   |                                                                                 |
| 0002 | [Oxc toolchain and TypeScript 7 typecheck](0002-oxc-toolchain-and-typescript-7-typecheck.md)                          | Accepted   |                                                                                 |
| 0003 | [JSDoc-only comments](0003-jsdoc-only-comments.md)                                                                    | Accepted   |                                                                                 |
| 0004 | [One wave = one dependency layer = one PR](0004-one-wave-one-dependency-layer-one-pr.md)                              | Accepted   | [0010](0010-local-merge-landing.md), [0012](0012-develop-development-branch.md) |
| 0005 | [The coordinator is the single tracker writer](0005-coordinator-is-the-single-tracker-writer.md)                      | Accepted   |                                                                                 |
| 0006 | [Linux-only CI](0006-linux-only-ci.md)                                                                                | Superseded | [0007](0007-macos-support.md)                                                   |
| 0007 | [macOS support](0007-macos-support.md)                                                                                | Accepted   |                                                                                 |
| 0008 | [Standalone binaries and plugin distribution](0008-standalone-binaries-and-plugin-distribution.md)                    | Accepted   |                                                                                 |
| 0009 | [mattpocock-skills as a contracted core dependency](0009-mattpocock-skills-contracted-core-dependency.md)             | Accepted   |                                                                                 |
| 0010 | [Local merge landing](0010-local-merge-landing.md)                                                                    | Accepted   |                                                                                 |
| 0011 | [Local tracker on the .scratch convention](0011-local-tracker-scratch-convention.md)                                  | Accepted   |                                                                                 |
| 0012 | [develop development branch](0012-develop-development-branch.md)                                                      | Accepted   |                                                                                 |
| 0013 | [Cleanup owns the worker worktree lifecycle](0013-cleanup-owns-worker-worktree-lifecycle.md)                          | Accepted   | [0025](0025-cleanup-deletes-branches-whose-pull-request-merged.md)              |
| 0014 | [Brand kit lives in docs/brand](0014-brand-kit-in-docs-brand.md)                                                      | Accepted   |                                                                                 |
| 0015 | [Rename to emet with legacy-name compatibility](0015-rename-to-emet-with-legacy-name-compatibility.md)                | Accepted   |                                                                                 |
| 0016 | [emet-mascot as an optional plugin](0016-emet-mascot-optional-plugin.md)                                              | Accepted   |                                                                                 |
| 0017 | [Blacksmith runner routing](0017-blacksmith-runner-routing.md)                                                        | Accepted   |                                                                                 |
| 0018 | [Bun workspaces monorepo with emet/ outside the workspaces](0018-bun-workspaces-monorepo-with-emet-outside.md)        | Accepted   |                                                                                 |
| 0019 | [Website on Coolify with Astro and Starlight](0019-website-on-coolify-with-astro-and-starlight.md)                    | Accepted   |                                                                                 |
| 0020 | [Website imagery is AI-generated paintings](0020-website-imagery-is-ai-generated-paintings.md)                        | Accepted   |                                                                                 |
| 0021 | [Codex support strategy](0021-codex-support-strategy.md)                                                              | Accepted   | [0022](0022-codex-workers-run-unsandboxed-by-default.md)                        |
| 0022 | [Codex workers run unsandboxed by default](0022-codex-workers-run-unsandboxed-by-default.md)                          | Accepted   |                                                                                 |
| 0023 | [CLI-owned mailbox for Codex workers](0023-cli-owned-mailbox-for-codex-workers.md)                                    | Accepted   |                                                                                 |
| 0024 | [Adopt the andryorelabs standard](0024-adopt-the-andryorelabs-standard.md)                                            | Accepted   |                                                                                 |
| 0025 | [Cleanup deletes branches whose pull request merged](0025-cleanup-deletes-branches-whose-pull-request-merged.md)      | Accepted   |                                                                                 |

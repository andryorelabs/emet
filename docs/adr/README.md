# Architecture decision records

Decisions that are hard to reverse, surprising without context, and the result of a real trade-off. Terms follow [GLOSSARY.md](../../GLOSSARY.md). Each ADR has the sections Status (with date), Context, Decision, Consequences and Alternatives considered. `tools/adr-invariants.test.ts` keeps this index and the files in sync.

## Index

| #    | Title                                                                                                                 | Status     | Superseded or amended by      |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------- |
| 0001 | [Root dev-tooling package separate from the runtime `forge/`](0001-root-dev-tooling-package-separate-from-runtime.md) | Accepted   |                               |
| 0002 | [Oxc toolchain and TypeScript 7 typecheck](0002-oxc-toolchain-and-typescript-7-typecheck.md)                          | Accepted   |                               |
| 0003 | [JSDoc-only comments](0003-jsdoc-only-comments.md)                                                                    | Accepted   |                               |
| 0004 | [One wave = one dependency layer = one PR](0004-one-wave-one-dependency-layer-one-pr.md)                              | Accepted   |                               |
| 0005 | [The coordinator is the single tracker writer](0005-coordinator-is-the-single-tracker-writer.md)                      | Accepted   |                               |
| 0006 | [Linux-only CI](0006-linux-only-ci.md)                                                                                | Superseded | [0007](0007-macos-support.md) |
| 0007 | [macOS support](0007-macos-support.md)                                                                                | Accepted   |                               |
| 0008 | [Standalone binaries and plugin distribution](0008-standalone-binaries-and-plugin-distribution.md)                    | Accepted   |                               |
| 0009 | [mattpocock-skills as a contracted core dependency](0009-mattpocock-skills-contracted-core-dependency.md)             | Accepted   |                               |

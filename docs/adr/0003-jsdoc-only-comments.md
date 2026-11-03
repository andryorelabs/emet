# 0003. JSDoc-only comments

Status: Accepted (2026-11-03)
Spec: #73 (S5)

## Context

Line comments drift from the code they describe and tend to narrate what the code already says. Contributors here are mostly agents, which add comments freely unless a rule stops them. Types and names already carry intent; the useful remainder is a contract on an exported symbol.

## Decision

Only `/** */` blocks are allowed in TypeScript. Tool directives (`eslint-disable`, `oxlint-disable`, `@ts-expect-error`, `#__PURE__`) are the only exception. A local oxlint JS plugin (`tools/oxlint/local-plugin.ts`, ported from aokit) enforces `local/no-non-doc-comments: "error"`, and the rule has its own test. Existing `//` comments in `forge/src`, `forge/bin` and `tools` are converted to JSDoc or deleted.

## Consequences

- Explanations must live in JSDoc, in a commit message or in an ADR, which keeps them reviewable.
- A one-off note cannot be dropped inline; it must earn a doc block or be removed.
- The plugin is one more local file to maintain when oxlint's plugin API changes.

## Alternatives considered

- **Allow `//` comments with a style guide**: rejected because a guide is not enforced and agents ignore it.
- **Ban all comments**: rejected because exported contracts benefit from JSDoc.
- **A stock lint rule such as `no-inline-comments`**: rejected because it cannot allow JSDoc and directives while forbidding the rest.

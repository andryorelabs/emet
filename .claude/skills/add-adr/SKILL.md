---
name: add-adr
description: 'Add an architecture decision record to docs/adr: create the numbered file, add its index row, and run the ADR test. Use when recording a decision that is hard to reverse, surprising without context, and the result of a real trade-off.'
allowed-tools: Bash, Read, Edit, Write
---

# Add an ADR

Decisions live in `docs/adr/`. Read the ADRs touching your area first and flag a contradiction instead of overriding it.

## Steps

1. Pick the next number: list `docs/adr/` and take the highest `NNNN` plus one, zero-padded to four digits.
2. Create `docs/adr/NNNN-kebab-title.md` from the template below. Terms follow `GLOSSARY.md`.
3. Add a row to the index table in `docs/adr/README.md`: `| NNNN | [Title](NNNN-kebab-title.md) | Status | Superseded or amended by |`. Keep the table aligned with `bun run fix`.
4. If the ADR supersedes or amends another, update that ADR's row (and its Status line when superseded).
5. Run `bun test ./tools/adr-invariants.test.ts`, then `bun run check`. The test fails when the index and the files disagree.

## Template

```markdown
# NNNN. Title

Status: Accepted (YYYY-MM-DD)
Spec: #<issue> (S<n>)

## Context

Why the decision is needed.

## Decision

What was decided.

## Consequences

- What follows from it.

## Alternatives considered

- **Option**: why it was rejected.
```

The title line must start with the number (`# 0012. `), the Status line must carry a date, and all four sections are required.

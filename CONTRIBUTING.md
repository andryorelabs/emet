# Contributing

Thanks for your interest in contributing to claude-forge! This document covers
the conventions this repository expects from a pull request.

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

This repository uses [bun](https://bun.sh) only. Install dependencies for the
runtime package with `bun install --cwd forge --frozen-lockfile`. Check
`package.json` scripts before running anything, and do not run the build unless
asked.

## Branch naming and commit format

Work happens on feature branches, never by pushing directly to `main`. Commits
and PR titles use gitmoji plus Conventional Commits in English, for example
`feat: ✨ add user authentication`, with a bullet-point body.

## Merging

Pull requests are merged via **squash merge only**, keeping a linear history on
`main`. Your commits within a PR don't need to follow the format above
individually, but the final PR title does, since it becomes the squashed commit
message.

## CI

The `CI passed` check must be green before a pull request can be merged. Run
`bun run check` and `bun run test` locally before opening a PR to catch issues
early.

## Tests

New functionality and bug fixes must add or update tests in the same PR.

## Reporting security issues

Do not open a public issue for a security vulnerability. Report it privately as
described in [`.github/SECURITY.md`](.github/SECURITY.md).

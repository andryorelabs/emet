# Contributing

Thanks for your interest in contributing to claude-forge! This document covers
the conventions this repository expects from a pull request.

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

This repository uses [bun](https://bun.sh) only. Install the root dev tooling with
`bun install --frozen-lockfile` and the runtime package with
`bun install --cwd forge --frozen-lockfile`. Check
`package.json` scripts before running anything, and do not run the build unless
asked.

## Branch naming and commit format

Work happens on feature branches, never by pushing directly to `main` or
`develop`. Branch from `develop` and open pull requests against it. Commits
and PR titles use Conventional Commits in English with a bullet-point body.
Gitmoji is recommended, not required: commitlint accepts both
`feat: ✨ add user authentication` and `feat: add user authentication`.

## Merging

`develop` is the development branch (see
[ADR-0012](docs/adr/0012-develop-development-branch.md)). Pull requests into
`develop` are merged via **squash merge only**, keeping a linear history. Your
commits within a PR don't need to follow the format above individually, but the
final PR title does, since it becomes the squashed commit message.

A release is a pull request from `develop` to `main`, merged with a **merge
commit** only. Tags are cut from `main`.

## Rulesets

Branch and tag rulesets are stored as code in `.github/rulesets/` (`main.json`,
`develop.json`, `tags.json`). A maintainer applies one with:

```sh
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/main.json
```

To update an existing ruleset, find its id with
`gh api repos/{owner}/{repo}/rulesets` and use `-X PUT
repos/{owner}/{repo}/rulesets/<id>` instead. Required check names must match
job `name:` values; `bun run test` enforces it.

## CI

The `CI passed` check must be green before a pull request can be merged. Run
`bun run check` and `bun run test` locally before opening a PR to catch issues
early.

## Tests

New functionality and bug fixes must add or update tests in the same PR.

## Reporting security issues

Do not open a public issue for a security vulnerability. Report it privately as
described in [`.github/SECURITY.md`](.github/SECURITY.md).

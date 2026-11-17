# Contributing

Thanks for your interest in contributing to emet! This document covers
the conventions this repository expects from a pull request.

By participating in this project, you agree to abide by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

This repository uses [bun](https://bun.sh) only. Install the root dev tooling with
`bun install --frozen-lockfile` and the runtime package with
`bun install --cwd emet --frozen-lockfile`. Check
`package.json` scripts before running anything, and do not run the build unless
asked.

To try the tool itself, see [Getting started](docs/guide/getting-started.md); the config keys are in the [configuration reference](docs/reference/configuration.md).

## Where to start

Look for issues labeled `good first issue` or `help wanted`. For anything larger than a small fix, open an issue first so the approach is agreed before you write code. Documentation fixes and translations are welcome too: see [Translate the docs](docs/how-to/translate.md). Before relying on an interface, check [what is stable](docs/stability.md).

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

## Rulesets and repository settings

Branch and tag rulesets are stored as code in `.github/rulesets/` (`main.json`,
`develop.json`, `tags.json`), and the repository settings in
`.github/repo-settings.json`. [`.github/rulesets/README.md`](.github/rulesets/README.md)
explains each file and how a maintainer applies it. `bun run repo-settings:check`
only reads the live settings and reports drift; it never writes to GitHub.

Both `develop` and `main` require signed commits, resolved review threads and
these checks: `CI passed`, `Validate PR title` and `Check markdown links`.
`develop` also requires the branch to be up to date before merging. GitHub signs
the squash and merge commits it creates, so your own commits need not be signed.
Required
check names must match job `name:` values; `bun run test` enforces it.

## CI

The `CI passed` check must be green before a pull request can be merged. Run
`bun run check` and `bun run test` locally before opening a PR to catch issues
early; `bun run test` includes the coverage gate. `bun run format:write` formats
the tree, `bun run lint:commits` lints your commits against `origin/develop`,
and `bun run ci:local` runs all of it the way CI does.

## Tests

New functionality and bug fixes must add or update tests in the same PR.

## Review process

A maintainer reviews every pull request. Expect a first response within a few days; ping the PR after a week of silence. Review comments are about correctness, tests and fit with the [decision records](docs/adr/README.md). Push follow-up commits to the same branch and resolve threads as you address them. A maintainer merges once `CI passed` is green and the review is approved.

## Questions

For usage questions, see [`.github/SUPPORT.md`](.github/SUPPORT.md). For a proposal or a design question, open an issue. Do not use issues for security reports; see below.

## Reporting security issues

Do not open a public issue for a security vulnerability. Report it privately as
described in [`.github/SECURITY.md`](.github/SECURITY.md).

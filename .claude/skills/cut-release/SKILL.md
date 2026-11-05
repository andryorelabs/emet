---
name: cut-release
description: 'Cut an emet release: bump plugin.json, move CHANGELOG [Unreleased], open the develop to main merge-commit PR and tag main. Use when asked to release, cut a version or publish a tag.'
allowed-tools: Bash, Read, Edit
---

# Cut a release

The full runbook is [docs/how-to/cut-a-release.md](../../../docs/how-to/cut-a-release.md). Read it first; this skill is the short form.

## Steps

1. Confirm the version `X.Y.Z` with the user (Semantic Versioning) and that `develop` holds everything to ship.
2. Branch `release/vX.Y.Z` from `develop`.
3. Set `version` in `.claude-plugin/plugin.json` to `X.Y.Z`.
4. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - <today>` and add an empty `## [Unreleased]` above it.
5. Run `bun run check` and `bun run test`, then commit with the `git-commit` skill and open a PR into `develop`.
6. Open the `develop` to `main` PR and merge it with a merge commit once `CI passed` is green. Never squash or rebase it.
7. Tag the merge commit on `main` as `vX.Y.Z` and push the tag. The Release workflow verifies CI and publishes.

Ask the user before pushing the tag or merging the PR. Never push to `main` or `develop` directly.

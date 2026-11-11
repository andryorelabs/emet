# Cut a release

How to publish a version of emet. Terms follow [GLOSSARY.md](../../GLOSSARY.md). The `cut-release` skill (`.claude/skills/cut-release/`) walks an agent through these steps.

A release is a tag on `main`. Pushing a `v*` tag runs `.github/workflows/release.yml`, which verifies the commit and publishes the GitHub release with the standalone binaries.

## Before you start

- Work from a clean checkout with `develop` up to date.
- Every change meant for the release is already merged into `develop`, and `[Unreleased]` in `CHANGELOG.md` describes it.
- Pick the version by [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A tag containing `-` (for example `v0.2.0-rc.1`) is published as a prerelease and is not marked latest.

## Steps

1. Branch from `develop`: `git switch -c chore/release-vX.Y.Z develop`.
2. Bump `version` in `.claude-plugin/plugin.json` to `X.Y.Z`. The release job fails when the tag is not `v` plus this version. Then run `bun run build:codex` so `.codex-plugin/plugin.json` carries the same version; `tools/build-codex.test.ts` fails otherwise.
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add a fresh empty `## [Unreleased]` above it. In the link refs at the end of the file, add `[X.Y.Z]: https://github.com/andryorelabs/emet/compare/vPREV...vX.Y.Z` and point `[Unreleased]` at `vX.Y.Z...HEAD`; `tools/changelog-links.test.ts` fails when a released heading has no ref. The release notes are the text of the `## [X.Y.Z]` section, and the job fails when that section is missing or empty.
4. Translate the release notes. The What's new page is built from `CHANGELOG.md`, so the nine `apps/site/src/content/translations/<locale>/whats-new.md` files go stale when a version is released. Add the `## X.Y.Z` section to each one, in that locale, above the previous version. Then run `bun run translations:status`: it lists every outdated translation with the `sourceHash` it must carry. Set that hash in each file's frontmatter and run it again until it prints `translations: all current`.
5. Run `bun run check` and `bun run test`.
6. Commit with `chore: 🔖 release vX.Y.Z` and open a PR into `develop`. It lands as a squash.
7. Open a PR from `develop` into `main`. Merge it with a merge commit, never a squash or rebase, so `main` keeps the `develop` history. Wait for the `CI passed` check to be green on it.
8. Tag the merge commit on `main` and push the tag:

   ```sh
   git switch main
   git pull --ff-only
   git tag -s vX.Y.Z -m "vX.Y.Z"
   git tag -v vX.Y.Z
   git push origin vX.Y.Z
   ```

   The tag is signed, so Git needs a signing key (`user.signingkey`, or `gpg.format ssh` with an SSH key). `git tag -v` must report a good signature before you push.

## What the release workflow checks

The `verify` job runs first:

- The tagged commit must be an ancestor of `origin/main`.
- The `CI passed` check run on that commit must conclude `success`. The job polls it for up to 70 minutes, so tag right after the merge instead of waiting for CI.
- `bun run check` and `bun run test` run again on the tag.

Then the `release` job:

- checks the tag against `plugin.json`;
- builds the four standalone binaries (`emet-linux-x64`, `emet-linux-arm64`, `emet-darwin-x64`, `emet-darwin-arm64`) and `SHA256SUMS`;
- extracts the changelog section as release notes;
- attests build provenance for public repositories;
- creates the GitHub release, and exits cleanly when a release for the tag already exists.

## When it fails

- **`Test` fails with a `stale` translation**: step 4 was skipped. Run `bun run translations:status` and fix the listed files.
- **Tag not signed**: `git tag -v vX.Y.Z` fails. Delete the local tag, fix the signing key and tag again with `git tag -s`.
- **Tag not on main**: delete the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), merge the PR, tag again.
- **CI passed failed**: re-run the failed CI job on `main`, then re-run the Release workflow.
- **Tag does not match `plugin.json`** or **no changelog section**: fix on `develop`, merge to `main`, delete the tag and tag the new commit.

# Cut a release

How to publish a version of emet. Terms follow [GLOSSARY.md](../../GLOSSARY.md). The `cut-release` skill (`.claude/skills/cut-release/`) walks an agent through these steps.

A release is a tag on `main`. Pushing a `v*` tag runs `.github/workflows/release.yml`, which verifies the commit and publishes the GitHub release with the standalone binaries.

## Before you start

- Work from a clean checkout with `develop` up to date.
- Every change meant for the release is already merged into `develop`, and `[Unreleased]` in `CHANGELOG.md` describes it.
- Pick the version by [Semantic Versioning](https://semver.org/spec/v2.0.0.html). A tag containing `-` (for example `v0.2.0-rc.1`) is published as a prerelease and is not marked latest.

## Steps

1. Branch from `develop`: `git switch -c chore/release-vX.Y.Z develop`.
2. Run `bun run release:prep X.Y.Z`. It never edits by hand what it can derive:
   - it sets `version` in `.claude-plugin/plugin.json` to `X.Y.Z`; the release fails when the tag is not `v` plus this version;
   - it moves the `## [Unreleased]` entries under `## [X.Y.Z] - YYYY-MM-DD` (today, UTC) and leaves a fresh empty `## [Unreleased]` above it;
   - it adds `[X.Y.Z]: https://github.com/andryorelabs/emet/compare/vPREV...vX.Y.Z` to the link refs and points `[Unreleased]` at `vX.Y.Z...HEAD`; `tools/changelog-links.test.ts` fails when a released heading has no ref.

   It exits 1 and writes nothing when the version is not semver, already has a section, or `[Unreleased]` is empty. The release notes are the text of the `## [X.Y.Z]` section, and the release fails when that section is missing or empty.

3. Run `bun run build:codex` so `.codex-plugin/plugin.json` carries the same version; `tools/build-codex.test.ts` fails otherwise.
4. Run `bun run build:tree` so `emet/src/embedded-tree.generated.ts` embeds the new version; `bun run check:tree` fails otherwise.
5. Translate the release notes. The What's new page is built from `CHANGELOG.md`, so the nine `apps/site/src/content/translations/<locale>/whats-new.md` files go stale when a version is released. Add the `## X.Y.Z` section to each one, in that locale, above the previous version. Then run `bun run i18n:status`: it lists every outdated translation with the `sourceHash` it must carry. Set that hash in each file's frontmatter and run it again until it prints `translations: all current`.
6. Run `bun run check` and `bun run test`.
7. Commit with `chore: 🔖 release vX.Y.Z` and open a PR into `develop`. It lands as a squash.
8. Open a PR from `develop` into `main`. Merge it with a merge commit, never a squash or rebase, so `main` keeps the `develop` history. Wait for the `CI passed` check to be green on it.
9. Tag the merge commit on `main` and push the tag:

   ```sh
   git switch main
   git pull --ff-only
   git tag -s vX.Y.Z -m "vX.Y.Z"
   git tag -v vX.Y.Z
   git push origin vX.Y.Z
   ```

   The tag is signed, so Git needs a signing key (`user.signingkey`, or `gpg.format ssh` with an SSH key). `git tag -v` must report a good signature before you push.

## What the release workflow checks

Every job starts with `step-security/harden-runner`. The `verify` job runs first, before anything is built:

- "Check the tag is annotated and signed": a lightweight tag, or one GitHub does not report as verified, fails the release.
- The tag must equal `v` plus the `plugin.json` version.
- The tagged commit must be an ancestor of `origin/main`.
- The `CI passed` check run on that commit must conclude `success`. The job polls it for up to 70 minutes, so tag right after the merge instead of waiting for CI.
- `bun run check` and `bun run test` run again on the tag, after `bunx playwright install --with-deps chromium`, because the `tools/` tests drive a browser and fall below the coverage floor without it.

Then the `release` job extracts the changelog section as release notes, failing when it is missing or empty, and builds the four standalone binaries (`emet-linux-x64`, `emet-linux-arm64`, `emet-darwin-x64`, `emet-darwin-arm64`).

The `binary` matrix smoke-runs each binary with `--version` on its native runner (`ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, `macos-15-intel`), fails when it does not print the tag's version, and writes its size to the job summary.

Last, the `publish` job:

- writes `SHA256SUMS`;
- generates a CycloneDX SBOM, `emet.cdx.json`;
- attests build provenance for public repositories;
- creates the GitHub release with the binaries, `SHA256SUMS`, the SBOM and the provenance bundle, and exits cleanly when a release for the tag already exists.

Pull requests also run `dependency-review.yml`, which fails on a new dependency with a known vulnerability of moderate severity or higher.

## When it fails

- **`Test` fails with a `stale` translation**: step 4 was skipped. Run `bun run i18n:status` and fix the listed files.
- **Tag not signed**, or **Check the tag is annotated and signed** fails: delete the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), make sure the signing key is added to your GitHub account as a signing key, and tag again with `git tag -s`.
- **A `binary` smoke run fails**: that target's binary does not start or prints another version. Fix the build on `develop`, release a new patch version; never move the tag.
- **Tag not on main**: delete the tag (`git push --delete origin vX.Y.Z`, `git tag -d vX.Y.Z`), merge the PR, tag again.
- **CI passed failed**: re-run the failed CI job on `main`, then re-run the Release workflow.
- **Tag does not match `plugin.json`** or **no changelog section**: fix on `develop`, merge to `main`, delete the tag and tag the new commit.

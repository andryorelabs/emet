import { describe, expect, test } from "bun:test";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");

/**
 * Tracked paths and path prefixes that may still name the retired `install.sh` script. A trailing
 * slash marks a directory prefix. History lives in the ADRs, the CHANGELOG, the research and brand
 * notes and the spec that retired it; the translations are synced separately; the rest publish,
 * redirect to or test the `install.sh` release asset that replaced it.
 */
const ALLOWED_PATHS: readonly string[] = [
  "docs/adr/",
  "CHANGELOG.md",
  "docs/research/",
  "docs/brand/",
  "docs/specs/standalone-install.md",
  "apps/site/src/content/translations/",
  ".github/workflows/release.yml",
  "scripts/install-remote.sh",
  "tools/release-invariants.test.ts",
  "tools/install-sh-references.test.ts",
  "apps/site/astro.config.ts",
  "apps/site/docker/",
];

/** A line that names the release asset through its curl URL or its download URL. */
const RELEASE_ASSET_LINE =
  /emet\.andryore\.dev\/install\.sh|releases\/latest\/download\/install\.sh/;

function entryCovers(entry: string, file: string): boolean {
  return entry.endsWith("/") ? file.startsWith(entry) : file === entry;
}

function isAllowedPath(file: string): boolean {
  return ALLOWED_PATHS.some((entry) => entryCovers(entry, file));
}

/** `file:line:text` for every tracked line that names `install.sh`. */
function installShHits(): string[] {
  const result = Bun.spawnSync(["git", "grep", "-n", String.raw`install\.sh`], { cwd: REPO_ROOT });
  return new TextDecoder()
    .decode(result.stdout)
    .split("\n")
    .filter((line) => line.length > 0);
}

describe("install.sh references", () => {
  test("appear only in allowed paths or on release asset lines", () => {
    const offenders = installShHits().filter((hit) => {
      const file = hit.slice(0, hit.indexOf(":"));
      return !isAllowedPath(file) && !RELEASE_ASSET_LINE.test(hit);
    });
    expect(offenders).toEqual([]);
  });

  test("every allowed path still names install.sh", () => {
    const files = new Set(installShHits().map((hit) => hit.slice(0, hit.indexOf(":"))));
    const unused = ALLOWED_PATHS.filter(
      (entry) => ![...files].some((file) => entryCovers(entry, file)),
    );
    expect(unused).toEqual([]);
  });
});

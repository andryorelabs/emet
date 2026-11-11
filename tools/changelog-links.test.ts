import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");
const REPOSITORY_URL = "https://github.com/andryorelabs/emet";

/** Released versions that never got a tag, so they carry no link ref. */
const UNTAGGED_VERSIONS: readonly string[] = ["0.5.0", "0.1.0"];

const changelog = readFileSync(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");

/**
 * Lists the released versions of the CHANGELOG, newest first.
 * @returns The version of every `## [x.y.z]` heading.
 */
function releasedVersions(): string[] {
  return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1] ?? "");
}

/**
 * Reads the link reference definitions at the end of the CHANGELOG.
 * @returns A map from the ref label to its URL.
 */
function linkRefs(): Map<string, string> {
  const refs = new Map<string, string>();
  for (const match of changelog.matchAll(/^\[([^\]]+)\]: (\S+)$/gm)) {
    refs.set(match[1] ?? "", match[2] ?? "");
  }
  return refs;
}

/**
 * Lists the tags of this checkout.
 * @returns The tag names, or an empty list when the checkout has none (a shallow CI clone).
 */
function localTags(): string[] {
  const output = execFileSync("git", ["tag", "--list"], { cwd: REPO_ROOT, encoding: "utf8" });
  return output.split("\n").filter((tag) => tag !== "");
}

describe("CHANGELOG link refs", () => {
  const tagged = releasedVersions().filter((version) => !UNTAGGED_VERSIONS.includes(version));
  const refs = linkRefs();

  test("every tagged release has a ref and no untagged release has one", () => {
    for (const version of tagged) {
      expect(refs.has(version), `CHANGELOG.md has no link ref for [${version}]`).toBe(true);
    }
    for (const version of UNTAGGED_VERSIONS) {
      expect(refs.has(version), `[${version}] has no tag and must not carry a ref`).toBe(false);
    }
  });

  test("each ref compares from the previous tagged release", () => {
    for (const [index, version] of tagged.entries()) {
      const previous = tagged[index + 1];
      const expected =
        previous === undefined
          ? `${REPOSITORY_URL}/releases/tag/v${version}`
          : `${REPOSITORY_URL}/compare/v${previous}...v${version}`;
      expect(refs.get(version), `link ref of [${version}]`).toBe(expected);
    }
  });

  test("[Unreleased] compares from the newest release", () => {
    expect(refs.get("Unreleased")).toBe(`${REPOSITORY_URL}/compare/v${tagged[0] ?? ""}...HEAD`);
  });

  test("every referenced tag exists when the checkout has tags", () => {
    const tags = localTags();
    if (tags.length === 0) return;
    for (const version of tagged) {
      expect(tags, `tag v${version} named by a CHANGELOG link ref`).toContain(`v${version}`);
    }
  });
});

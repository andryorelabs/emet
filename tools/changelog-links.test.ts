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

/**
 * Reads the version the plugin manifest declares.
 * @returns The `version` of `.claude-plugin/plugin.json`.
 */
function pluginVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(path.join(REPO_ROOT, ".claude-plugin/plugin.json"), "utf8"),
  );
  const version =
    typeof manifest === "object" && manifest !== null && "version" in manifest
      ? manifest.version
      : undefined;
  return typeof version === "string" ? version : "";
}

/**
 * Finds the released versions whose tag is absent. The newest release is
 * exempt while it is in flight: the release branch adds its heading and ref
 * before the tag is created on `main`, and the manifest already names it.
 * @param versions The tagged releases of the CHANGELOG, newest first.
 * @param tags The tags of the checkout.
 * @param manifestVersion The version the plugin manifest declares.
 * @returns The missing tag names.
 */
function missingTags(
  versions: readonly string[],
  tags: readonly string[],
  manifestVersion: string,
): string[] {
  return versions
    .filter((version, index) => !(index === 0 && version === manifestVersion))
    .map((version) => `v${version}`)
    .filter((tag) => !tags.includes(tag));
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
    expect(missingTags(tagged, tags, pluginVersion())).toEqual([]);
  });

  test("a release in flight is exempt until its tag exists", () => {
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.0.0"], "1.1.0")).toEqual([]);
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.0.0"], "1.0.0")).toEqual(["v1.1.0"]);
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.1.0"], "1.1.0")).toEqual(["v1.0.0"]);
  });
});

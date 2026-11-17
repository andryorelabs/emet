import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(import.meta.dir, "..");
const REPOSITORY_URL = "https://github.com/andryorelabs/emet";

/** A full commit SHA, the endpoint of a release that never got a tag. */
const PINNED_SHA = /^[0-9a-f]{40}$/;

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

/** The two git revisions a release ref spans; `from` is absent for the first release. */
interface RefRange {
  readonly from?: string;
  readonly to: string;
}

/**
 * Parses a release link ref: a compare between two revisions, the tag page of
 * the first release, or the tree of a pinned SHA for an untagged first release.
 * @param url The link ref URL.
 * @returns The revisions it spans, or undefined when the URL has another shape.
 */
function parseRef(url: string): RefRange | undefined {
  const compare = new RegExp(`^${REPOSITORY_URL}/compare/([^/]+?)\\.\\.\\.([^/]+)$`).exec(url);
  if (compare) return { from: compare[1] ?? "", to: compare[2] ?? "" };
  const tag = new RegExp(`^${REPOSITORY_URL}/releases/tag/(v[^/]+)$`).exec(url);
  if (tag) return { to: tag[1] ?? "" };
  const tree = new RegExp(`^${REPOSITORY_URL}/tree/([0-9a-f]{40})$`).exec(url);
  if (tree) return { to: tree[1] ?? "" };
  return undefined;
}

/**
 * Names the revision a release ends at: its tag, or a pinned SHA when the
 * release never got one.
 * @param version The released version.
 * @param endpoint The `to` revision of its link ref.
 * @returns An error message, or undefined when the endpoint is valid.
 */
function endpointProblem(version: string, endpoint: string): string | undefined {
  if (endpoint === `v${version}` || PINNED_SHA.test(endpoint)) return undefined;
  return `[${version}] ends at ${endpoint}, not v${version} or a pinned SHA`;
}

/**
 * Checks that every released version has a ref that chains from the previous
 * release's endpoint.
 * @param versions The released versions, newest first.
 * @param refs The link refs by label.
 * @returns The problems found.
 */
function chainProblems(versions: readonly string[], refs: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const [index, version] of versions.entries()) {
    const url = refs.get(version);
    const range = url === undefined ? undefined : parseRef(url);
    if (range === undefined) {
      problems.push(`CHANGELOG.md has no valid link ref for [${version}]`);
      continue;
    }
    const endpoint = endpointProblem(version, range.to);
    if (endpoint !== undefined) problems.push(endpoint);
    const previous = versions[index + 1];
    const previousRange = previous === undefined ? undefined : parseRef(refs.get(previous) ?? "");
    if (previous === undefined && range.from !== undefined) {
      problems.push(`[${version}] is the first release and must not compare from ${range.from}`);
    }
    if (previous !== undefined && range.from !== previousRange?.to) {
      problems.push(`[${version}] compares from ${String(range.from)}, not [${previous}]'s end`);
    }
  }
  return problems;
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
 * Tells whether a commit exists in this checkout.
 * @param sha The full commit SHA.
 * @returns True when git can read the commit.
 */
function commitExists(sha: string): boolean {
  return spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: REPO_ROOT }).status === 0;
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
 * Finds the tag endpoints whose tag is absent. The newest release is exempt
 * while it is in flight: the release branch adds its heading and ref before
 * the tag is created on `main`, and the manifest already names it.
 * @param versions The releases whose ref ends at their tag, newest first.
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
  const versions = releasedVersions();
  const refs = linkRefs();

  test("every release has a ref that chains from the previous release", () => {
    expect(chainProblems(versions, refs)).toEqual([]);
  });

  test("[Unreleased] compares from the newest release", () => {
    const newest = parseRef(refs.get(versions[0] ?? "") ?? "");
    expect(refs.get("Unreleased")).toBe(`${REPOSITORY_URL}/compare/${newest?.to ?? ""}...HEAD`);
  });

  test("every referenced tag exists and every pinned SHA is an untagged commit, when the checkout has tags", () => {
    const tags = localTags();
    if (tags.length === 0) return;
    const ends = versions.map((version) => ({
      version,
      to: parseRef(refs.get(version) ?? "")?.to ?? "",
    }));
    const tagged = ends.filter(({ to }) => !PINNED_SHA.test(to)).map(({ version }) => version);
    expect(missingTags(tagged, tags, pluginVersion())).toEqual([]);
    for (const { version, to } of ends.filter(({ to: end }) => PINNED_SHA.test(end))) {
      expect(commitExists(to), `[${version}] pins ${to}, which is not a commit`).toBe(true);
      expect(tags, `[${version}] has a tag, so its ref must use it`).not.toContain(`v${version}`);
    }
  });

  test("a ref chain accepts a tag or a pinned SHA and rejects a gap", () => {
    const sha = "a".repeat(40);
    const chained = new Map([
      ["1.2.0", `${REPOSITORY_URL}/compare/${sha}...v1.2.0`],
      ["1.1.0", `${REPOSITORY_URL}/compare/v1.0.0...${sha}`],
      ["1.0.0", `${REPOSITORY_URL}/releases/tag/v1.0.0`],
    ]);
    expect(chainProblems(["1.2.0", "1.1.0", "1.0.0"], chained)).toEqual([]);
    expect(chainProblems(["1.0.0"], new Map([["1.0.0", `${REPOSITORY_URL}/tree/${sha}`]]))).toEqual(
      [],
    );
    expect(
      chainProblems(["1.1.0", "1.0.0"], new Map([["1.1.0", chained.get("1.2.0") ?? ""]])),
    ).toEqual([
      "[1.1.0] ends at v1.2.0, not v1.1.0 or a pinned SHA",
      "[1.1.0] compares from aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, not [1.0.0]'s end",
      "CHANGELOG.md has no valid link ref for [1.0.0]",
    ]);
  });

  test("a release in flight is exempt until its tag exists", () => {
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.0.0"], "1.1.0")).toEqual([]);
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.0.0"], "1.0.0")).toEqual(["v1.1.0"]);
    expect(missingTags(["1.1.0", "1.0.0"], ["v1.1.0"], "1.1.0")).toEqual(["v1.0.0"]);
  });
});

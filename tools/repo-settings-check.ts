import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Repository settings the standard requires, in the shape `gh api
 * repos/{owner}/{repo}` returns them.
 */
export const EXPECTED_REPO_SETTINGS = {
  allow_squash_merge: true,
  allow_merge_commit: true,
  allow_rebase_merge: false,
  delete_branch_on_merge: true,
  allow_auto_merge: true,
  allow_update_branch: true,
  squash_merge_commit_title: "PR_TITLE",
  squash_merge_commit_message: "PR_BODY",
  has_wiki: false,
  has_projects: false,
  security_and_analysis: {
    secret_scanning: { status: "enabled" },
    secret_scanning_push_protection: { status: "enabled" },
  },
} as const;

const REPO_ENDPOINT = "repos/{owner}/{repo}";
const RULESETS_ENDPOINT = `${REPO_ENDPOINT}/rulesets`;

/** Keys that identify an element of a list of objects, in order of preference. */
const IDENTITY_KEYS = ["type", "context", "name"] as const;

type JsonRecord = Record<string, unknown>;

/** Whether `value` is a plain JSON object. */
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The identity of a list element: its `type`, `context` or `name`. */
function identityOf(element: unknown): string | undefined {
  if (!isRecord(element)) {
    return undefined;
  }
  for (const key of IDENTITY_KEYS) {
    const value = element[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

/** `list` keyed by element identity, or `undefined` when an element has none. */
function indexByIdentity(list: unknown[]): Map<string, unknown> | undefined {
  const byIdentity = new Map<string, unknown>();
  for (const element of list) {
    const identity = identityOf(element);
    if (identity === undefined) {
      return undefined;
    }
    byIdentity.set(identity, element);
  }
  return byIdentity;
}

/** `list` as JSON with its elements sorted, so order never counts as drift. */
function canonicalList(list: unknown[]): string {
  return `[${list
    .map((element) => JSON.stringify(element))
    .toSorted()
    .join(",")}]`;
}

/** Joins a parent path and a child key. */
function childPath(parent: string, key: string): string {
  return parent === "" ? key : `${parent}.${key}`;
}

/** Drift between two lists whose elements are matched by identity. */
function diffIdentifiedLists(
  location: string,
  live: Map<string, unknown>,
  expected: Map<string, unknown>,
): string[] {
  const drift: string[] = [];
  for (const [identity, expectedElement] of expected) {
    const elementPath = `${location}[${identity}]`;
    if (live.has(identity)) {
      drift.push(...diffAt(elementPath, live.get(identity), expectedElement));
    } else {
      drift.push(`${elementPath}: missing`);
    }
  }
  for (const identity of live.keys()) {
    if (!expected.has(identity)) {
      drift.push(`${location}[${identity}]: unexpected`);
    }
  }
  return drift;
}

/** Drift between a live list and an expected one. */
function diffLists(location: string, live: unknown[], expected: unknown[]): string[] {
  const expectedByIdentity = indexByIdentity(expected);
  const liveByIdentity = indexByIdentity(live);
  if (expected.length > 0 && expectedByIdentity !== undefined && liveByIdentity !== undefined) {
    return diffIdentifiedLists(location, liveByIdentity, expectedByIdentity);
  }
  const liveList = canonicalList(live);
  const expectedList = canonicalList(expected);
  return liveList === expectedList
    ? []
    : [`${location}: expected ${expectedList}, live ${liveList}`];
}

/** Drift between `live` and `expected` at `location`. */
function diffAt(location: string, live: unknown, expected: unknown): string[] {
  if (live === undefined) {
    return [`${location}: missing`];
  }
  if (isRecord(expected) && isRecord(live)) {
    return Object.entries(expected).flatMap(([key, expectedValue]) =>
      diffAt(childPath(location, key), live[key], expectedValue),
    );
  }
  if (Array.isArray(expected) && Array.isArray(live)) {
    return diffLists(location, live, expected);
  }
  return live === expected
    ? []
    : [`${location}: expected ${JSON.stringify(expected)}, live ${JSON.stringify(live)}`];
}

/**
 * Compares live settings with the expected ones and returns one line per
 * differing key. Every expected key must be present in `live` with the same
 * value; keys only `live` has are ignored. Lists of objects are matched by
 * their `type`, `context` or `name`, so order is not drift, but an element
 * missing from or added to the live list is.
 */
export function diffSettings(live: unknown, expected: unknown): string[] {
  return diffAt("", live, expected);
}

/** The rulesets stored as code in `rulesetsDir`, keyed by file name. */
function readExpectedRulesets(rulesetsDir: string): JsonRecord {
  const rulesets: JsonRecord = {};
  for (const file of readdirSync(rulesetsDir).toSorted()) {
    if (file.endsWith(".json")) {
      const parsed: unknown = JSON.parse(readFileSync(path.join(rulesetsDir, file), "utf8"));
      rulesets[path.basename(file, ".json")] = parsed;
    }
  }
  return rulesets;
}

/** The id of each live ruleset, keyed by its name. */
function readLiveRulesetIds(readApi: (endpoint: string) => unknown): Map<string, number> {
  const listing = readApi(RULESETS_ENDPOINT);
  if (!Array.isArray(listing)) {
    throw new TypeError(`${RULESETS_ENDPOINT} did not return a list`);
  }
  const ids = new Map<string, number>();
  for (const entry of listing) {
    if (isRecord(entry) && typeof entry["name"] === "string" && typeof entry["id"] === "number") {
      ids.set(entry["name"], entry["id"]);
    }
  }
  return ids;
}

/**
 * Reads the live repository settings and rulesets through `readApi` and
 * returns one line per key that differs from `EXPECTED_REPO_SETTINGS` or from
 * the ruleset files in `rulesetsDir`. It only reads; applying is the
 * maintainer's job.
 */
export function checkRepoSettings(
  readApi: (endpoint: string) => unknown,
  rulesetsDir: string,
): string[] {
  const expectedRulesets = readExpectedRulesets(rulesetsDir);
  const liveRulesetIds = readLiveRulesetIds(readApi);
  const liveRulesets: JsonRecord = {};
  for (const name of Object.keys(expectedRulesets)) {
    const id = liveRulesetIds.get(name);
    if (id !== undefined) {
      liveRulesets[name] = readApi(`${RULESETS_ENDPOINT}/${id}`);
    }
  }
  const drift = diffSettings(
    { settings: readApi(REPO_ENDPOINT), rulesets: liveRulesets },
    { settings: EXPECTED_REPO_SETTINGS, rulesets: expectedRulesets },
  );
  for (const name of liveRulesetIds.keys()) {
    if (!(name in expectedRulesets)) {
      drift.push(`rulesets.${name}: unexpected`);
    }
  }
  return drift;
}

/** Runs `gh api <endpoint>` and parses its JSON output. */
function readGitHubApi(endpoint: string): unknown {
  const result = Bun.spawnSync(["gh", "api", endpoint], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`gh api ${endpoint} failed: ${result.stderr.toString().trim()}`);
  }
  const parsed: unknown = JSON.parse(result.stdout.toString());
  return parsed;
}

if (import.meta.main) {
  const rulesetsDir = path.join(import.meta.dir, "..", ".github", "rulesets");
  const drift = checkRepoSettings(readGitHubApi, rulesetsDir);
  if (drift.length > 0) {
    process.stderr.write(`${drift.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("Repository settings match the rulesets and the settings list.\n");
}

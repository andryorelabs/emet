import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

type FeatureStatus = "enabled" | "disabled";

/**
 * The repository settings kept as code in `.github/repo-settings.json`. Each
 * key is a setting a maintainer applies by hand; `repo-settings:check` only
 * reads the live value and reports drift.
 */
export interface RepoSettings {
  description: string;
  homepage: string;
  default_branch: string;
  topics: string[];
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
  squash_merge_commit_title: string;
  squash_merge_commit_message: string;
  merge_commit_title: string;
  merge_commit_message: string;
  delete_branch_on_merge: boolean;
  allow_auto_merge: boolean;
  allow_update_branch: boolean;
  has_wiki: boolean;
  has_projects: boolean;
  has_discussions: boolean;
  secret_scanning: FeatureStatus;
  secret_scanning_push_protection: FeatureStatus;
  dependabot_alerts: boolean;
  dependabot_security_updates: FeatureStatus;
  private_vulnerability_reporting: boolean;
  default_workflow_permissions: "read" | "write";
  can_approve_pull_request_reviews: boolean;
  fork_pr_contributor_approval: string;
  code_scanning_default_setup: "configured" | "not-configured";
}

/** The outcome of one `gh api` call. */
export interface GhResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/** Runs `gh api <endpoint>` as a read; injected so tests never touch the network. */
type GhApi = (endpoint: string) => GhResult;

/** The type a settings key must hold: a primitive, a string list, or one of fixed strings. */
type SettingKind = "string" | "boolean" | "string[]" | readonly string[];

const FEATURE_STATUSES = ["enabled", "disabled"] as const;

/** The kind of every key of `RepoSettings`, used to validate the settings file. */
const SETTING_KINDS: Record<keyof RepoSettings, SettingKind> = {
  description: "string",
  homepage: "string",
  default_branch: "string",
  topics: "string[]",
  allow_squash_merge: "boolean",
  allow_merge_commit: "boolean",
  allow_rebase_merge: "boolean",
  squash_merge_commit_title: "string",
  squash_merge_commit_message: "string",
  merge_commit_title: "string",
  merge_commit_message: "string",
  delete_branch_on_merge: "boolean",
  allow_auto_merge: "boolean",
  allow_update_branch: "boolean",
  has_wiki: "boolean",
  has_projects: "boolean",
  has_discussions: "boolean",
  secret_scanning: FEATURE_STATUSES,
  secret_scanning_push_protection: FEATURE_STATUSES,
  dependabot_alerts: "boolean",
  dependabot_security_updates: FEATURE_STATUSES,
  private_vulnerability_reporting: "boolean",
  default_workflow_permissions: ["read", "write"],
  can_approve_pull_request_reviews: "boolean",
  fork_pr_contributor_approval: "string",
  code_scanning_default_setup: ["configured", "not-configured"],
};

const DEFAULT_SETTINGS_FILE = path.join(import.meta.dir, "..", ".github", "repo-settings.json");
const REPO_ENDPOINT = "repos/{owner}/{repo}";
const RULESETS_ENDPOINT = `${REPO_ENDPOINT}/rulesets`;

/** Keys that identify an element of a list of objects, in order of preference. */
const IDENTITY_KEYS = ["type", "context", "name"] as const;

type JsonRecord = Record<string, unknown>;

/** Whether `value` is a plain JSON object. */
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether `key` names a setting of `RepoSettings`. */
function isSettingKey(key: string): key is keyof RepoSettings {
  return Object.hasOwn(SETTING_KINDS, key);
}

/** Why `value` does not fit `kind`, or `undefined` when it does. */
function kindMismatch(value: unknown, kind: SettingKind): string | undefined {
  if (typeof kind !== "string") {
    return typeof value === "string" && kind.includes(value)
      ? undefined
      : `expected one of ${kind.map((option) => JSON.stringify(option)).join(", ")}`;
  }
  if (kind === "string[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "string")
      ? undefined
      : "expected a list of strings";
  }
  return typeof value === kind ? undefined : `expected ${kind}`;
}

/** Every problem with `parsed` as a settings file, one line per key. */
function settingsProblems(parsed: JsonRecord): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(parsed)) {
    if (!isSettingKey(key)) {
      problems.push(`${key}: unknown key`);
    }
  }
  for (const [key, kind] of Object.entries(SETTING_KINDS)) {
    if (!(key in parsed)) {
      problems.push(`${key}: missing`);
      continue;
    }
    const mismatch = kindMismatch(parsed[key], kind);
    if (mismatch !== undefined) {
      problems.push(`${key}: ${mismatch}`);
    }
  }
  return problems;
}

/** Whether `parsed` holds exactly the keys of `RepoSettings`, each of the right kind. */
function isRepoSettings(parsed: JsonRecord): parsed is JsonRecord & RepoSettings {
  return settingsProblems(parsed).length === 0;
}

/**
 * Reads and validates the expected repository settings from `file`, which
 * defaults to `.github/repo-settings.json`. Throws naming every unknown,
 * missing or mistyped key.
 */
export function loadExpectedSettings(file: string = DEFAULT_SETTINGS_FILE): RepoSettings {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) {
    throw new TypeError(`${file} is not a JSON object`);
  }
  if (!isRepoSettings(parsed)) {
    throw new TypeError(`${file} is not valid:\n${settingsProblems(parsed).join("\n")}`);
  }
  return parsed;
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
 * Compares live repository settings, as `readLiveSettings` returns them, with
 * the expected ones and returns one line per differing key. Keys only `live`
 * has are ignored, and the order of `topics` is not drift.
 */
export function diffSettings(expected: RepoSettings, live: unknown): readonly string[] {
  return diffAt("", live, expected);
}

/**
 * Compares a live ruleset with its file and returns one line per differing
 * key. Keys only `live` has are ignored. Lists of objects are matched by their
 * `type`, `context` or `name`, so order is not drift, but an element missing
 * from or added to the live list is.
 */
export function diffRuleset(expected: unknown, live: unknown): readonly string[] {
  return diffAt("", live, expected);
}

/** Whether a failed call answered 404, which some endpoints use to mean "off". */
function isNotFound(result: GhResult): boolean {
  return /\b404\b|Not Found/i.test(result.stderr);
}

/** Parses the output of a successful call, failing with the endpoint named. */
function parseResult(endpoint: string, result: GhResult): unknown {
  if (!result.ok) {
    throw new Error(`gh api ${endpoint} failed: ${result.stderr.trim() || "no output"}`);
  }
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    return parsed;
  } catch {
    throw new Error(`gh api ${endpoint} did not return JSON`);
  }
}

/** Calls `endpoint` and returns its JSON object. */
function readObject(callGh: GhApi, endpoint: string): JsonRecord {
  const parsed = parseResult(endpoint, callGh(endpoint));
  if (!isRecord(parsed)) {
    throw new TypeError(`gh api ${endpoint} did not return an object`);
  }
  return parsed;
}

/** `security_and_analysis.<feature>.status` of the repository payload, if present. */
function featureStatus(repository: JsonRecord, feature: string): unknown {
  const analysis = repository.security_and_analysis;
  const entry = isRecord(analysis) ? analysis[feature] : undefined;
  return isRecord(entry) ? entry.status : undefined;
}

/**
 * Whether Dependabot alerts are on. The endpoint answers 204 when they are and
 * 404 when they are not; any other failure is unreadable, not "off".
 */
function readDependabotAlerts(callGh: GhApi): boolean {
  const endpoint = `${REPO_ENDPOINT}/vulnerability-alerts`;
  const result = callGh(endpoint);
  if (result.ok) {
    return true;
  }
  if (isNotFound(result)) {
    return false;
  }
  throw new Error(`gh api ${endpoint} failed: ${result.stderr.trim() || "no output"}`);
}

/** Whether Dependabot security updates are on, read from `automated-security-fixes`. */
function readDependabotSecurityUpdates(callGh: GhApi): FeatureStatus {
  const fixes = readObject(callGh, `${REPO_ENDPOINT}/automated-security-fixes`);
  return fixes.enabled === true ? "enabled" : "disabled";
}

/**
 * The code scanning default setup state. A 404 means code scanning was never
 * configured; any other failure is unreadable, not "not configured".
 */
function readCodeScanningSetup(callGh: GhApi): unknown {
  const endpoint = `${REPO_ENDPOINT}/code-scanning/default-setup`;
  const result = callGh(endpoint);
  if (!result.ok && isNotFound(result)) {
    return "not-configured";
  }
  return readObject(() => result, endpoint).state;
}

/**
 * Reads the live repository settings through `callGh`, under the keys of
 * `RepoSettings`. A value the API does not return stays `undefined`, so
 * `diffSettings` reports it as missing. It only reads.
 */
export function readLiveSettings(callGh: GhApi): Record<keyof RepoSettings, unknown> {
  const repository = readObject(callGh, REPO_ENDPOINT);
  const reporting = readObject(callGh, `${REPO_ENDPOINT}/private-vulnerability-reporting`);
  const workflow = readObject(callGh, `${REPO_ENDPOINT}/actions/permissions/workflow`);
  const approval = readObject(
    callGh,
    `${REPO_ENDPOINT}/actions/permissions/fork-pr-contributor-approval`,
  );
  return {
    description: repository.description,
    homepage: repository.homepage,
    default_branch: repository.default_branch,
    topics: repository.topics,
    allow_squash_merge: repository.allow_squash_merge,
    allow_merge_commit: repository.allow_merge_commit,
    allow_rebase_merge: repository.allow_rebase_merge,
    squash_merge_commit_title: repository.squash_merge_commit_title,
    squash_merge_commit_message: repository.squash_merge_commit_message,
    merge_commit_title: repository.merge_commit_title,
    merge_commit_message: repository.merge_commit_message,
    delete_branch_on_merge: repository.delete_branch_on_merge,
    allow_auto_merge: repository.allow_auto_merge,
    allow_update_branch: repository.allow_update_branch,
    has_wiki: repository.has_wiki,
    has_projects: repository.has_projects,
    has_discussions: repository.has_discussions,
    secret_scanning: featureStatus(repository, "secret_scanning"),
    secret_scanning_push_protection: featureStatus(repository, "secret_scanning_push_protection"),
    dependabot_alerts: readDependabotAlerts(callGh),
    dependabot_security_updates: readDependabotSecurityUpdates(callGh),
    private_vulnerability_reporting: reporting.enabled,
    default_workflow_permissions: workflow.default_workflow_permissions,
    can_approve_pull_request_reviews: workflow.can_approve_pull_request_reviews,
    fork_pr_contributor_approval: approval.approval_policy,
    code_scanning_default_setup: readCodeScanningSetup(callGh),
  };
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
function readLiveRulesetIds(callGh: GhApi): Map<string, number> {
  const listing = parseResult(RULESETS_ENDPOINT, callGh(RULESETS_ENDPOINT));
  if (!Array.isArray(listing)) {
    throw new TypeError(`gh api ${RULESETS_ENDPOINT} did not return a list`);
  }
  const ids = new Map<string, number>();
  for (const entry of listing) {
    if (isRecord(entry) && typeof entry.name === "string" && typeof entry.id === "number") {
      ids.set(entry.name, entry.id);
    }
  }
  return ids;
}

/** Drift between the ruleset files in `rulesetsDir` and the live rulesets. */
function checkRulesets(callGh: GhApi, rulesetsDir: string): string[] {
  const expectedRulesets = readExpectedRulesets(rulesetsDir);
  const liveRulesetIds = readLiveRulesetIds(callGh);
  const drift: string[] = [];
  for (const [name, expected] of Object.entries(expectedRulesets)) {
    const id = liveRulesetIds.get(name);
    if (id === undefined) {
      drift.push(`rulesets.${name}: missing`);
      continue;
    }
    const live = readObject(callGh, `${RULESETS_ENDPOINT}/${id}`);
    drift.push(...diffRuleset(expected, live).map((line) => `rulesets.${name}.${line}`));
  }
  for (const name of liveRulesetIds.keys()) {
    if (!(name in expectedRulesets)) {
      drift.push(`rulesets.${name}: unexpected`);
    }
  }
  return drift;
}

/**
 * Reads the live repository settings and rulesets through `callGh` and returns
 * one line per key that differs from `settingsFile` or from the ruleset files
 * in `rulesetsDir`. It only reads; applying is the maintainer's job.
 */
export function checkRepoSettings(
  callGh: GhApi,
  rulesetsDir: string,
  settingsFile: string = DEFAULT_SETTINGS_FILE,
): string[] {
  const expected = loadExpectedSettings(settingsFile);
  const settingsDrift = diffSettings(expected, readLiveSettings(callGh)).map(
    (line) => `settings.${line}`,
  );
  return [...settingsDrift, ...checkRulesets(callGh, rulesetsDir)];
}

/** The `gh` argv that reads `endpoint`. The method is pinned to GET so it never writes. */
export function ghApiArgs(endpoint: string): string[] {
  return ["gh", "api", "--method", "GET", endpoint];
}

/**
 * Runs `gh api` as a GET.
 * @param endpoint - The API endpoint to read.
 * @param command - The argv to run instead of `gh api`; defaults to {@link ghApiArgs}.
 * @returns Whether the call succeeded, with its stdout and stderr.
 */
export function readGitHubApi(
  endpoint: string,
  command: readonly string[] = ghApiArgs(endpoint),
): GhResult {
  const result = Bun.spawnSync([...command], { stdout: "pipe", stderr: "pipe" });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Where `runRepoSettingsCheck` writes its messages. */
interface CheckStreams {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
}

/**
 * Compares the live repository with the settings file and the ruleset files and reports drift.
 * @param callGh - Reads a `gh api` endpoint; defaults to the real GitHub API.
 * @param rulesetsDir - The directory of ruleset files; defaults to `.github/rulesets`.
 * @param streams - Where messages go; defaults to the process streams.
 * @returns 1 when anything drifted, otherwise 0.
 */
export function runRepoSettingsCheck(
  callGh: GhApi = readGitHubApi,
  rulesetsDir: string = path.join(import.meta.dir, "..", ".github", "rulesets"),
  streams: CheckStreams = process,
): number {
  const drift = checkRepoSettings(callGh, rulesetsDir);
  if (drift.length > 0) {
    streams.stderr.write(`${drift.join("\n")}\n`);
    return 1;
  }
  streams.stdout.write("Repository settings match .github/repo-settings.json and the rulesets.\n");
  return 0;
}

if (import.meta.main) process.exit(runRepoSettingsCheck());

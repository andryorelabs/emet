import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GhResult, RepoSettings } from "./repo-settings-check";
import {
  checkRepoSettings,
  diffRuleset,
  diffSettings,
  ghApiArgs,
  loadExpectedSettings,
  readLiveSettings,
} from "./repo-settings-check";

const repoRoot = path.join(import.meta.dir, "..");
const rulesetsDir = path.join(repoRoot, ".github", "rulesets");
const settingsFile = path.join(repoRoot, ".github", "repo-settings.json");
const base = "repos/{owner}/{repo}";

/** Parses `.github/rulesets/<name>.json`. */
function readRulesetFile(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(rulesetsDir, `${name}.json`), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name}.json is not an object`);
  }
  return { ...parsed };
}

/** A successful `gh api` call answering `body`. */
function ok(body: unknown): GhResult {
  return { ok: true, stdout: body === undefined ? "" : JSON.stringify(body), stderr: "" };
}

/** A failed `gh api` call with `stderr`. */
function failed(stderr: string): GhResult {
  return { ok: false, stdout: "", stderr };
}

/** A fake `gh api` whose answers are keyed by endpoint. */
function fakeApi(responses: Record<string, GhResult>): (endpoint: string) => GhResult {
  return (endpoint) => {
    const response = responses[endpoint];
    if (response === undefined) {
      throw new Error(`unexpected endpoint ${endpoint}`);
    }
    return response;
  };
}

/** The `repos/{owner}/{repo}` payload that carries `settings`. */
function repositoryPayload(settings: RepoSettings): Record<string, unknown> {
  return {
    id: 1,
    has_issues: true,
    description: settings.description,
    homepage: settings.homepage,
    default_branch: settings.default_branch,
    topics: settings.topics.toReversed(),
    allow_squash_merge: settings.allow_squash_merge,
    allow_merge_commit: settings.allow_merge_commit,
    allow_rebase_merge: settings.allow_rebase_merge,
    squash_merge_commit_title: settings.squash_merge_commit_title,
    squash_merge_commit_message: settings.squash_merge_commit_message,
    merge_commit_title: settings.merge_commit_title,
    merge_commit_message: settings.merge_commit_message,
    delete_branch_on_merge: settings.delete_branch_on_merge,
    allow_auto_merge: settings.allow_auto_merge,
    allow_update_branch: settings.allow_update_branch,
    has_wiki: settings.has_wiki,
    has_projects: settings.has_projects,
    has_discussions: settings.has_discussions,
    security_and_analysis: {
      secret_scanning: { status: settings.secret_scanning },
      secret_scanning_push_protection: { status: settings.secret_scanning_push_protection },
      secret_scanning_validity_checks: { status: "disabled" },
    },
  };
}

/** Live responses that match the settings file and the rulesets exactly. */
function matchingResponses(): Record<string, GhResult> {
  const settings = loadExpectedSettings();
  return {
    [base]: ok(repositoryPayload(settings)),
    [`${base}/private-vulnerability-reporting`]: ok({ enabled: true }),
    [`${base}/vulnerability-alerts`]: ok(undefined),
    [`${base}/automated-security-fixes`]: ok({ enabled: true, paused: false }),
    [`${base}/actions/permissions/workflow`]: ok({
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: false,
    }),
    [`${base}/actions/permissions/fork-pr-contributor-approval`]: ok({
      approval_policy: "first_time_contributors",
    }),
    [`${base}/code-scanning/default-setup`]: ok({ state: "not-configured", languages: [] }),
    [`${base}/rulesets`]: ok([
      { id: 11, name: "main" },
      { id: 12, name: "develop" },
      { id: 13, name: "tags" },
    ]),
    [`${base}/rulesets/11`]: ok({ id: 11, source: "x", ...readRulesetFile("main") }),
    [`${base}/rulesets/12`]: ok({ id: 12, source: "x", ...readRulesetFile("develop") }),
    [`${base}/rulesets/13`]: ok({ id: 13, source: "x", ...readRulesetFile("tags") }),
  };
}

/** The short description `docs/brand/copy.md` marks as selected. */
function selectedShortDescription(): string {
  const copy = readFileSync(path.join(repoRoot, "docs", "brand", "copy.md"), "utf8");
  const section = copy.split("### Short description")[1] ?? "";
  const match = /^\d+\. "(.+)" \(selected\)$/m.exec(section);
  if (match?.[1] === undefined) {
    throw new Error("docs/brand/copy.md has no selected short description");
  }
  return match[1];
}

/** Writes `content` to a fresh temporary settings file and returns its path. */
function writeTemporarySettings(content: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "repo-settings-")), "settings.json");
  writeFileSync(file, JSON.stringify(content));
  return file;
}

describe("loadExpectedSettings", () => {
  test("reads .github/repo-settings.json by default", () => {
    const onDisk: unknown = JSON.parse(readFileSync(settingsFile, "utf8"));
    expect(onDisk).toEqual(loadExpectedSettings());
  });

  test("keeps the description in step with the brand copy", () => {
    expect(loadExpectedSettings().description).toBe(selectedShortDescription());
  });

  test("lists the homepage, at least five topics and the default branch", () => {
    const settings = loadExpectedSettings();
    expect(settings.homepage).toStartWith("https://");
    expect(settings.topics.length).toBeGreaterThanOrEqual(5);
    expect(settings.default_branch).toBe("main");
  });

  test("uses the PR title and body for squash and merge commits", () => {
    const settings = loadExpectedSettings();
    expect([
      settings.squash_merge_commit_title,
      settings.squash_merge_commit_message,
      settings.merge_commit_title,
      settings.merge_commit_message,
    ]).toEqual(["PR_TITLE", "PR_BODY", "PR_TITLE", "PR_BODY"]);
  });

  test("turns wiki, projects and discussions off", () => {
    const settings = loadExpectedSettings();
    expect([settings.has_wiki, settings.has_projects, settings.has_discussions]).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("turns on private reporting, both Dependabot settings and secret scanning", () => {
    const settings = loadExpectedSettings();
    expect(settings.private_vulnerability_reporting).toBe(true);
    expect(settings.dependabot_alerts).toBe(true);
    expect(settings.dependabot_security_updates).toBe("enabled");
    expect(settings.secret_scanning).toBe("enabled");
    expect(settings.secret_scanning_push_protection).toBe("enabled");
  });

  test("keeps the token read-only, gates fork PRs and leaves CodeQL to codeql.yml", () => {
    const settings = loadExpectedSettings();
    expect(settings.default_workflow_permissions).toBe("read");
    expect(settings.can_approve_pull_request_reviews).toBe(false);
    expect(settings.fork_pr_contributor_approval).toBe("first_time_contributors");
    expect(settings.code_scanning_default_setup).toBe("not-configured");
  });

  test("rejects a file with an unknown key", () => {
    const file = writeTemporarySettings({ ...loadExpectedSettings(), has_wikis: false });
    expect(() => loadExpectedSettings(file)).toThrow("has_wikis: unknown key");
  });

  test("rejects a file with a missing key or a value of the wrong type", () => {
    const { has_wiki: _hasWiki, ...withoutWiki } = loadExpectedSettings();
    expect(() => loadExpectedSettings(writeTemporarySettings(withoutWiki))).toThrow(
      "has_wiki: missing",
    );
    const wrongType = { ...loadExpectedSettings(), dependabot_alerts: "yes" };
    expect(() => loadExpectedSettings(writeTemporarySettings(wrongType))).toThrow(
      "dependabot_alerts: expected boolean",
    );
  });

  test("rejects a value outside the allowed set", () => {
    const wrongValue = { ...loadExpectedSettings(), default_workflow_permissions: "admin" };
    expect(() => loadExpectedSettings(writeTemporarySettings(wrongValue))).toThrow(
      'default_workflow_permissions: expected one of "read", "write"',
    );
  });
});

describe("diffSettings", () => {
  test("reports nothing when live carries every expected value, plus extras", () => {
    const expected = loadExpectedSettings();
    const live = { ...expected, topics: expected.topics.toReversed(), stargazers_count: 3 };
    expect(diffSettings(expected, live)).toEqual([]);
  });

  test("names each differing key with both values", () => {
    const expected = loadExpectedSettings();
    const live = { ...expected, has_wiki: true, merge_commit_title: "MERGE_MESSAGE" };
    expect(diffSettings(expected, live)).toEqual([
      'merge_commit_title: expected "PR_TITLE", live "MERGE_MESSAGE"',
      "has_wiki: expected false, live true",
    ]);
  });

  test("reports a key the live settings lack as missing", () => {
    const { dependabot_alerts: _alerts, ...live } = loadExpectedSettings();
    expect(diffSettings(loadExpectedSettings(), live)).toEqual(["dependabot_alerts: missing"]);
  });

  test("reports a topic added or removed", () => {
    const expected = loadExpectedSettings();
    const live = { ...expected, topics: [...expected.topics.slice(1), "extra"] };
    expect(diffSettings(expected, live)).toHaveLength(1);
    expect(diffSettings(expected, live)[0]).toStartWith("topics: expected [");
  });
});

describe("diffRuleset", () => {
  test("matches rules by type regardless of order and ignores extra live parameters", () => {
    const live = {
      rules: [
        { type: "pull_request", parameters: { allowed_merge_methods: ["squash"], extra: 1 } },
        { type: "deletion" },
      ],
    };
    const expected = {
      rules: [
        { type: "deletion" },
        { type: "pull_request", parameters: { allowed_merge_methods: ["squash"] } },
      ],
    };
    expect(diffRuleset(expected, live)).toEqual([]);
  });

  test("reports a missing rule, an unexpected rule and a changed parameter", () => {
    const live = {
      rules: [
        { type: "creation" },
        { type: "pull_request", parameters: { allowed_merge_methods: ["squash", "rebase"] } },
      ],
    };
    const expected = {
      rules: [
        { type: "deletion" },
        { type: "pull_request", parameters: { allowed_merge_methods: ["squash"] } },
      ],
    };
    expect(diffRuleset(expected, live)).toEqual([
      "rules[deletion]: missing",
      'rules[pull_request].parameters.allowed_merge_methods: expected ["squash"], live ["rebase","squash"]',
      "rules[creation]: unexpected",
    ]);
  });

  test("matches required status checks by context", () => {
    const live = { required_status_checks: [{ context: "CI passed", integration_id: 15368 }] };
    const expected = {
      required_status_checks: [{ context: "CI passed" }, { context: "Validate PR title" }],
    };
    expect(diffRuleset(expected, live)).toEqual([
      "required_status_checks[Validate PR title]: missing",
    ]);
  });

  test("reports a bypass actor added to a ruleset that expects none", () => {
    const live = { bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole" }] };
    expect(diffRuleset({ bypass_actors: [] }, live)).toEqual([
      'bypass_actors: expected [], live [{"actor_id":5,"actor_type":"RepositoryRole"}]',
    ]);
  });
});

describe("readLiveSettings", () => {
  test("maps the repository, security and Actions endpoints onto the settings keys", () => {
    expect(readLiveSettings(fakeApi(matchingResponses()))).toEqual({
      ...loadExpectedSettings(),
      topics: loadExpectedSettings().topics.toReversed(),
    });
  });

  test("reads Dependabot alerts as off when the endpoint answers 404", () => {
    const responses = matchingResponses();
    responses[`${base}/vulnerability-alerts`] = failed("gh: Not Found (HTTP 404)");
    expect(readLiveSettings(fakeApi(responses)).dependabot_alerts).toBe(false);
  });

  test("reads Dependabot security updates from automated-security-fixes", () => {
    const responses = matchingResponses();
    responses[`${base}/automated-security-fixes`] = ok({ enabled: false, paused: false });
    expect(readLiveSettings(fakeApi(responses)).dependabot_security_updates).toBe("disabled");
  });

  test("reads code scanning as not configured when the endpoint answers 404", () => {
    const responses = matchingResponses();
    responses[`${base}/code-scanning/default-setup`] = failed("gh: Not Found (HTTP 404)");
    expect(readLiveSettings(fakeApi(responses)).code_scanning_default_setup).toBe("not-configured");
  });

  test("fails naming the endpoint when a call fails for another reason", () => {
    const responses = matchingResponses();
    responses[`${base}/vulnerability-alerts`] = failed("gh: Forbidden (HTTP 403)");
    expect(() => readLiveSettings(fakeApi(responses))).toThrow(
      `gh api ${base}/vulnerability-alerts failed: gh: Forbidden (HTTP 403)`,
    );
  });
});

describe("checkRepoSettings", () => {
  test("reports no drift when live settings match the files", () => {
    expect(checkRepoSettings(fakeApi(matchingResponses()), rulesetsDir)).toEqual([]);
  });

  test("reports drift in a repo setting and in a ruleset", () => {
    const responses = matchingResponses();
    responses[base] = ok({ ...repositoryPayload(loadExpectedSettings()), has_wiki: true });
    responses[`${base}/automated-security-fixes`] = ok({ enabled: false, paused: false });
    responses[`${base}/rulesets/13`] = ok({ ...readRulesetFile("tags"), enforcement: "disabled" });
    expect(checkRepoSettings(fakeApi(responses), rulesetsDir)).toEqual([
      "settings.has_wiki: expected false, live true",
      'settings.dependabot_security_updates: expected "enabled", live "disabled"',
      'rulesets.tags.enforcement: expected "active", live "disabled"',
    ]);
  });

  test("reports a ruleset file with no live ruleset and a live ruleset with no file", () => {
    const responses = matchingResponses();
    responses[`${base}/rulesets`] = ok([
      { id: 11, name: "main" },
      { id: 12, name: "develop" },
      { id: 99, name: "legacy" },
    ]);
    expect(checkRepoSettings(fakeApi(responses), rulesetsDir)).toEqual([
      "rulesets.tags: missing",
      "rulesets.legacy: unexpected",
    ]);
  });

  test("reads the settings file it is given", () => {
    const file = writeTemporarySettings({ ...loadExpectedSettings(), has_discussions: true });
    expect(checkRepoSettings(fakeApi(matchingResponses()), rulesetsDir, file)).toEqual([
      "settings.has_discussions: expected true, live false",
    ]);
  });
});

describe("ghApiArgs", () => {
  test("always reads with an explicit GET, so the check never writes to GitHub", () => {
    expect(ghApiArgs(`${base}/rulesets`)).toEqual([
      "gh",
      "api",
      "--method",
      "GET",
      `${base}/rulesets`,
    ]);
  });
});

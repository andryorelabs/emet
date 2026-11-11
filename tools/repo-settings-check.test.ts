import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { checkRepoSettings, diffSettings, EXPECTED_REPO_SETTINGS } from "./repo-settings-check";

const rulesetsDir = path.join(import.meta.dir, "..", ".github", "rulesets");

/** Parses `.github/rulesets/<name>.json`. */
function readRulesetFile(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(rulesetsDir, `${name}.json`), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name}.json is not an object`);
  }
  return { ...parsed };
}

/** A fake `gh api` whose answers are keyed by endpoint. */
function fakeApi(responses: Record<string, unknown>): (endpoint: string) => unknown {
  return (endpoint) => {
    if (!(endpoint in responses)) {
      throw new Error(`unexpected endpoint ${endpoint}`);
    }
    return responses[endpoint];
  };
}

/** Live responses that match the files and the settings list exactly. */
function matchingResponses(): Record<string, unknown> {
  return {
    "repos/{owner}/{repo}": { ...EXPECTED_REPO_SETTINGS, id: 1, has_issues: true },
    "repos/{owner}/{repo}/rulesets": [
      { id: 11, name: "main" },
      { id: 12, name: "develop" },
      { id: 13, name: "tags" },
    ],
    "repos/{owner}/{repo}/rulesets/11": { id: 11, source: "x", ...readRulesetFile("main") },
    "repos/{owner}/{repo}/rulesets/12": { id: 12, source: "x", ...readRulesetFile("develop") },
    "repos/{owner}/{repo}/rulesets/13": { id: 13, source: "x", ...readRulesetFile("tags") },
  };
}

describe("diffSettings", () => {
  test("reports nothing when live carries every expected value, plus extras", () => {
    const live = { allow_rebase_merge: false, has_wiki: false, stargazers_count: 3 };
    expect(diffSettings(live, { allow_rebase_merge: false, has_wiki: false })).toEqual([]);
  });

  test("names each differing key with both values", () => {
    const live = { allow_rebase_merge: true, squash_merge_commit_title: "COMMIT_OR_PR_TITLE" };
    const expected = { allow_rebase_merge: false, squash_merge_commit_title: "PR_TITLE" };
    expect(diffSettings(live, expected)).toEqual([
      "allow_rebase_merge: expected false, live true",
      'squash_merge_commit_title: expected "PR_TITLE", live "COMMIT_OR_PR_TITLE"',
    ]);
  });

  test("reports a key the live settings lack as missing", () => {
    expect(diffSettings({}, { security_and_analysis: { secret_scanning: "enabled" } })).toEqual([
      "security_and_analysis: missing",
    ]);
  });

  test("walks nested objects with a dotted path", () => {
    const live = { security_and_analysis: { secret_scanning: { status: "disabled" } } };
    const expected = { security_and_analysis: { secret_scanning: { status: "enabled" } } };
    expect(diffSettings(live, expected)).toEqual([
      'security_and_analysis.secret_scanning.status: expected "enabled", live "disabled"',
    ]);
  });

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
    expect(diffSettings(live, expected)).toEqual([]);
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
    expect(diffSettings(live, expected)).toEqual([
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
    expect(diffSettings(live, expected)).toEqual([
      "required_status_checks[Validate PR title]: missing",
    ]);
  });

  test("reports a bypass actor added to a ruleset that expects none", () => {
    const live = { bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole" }] };
    expect(diffSettings(live, { bypass_actors: [] })).toEqual([
      'bypass_actors: expected [], live [{"actor_id":5,"actor_type":"RepositoryRole"}]',
    ]);
  });
});

describe("EXPECTED_REPO_SETTINGS", () => {
  test("lists the standard's merge, feature and security settings", () => {
    expect(EXPECTED_REPO_SETTINGS).toEqual({
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
    });
  });
});

describe("checkRepoSettings", () => {
  test("reports no drift when live settings match the files and the list", () => {
    expect(checkRepoSettings(fakeApi(matchingResponses()), rulesetsDir)).toEqual([]);
  });

  test("reports drift in a repo setting and in a ruleset", () => {
    const responses = matchingResponses();
    responses["repos/{owner}/{repo}"] = { ...EXPECTED_REPO_SETTINGS, has_wiki: true };
    responses["repos/{owner}/{repo}/rulesets/13"] = {
      ...readRulesetFile("tags"),
      enforcement: "disabled",
    };
    expect(checkRepoSettings(fakeApi(responses), rulesetsDir)).toEqual([
      "settings.has_wiki: expected false, live true",
      'rulesets.tags.enforcement: expected "active", live "disabled"',
    ]);
  });

  test("reports a ruleset file with no live ruleset and a live ruleset with no file", () => {
    const responses = matchingResponses();
    responses["repos/{owner}/{repo}/rulesets"] = [
      { id: 11, name: "main" },
      { id: 12, name: "develop" },
      { id: 99, name: "legacy" },
    ];
    expect(checkRepoSettings(fakeApi(responses), rulesetsDir)).toEqual([
      "rulesets.tags: missing",
      "rulesets.legacy: unexpected",
    ]);
  });
});

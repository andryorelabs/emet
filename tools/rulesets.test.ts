import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { loadExpectedSettings } from "./repo-settings-check";

const repoRoot = path.join(import.meta.dir, "..");
const rulesetsDir = path.join(repoRoot, ".github", "rulesets");
const workflowsDir = path.join(repoRoot, ".github", "workflows");

interface Rule {
  type: string;
  parameters?: {
    allowed_merge_methods?: string[];
    required_review_thread_resolution?: boolean;
    strict_required_status_checks_policy?: boolean;
    required_status_checks?: { context: string }[];
  };
}

interface Ruleset {
  name: string;
  target: string;
  enforcement: string;
  conditions: { ref_name: { include: string[] } };
  rules: Rule[];
  bypass_actors: unknown[];
}

/** Whether `value` is a parsed ruleset with a `rules` list. */
function isRuleset(value: unknown): value is Ruleset {
  return (
    typeof value === "object" &&
    value !== null &&
    "rules" in value &&
    Array.isArray(value.rules) &&
    "conditions" in value &&
    "bypass_actors" in value &&
    Array.isArray(value.bypass_actors)
  );
}

/** Parses `.github/rulesets/<name>.json`, failing when it is not a ruleset. */
function readRuleset(name: string): Ruleset {
  const parsed: unknown = JSON.parse(readFileSync(path.join(rulesetsDir, `${name}.json`), "utf8"));
  if (!isRuleset(parsed)) {
    throw new Error(`${name}.json is not a ruleset`);
  }
  return parsed;
}

/** Every job `name:` declared in `.github/workflows`. */
function readJobNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(workflowsDir).filter((entry) => entry.endsWith(".yml"))) {
    const content = readFileSync(path.join(workflowsDir, file), "utf8");
    for (const match of content.matchAll(/^ {4}name: (.+)$/gm)) {
      names.add((match[1] ?? "").trim().replace(/^["']|["']$/g, ""));
    }
  }
  return names;
}

/** The rule of `type` in `ruleset`, if present. */
function findRule(ruleset: Ruleset, type: string): Rule | undefined {
  return ruleset.rules.find((rule) => rule.type === type);
}

/** The merge methods the `pull_request` rule of `ruleset` allows. */
function mergeMethods(ruleset: Ruleset): string[] {
  return findRule(ruleset, "pull_request")?.parameters?.allowed_merge_methods ?? [];
}

/** Required status check contexts of `ruleset`. */
function requiredContexts(ruleset: Ruleset): string[] {
  const rule = findRule(ruleset, "required_status_checks");
  return (rule?.parameters?.required_status_checks ?? []).map((check) => check.context);
}

describe("rulesets", () => {
  test("every required check context matches a real job name", () => {
    const jobNames = readJobNames();
    for (const name of ["main", "develop"]) {
      const contexts = requiredContexts(readRuleset(name));
      expect(contexts.length).toBeGreaterThan(0);
      const unknown = contexts.filter((context) => !jobNames.has(context));
      expect(unknown).toEqual([]);
    }
  });

  test("main allows merge commits only, with signed commits, resolved threads and no deletion or force-push", () => {
    const ruleset = readRuleset("main");
    expect(ruleset.target).toBe("branch");
    expect(ruleset.conditions.ref_name.include).toEqual(["refs/heads/main"]);
    const pullRequest = findRule(ruleset, "pull_request")?.parameters;
    expect(pullRequest?.allowed_merge_methods).toEqual(["merge"]);
    expect(pullRequest?.required_review_thread_resolution).toBe(true);
    for (const type of ["required_signatures", "deletion", "non_fast_forward"]) {
      expect(findRule(ruleset, type)).toBeDefined();
    }
  });

  test("develop allows squash only with signed linear history, resolved threads and up-to-date branches", () => {
    const ruleset = readRuleset("develop");
    expect(ruleset.conditions.ref_name.include).toEqual(["refs/heads/develop"]);
    const pullRequest = findRule(ruleset, "pull_request")?.parameters;
    expect(pullRequest?.allowed_merge_methods).toEqual(["squash"]);
    expect(pullRequest?.required_review_thread_resolution).toBe(true);
    for (const type of [
      "required_linear_history",
      "required_signatures",
      "deletion",
      "non_fast_forward",
    ]) {
      expect(findRule(ruleset, type)).toBeDefined();
    }
    expect(
      findRule(ruleset, "required_status_checks")?.parameters?.strict_required_status_checks_policy,
    ).toBe(true);
  });

  test("main and develop require the CI gate, the PR title check and the link check", () => {
    for (const name of ["main", "develop"]) {
      expect(requiredContexts(readRuleset(name)).toSorted()).toEqual([
        "CI passed",
        "Check markdown links",
        "Validate PR title",
      ]);
    }
  });

  test("a required check no workflow job is named would be caught", () => {
    expect(readJobNames().has("No such job")).toBe(false);
  });

  test("tags protects v* from update, deletion and force push", () => {
    const ruleset = readRuleset("tags");
    expect(ruleset.target).toBe("tag");
    expect(ruleset.conditions.ref_name.include).toEqual(["refs/tags/v*"]);
    for (const type of ["update", "deletion", "non_fast_forward"]) {
      expect(findRule(ruleset, type)).toBeDefined();
    }
  });

  test("every ruleset is active and has no bypass actors", () => {
    for (const name of ["main", "develop", "tags"]) {
      expect(readRuleset(name).enforcement).toBe("active");
      expect(readRuleset(name).bypass_actors).toEqual([]);
    }
  });
});

describe("promotion invariants", () => {
  const contributing = readFileSync(path.join(repoRoot, "CONTRIBUTING.md"), "utf8").replaceAll(
    /\s+/g,
    " ",
  );

  test("the merge buttons repo-settings.json enables are exactly the methods the rulesets allow", () => {
    const settings = loadExpectedSettings();
    const allowed = new Set([
      ...mergeMethods(readRuleset("develop")),
      ...mergeMethods(readRuleset("main")),
    ]);
    expect(settings.allow_squash_merge).toBe(allowed.has("squash"));
    expect(settings.allow_merge_commit).toBe(allowed.has("merge"));
    expect(settings.allow_rebase_merge).toBe(allowed.has("rebase"));
  });

  test("squash and merge commits both take the PR title and body", () => {
    const settings = loadExpectedSettings();
    expect([
      settings.squash_merge_commit_title,
      settings.squash_merge_commit_message,
      settings.merge_commit_title,
      settings.merge_commit_message,
    ]).toEqual(["PR_TITLE", "PR_BODY", "PR_TITLE", "PR_BODY"]);
  });

  test("main protects the default branch", () => {
    expect(readRuleset("main").conditions.ref_name.include).toEqual([
      `refs/heads/${loadExpectedSettings().default_branch}`,
    ]);
  });

  test("a release PR into main faces every check a PR into develop faced", () => {
    const mainChecks = new Set(requiredContexts(readRuleset("main")));
    expect(
      requiredContexts(readRuleset("develop")).filter((check) => !mainChecks.has(check)),
    ).toEqual([]);
  });

  test("CONTRIBUTING names the merge method of each branch", () => {
    expect(mergeMethods(readRuleset("develop"))).toEqual(["squash"]);
    expect(contributing).toContain("`develop` are merged via **squash merge only**");
    expect(mergeMethods(readRuleset("main"))).toEqual(["merge"]);
    expect(contributing).toContain("merged with a **merge commit** only");
  });

  test("CONTRIBUTING names every ruleset file and the settings file", () => {
    const rulesetFiles = readdirSync(rulesetsDir).filter((file) => file.endsWith(".json"));
    expect(rulesetFiles.length).toBeGreaterThan(0);
    for (const file of rulesetFiles) {
      expect(contributing).toContain(`\`${file}\``);
    }
    expect(contributing).toContain("`.github/repo-settings.json`");
    expect(contributing).toContain("`bun run repo-settings:check`");
  });

  test("CONTRIBUTING names every required check", () => {
    for (const name of ["main", "develop"]) {
      for (const context of requiredContexts(readRuleset(name))) {
        expect(contributing).toContain(`\`${context}\``);
      }
    }
  });

  test("CONTRIBUTING asks for resolved threads, as both rulesets require", () => {
    for (const name of ["main", "develop"]) {
      expect(
        findRule(readRuleset(name), "pull_request")?.parameters?.required_review_thread_resolution,
      ).toBe(true);
    }
    expect(contributing).toContain("resolve threads");
  });
});

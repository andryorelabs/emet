import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");
const rulesetsDir = path.join(repoRoot, ".github", "rulesets");
const workflowsDir = path.join(repoRoot, ".github", "workflows");

interface Rule {
  type: string;
  parameters?: {
    allowed_merge_methods?: string[];
    required_review_thread_resolution?: boolean;
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

  test("main allows merge commits only, with signed commits and no deletion or force-push", () => {
    const ruleset = readRuleset("main");
    expect(ruleset.target).toBe("branch");
    expect(ruleset.conditions.ref_name.include).toEqual(["refs/heads/main"]);
    expect(findRule(ruleset, "pull_request")?.parameters?.allowed_merge_methods).toEqual(["merge"]);
    for (const type of ["required_signatures", "deletion", "non_fast_forward"]) {
      expect(findRule(ruleset, type)).toBeDefined();
    }
  });

  test("develop allows squash only with linear history and resolved threads", () => {
    const ruleset = readRuleset("develop");
    expect(ruleset.conditions.ref_name.include).toEqual(["refs/heads/develop"]);
    const pullRequest = findRule(ruleset, "pull_request")?.parameters;
    expect(pullRequest?.allowed_merge_methods).toEqual(["squash"]);
    expect(pullRequest?.required_review_thread_resolution).toBe(true);
    for (const type of ["required_linear_history", "deletion", "non_fast_forward"]) {
      expect(findRule(ruleset, type)).toBeDefined();
    }
  });

  test("main and develop require the CI gate and the PR title check", () => {
    for (const name of ["main", "develop"]) {
      expect(requiredContexts(readRuleset(name)).toSorted()).toEqual([
        "CI passed",
        "Validate PR title",
      ]);
    }
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

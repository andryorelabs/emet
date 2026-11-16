import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { OxlintConfig } from "oxlint";

import configuration, {
  apiHygieneRules,
  exhaustivenessRules,
  jsdocContentRules,
  lintPolicy,
  noUnsafeAnyRules,
  promiseSafetyRules,
  strictRules,
  stylisticRules,
  suppressionRules,
  testIntegrityRules,
} from "../oxlint.config.ts";

const config: OxlintConfig = configuration;
const repositoryRoot = join(import.meta.dir, "..");

const ruleGroups = {
  promiseSafetyRules,
  noUnsafeAnyRules,
  exhaustivenessRules,
  strictRules,
  stylisticRules,
  apiHygieneRules,
  jsdocContentRules,
  suppressionRules,
};

describe("oxlint.config.ts", () => {
  test("turns every enabled category into an error", () => {
    expect(config.categories).toEqual({
      correctness: "error",
      suspicious: "error",
      perf: "error",
    });
  });

  test("runs type-aware with warnings denied and unused directives as errors", () => {
    expect(config.options).toEqual({
      typeAware: true,
      denyWarnings: true,
      reportUnusedDisableDirectives: "error",
    });
  });

  test.each(Object.entries(ruleGroups))("sets every rule of %s to error", (_name, group) => {
    const rules: Record<string, unknown> = config.rules ?? {};
    for (const rule of group) {
      const setting = rules[rule];
      expect(Array.isArray(setting) ? setting[0] : setting).toBe("error");
      expect(lintPolicy.rules[rule]).toBe("error");
    }
  });

  test("keeps the return-await option and the S4 rules the ticket names", () => {
    const rules: Record<string, unknown> = config.rules ?? {};
    expect(rules["typescript/return-await"]).toEqual(["error", "in-try-catch"]);
    for (const rule of [
      "typescript/switch-exhaustiveness-check",
      "typescript/no-explicit-any",
      "typescript/consistent-type-imports",
      "typescript/no-unnecessary-condition",
      "jsdoc/check-tag-names",
      "unicorn/no-abusive-eslint-disable",
      "local/require-description",
      "local/no-non-doc-comments",
    ]) {
      expect(lintPolicy.rules[rule]).toBe("error");
    }
  });

  test("loads the local plugin", () => {
    expect(config.jsPlugins).toEqual(["./tools/oxlint/local-plugin.ts"]);
  });

  test("applies the test integrity rules to test files only", () => {
    const testOverride = config.overrides?.find((override) =>
      override.files.includes("**/*.test.ts"),
    );
    expect(testOverride?.plugins).toContain("jest");
    for (const rule of testIntegrityRules) {
      expect(testOverride?.rules?.[rule]).toBe("error");
      expect(lintPolicy.testRules[rule]).toBe("error");
      expect(lintPolicy.rules[rule]).toBeUndefined();
    }
    expect(testIntegrityRules).toContain("local/no-focused-bun-tests");
    expect(testIntegrityRules).toContain("local/no-unawaited-async-matcher");
  });

  test("runs the lint script as plain oxlint", async () => {
    const packageJson = await Bun.file(join(repositoryRoot, "package.json")).text();
    const lintScript = /"lint":\s*"([^"]*)"/.exec(packageJson)?.[1];
    expect(lintScript?.startsWith("oxlint")).toBe(true);
    expect(lintScript).not.toContain("--type-aware");
    expect(lintScript).not.toContain("--deny-warnings");
  });
});

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import config from "../oxlint.config.ts";

const repositoryRoot = join(import.meta.dir, "..");

describe("oxlint.config.ts", () => {
  test("turns every enabled category into an error", () => {
    expect(config.categories).toEqual({
      correctness: "error",
      suspicious: "error",
      perf: "error",
    });
  });

  test("reports unused disable directives as errors", () => {
    expect(config.options?.reportUnusedDisableDirectives).toBe("error");
  });

  test("keeps the type-aware rules on as errors", () => {
    const typeAwareRules = [
      "typescript/no-floating-promises",
      "typescript/no-misused-promises",
      "typescript/await-thenable",
      "typescript/no-unsafe-argument",
      "typescript/no-unsafe-assignment",
      "typescript/no-unsafe-call",
      "typescript/no-unsafe-member-access",
      "typescript/no-unsafe-return",
      "typescript/switch-exhaustiveness-check",
    ];
    const rules: Record<string, unknown> = config.rules ?? {};
    for (const rule of typeAwareRules) {
      expect(rules[rule]).toBe("error");
    }
  });

  test("loads the local plugin and enables its rules", () => {
    expect(config.jsPlugins).toEqual(["./tools/oxlint/local-plugin.ts"]);
    expect(config.rules?.["local/no-non-doc-comments"]).toBe("error");
    expect(config.rules?.["local/require-description"]).toBe("error");
  });

  test("keeps the jest guards on for test files", () => {
    const testOverride = config.overrides?.find((override) =>
      override.files.includes("**/*.test.ts"),
    );
    expect(testOverride?.rules?.["jest/no-focused-tests"]).toBe("error");
    expect(testOverride?.rules?.["jest/no-disabled-tests"]).toBe("error");
  });

  test("runs lint type-aware with warnings denied", async () => {
    const packageJson = await Bun.file(join(repositoryRoot, "package.json")).text();
    const lintScript = /"lint":\s*"([^"]*)"/.exec(packageJson)?.[1];
    expect(lintScript).toContain("--type-aware");
    expect(lintScript).toContain("--deny-warnings");
  });
});

import { describe, expect, test } from "bun:test";

import { matchesAnyGlob, resolveAfterSpec } from "./afterspec";
import type { AfterSpecSetting } from "./config";

const RULES: AfterSpecSetting = [
  { paths: ["apps/site/**", "docs/**"], mode: "promote" },
  { mode: "release" },
];

describe("resolveAfterSpec", () => {
  test("a Website and docs change matches rule 0", () => {
    const result = resolveAfterSpec(RULES, ["apps/site/a.astro", "docs/x.md"]);
    expect(result.mode).toBe("promote");
    expect(result.ruleIndex).toBe(0);
    expect(result.reason).toContain("apps/site/**");
  });

  test("a CLI change falls to the fallback rule", () => {
    const result = resolveAfterSpec(RULES, ["emet/src/promote.ts"]);
    expect(result.mode).toBe("release");
    expect(result.ruleIndex).toBe(1);
  });

  test("mixed paths fall to the fallback rule", () => {
    const result = resolveAfterSpec(RULES, ["apps/site/a.astro", "emet/src/promote.ts"]);
    expect(result.mode).toBe("release");
    expect(result.ruleIndex).toBe(1);
  });

  test("no match and no fallback resolves to none", () => {
    const result = resolveAfterSpec([{ paths: ["docs/**"], mode: "promote" }], ["emet/a.ts"]);
    expect(result.mode).toBe("none");
    expect(result.ruleIndex).toBeNull();
  });

  test("empty changed paths apply the fallback rule", () => {
    const result = resolveAfterSpec(RULES, []);
    expect(result.mode).toBe("release");
    expect(result.ruleIndex).toBe(1);
  });

  test("empty changed paths without a fallback resolve to none", () => {
    expect(resolveAfterSpec([{ paths: ["docs/**"], mode: "promote" }], []).mode).toBe("none");
  });

  test("the string form ignores the paths", () => {
    const result = resolveAfterSpec("promote", ["emet/src/promote.ts"]);
    expect(result.mode).toBe("promote");
    expect(result.ruleIndex).toBeNull();
  });
});

describe("matchesAnyGlob", () => {
  test("matches when any glob matches", () => {
    expect(matchesAnyGlob(["docs/**", "apps/**"], "apps/site/a.astro")).toBe(true);
    expect(matchesAnyGlob(["docs/**"], "apps/site/a.astro")).toBe(false);
  });

  test("reads a bracketed route segment literally", () => {
    const globs = ["apps/site/src/pages/[locale]/**"];
    expect(matchesAnyGlob(globs, "apps/site/src/pages/[locale]/a.astro")).toBe(true);
    expect(matchesAnyGlob(globs, "apps/site/src/pages/l/a.astro")).toBe(false);
  });
});

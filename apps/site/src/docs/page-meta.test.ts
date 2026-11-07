import { describe, expect, test } from "bun:test";

import { applySeoTitle } from "./page-meta";

const HEAD = [
  { tag: "title", content: "Fleet check | emet" },
  { tag: "meta", attrs: { property: "og:title", content: "Fleet check | emet" } },
  { tag: "meta", attrs: { name: "description", content: "x" } },
];

describe("applySeoTitle", () => {
  test("swaps the title and og:title but keeps the site suffix", () => {
    const result = applySeoTitle(HEAD, "Fleet check", "Fleet Check: Audit Several Repos");
    expect(result[0]?.content).toBe("Fleet Check: Audit Several Repos | emet");
    expect(result[1]?.attrs?.["content"]).toBe("Fleet Check: Audit Several Repos");
    expect(result[2]).toEqual(HEAD[2]);
  });

  test("leaves the head as is without an SEO title", () => {
    expect(applySeoTitle(HEAD, "Fleet check", undefined)).toEqual(HEAD);
  });
});

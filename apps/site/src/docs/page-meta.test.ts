import { describe, expect, test } from "bun:test";

import { applySeoTitle, mergeMissingTags, type HeadEntry } from "./page-meta";

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

describe("mergeMissingTags", () => {
  test("keeps existing tags and adds only the missing ones", () => {
    const extra: HeadEntry[] = [
      { tag: "meta", attrs: { property: "og:title", content: "other" } },
      { tag: "meta", attrs: { property: "og:image", content: "https://x/og.png" } },
      { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" } },
    ];
    const result = mergeMissingTags<HeadEntry>(HEAD, extra);
    expect(result).toHaveLength(HEAD.length + 2);
    expect(result.filter((entry) => entry.attrs?.["property"] === "og:title")).toHaveLength(1);
    expect(result.some((entry) => entry.attrs?.["property"] === "og:image")).toBe(true);
    expect(result.some((entry) => entry.attrs?.["rel"] === "manifest")).toBe(true);
  });
});

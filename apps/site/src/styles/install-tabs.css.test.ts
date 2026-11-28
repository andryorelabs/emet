import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("install-tabs.css", import.meta.url), "utf8");

describe("install tabs code", () => {
  it("wraps long commands inside the frame instead of scrolling", () => {
    expect(css).toMatch(
      /\.emet-install-tabs \.expressive-code pre[^{]*\{[^}]*white-space: pre-wrap/,
    );
    expect(css).toMatch(
      /\.emet-install-tabs \.expressive-code pre[^{]*\{[^}]*overflow-wrap: anywhere/,
    );
  });

  it("keeps wrapped text clear of the copy button", () => {
    expect(css).toMatch(/\.ec-line \.code\s*\{[^}]*padding-inline-end: 3rem/);
  });
});

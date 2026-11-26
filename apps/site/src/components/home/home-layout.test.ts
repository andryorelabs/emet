import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const homeDirectory = new URL("../../styles/home/", import.meta.url);
const baseCss = readFileSync(new URL("base.css", homeDirectory), "utf8");
const css = readdirSync(homeDirectory)
  .map((file) => readFileSync(new URL(file, homeDirectory), "utf8"))
  .join("\n");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(baseCss);
  if (match?.[1] === undefined) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Home section spacing", () => {
  it("does not space sections with an adjacency selector", () => {
    expect(css).not.toMatch(/section\s*\+\s*section/);
    expect(css).not.toMatch(/section:last-child/);
  });

  it("spaces the sections through the main flex gap", () => {
    const body = ruleBody("main");
    expect(body).toContain("display: flex");
    expect(body).toContain("flex-direction: column");
    expect(body).toContain("row-gap: var(--section-gap)");
    expect(body).not.toContain("padding-bottom");
  });

  it("imports every section stylesheet from the index", () => {
    const index = readFileSync(new URL("../../styles/home.css", import.meta.url), "utf8");
    for (const file of readdirSync(homeDirectory)) {
      expect(index).toContain(`@import "./home/${file}";`);
    }
  });
});

describe("Home stylesheet index order", () => {
  it("imports the section stylesheets in cascade order", () => {
    const index = readFileSync(new URL("../../styles/home.css", import.meta.url), "utf8");
    const imported = [...index.matchAll(/@import "\.\/home\/([a-z]+)\.css";/g)].map(
      (match) => match[1],
    );
    expect(imported).toEqual([
      "base",
      "hero",
      "how",
      "features",
      "about",
      "stats",
      "faq",
      "closing",
    ]);
  });
});

describe("Home layout tokens", () => {
  it("defines the container, the axis and the section gap on :root", () => {
    const body = ruleBody(":root");
    expect(body).toContain("--container: 1280px");
    expect(body).toContain("--axis: 160px");
    expect(body).toContain("--section-gap: 120px");
    expect(body).toContain("--edge: max(var(--gutter), (100% - var(--container)) / 2)");
    expect(css).not.toContain("--c4");
  });
});

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
    expect(body).toContain("--axis: 16px");
    expect(body).toContain("--section-gap: 120px");
    expect(body).toContain("--edge: max(var(--gutter), (100% - var(--container)) / 2)");
    expect(css).not.toContain("--c4");
  });
});

describe("Home typography and width tokens", () => {
  it("defines the prototype heading clamps and weights on :root", () => {
    const body = ruleBody(":root");
    expect(body).toContain("--h2-size: clamp(40px, 5.4vw, 76px)");
    expect(body).toContain("--h2-weight: 600");
    expect(body).toContain("--h2-tracking: -0.04em");
    expect(body).toContain("--hero-size: clamp(64px, 9.3vw, 168px)");
    expect(body).toContain("--hero-weight: 700");
    expect(body).toContain("--hero-tracking: -0.05em");
    expect(body).toContain("--closing-size: clamp(48px, 8vw, 120px)");
  });

  it("sets section headings from the tokens", () => {
    const body = ruleBody("main h2");
    expect(body).toContain("font-size: var(--h2-size)");
    expect(body).toContain("font-weight: var(--h2-weight)");
    expect(body).toContain("letter-spacing: var(--h2-tracking)");
  });

  it("exposes the shared content width class and inset token", () => {
    expect(ruleBody(":root")).toContain("--content-inset: calc(var(--edge) + var(--axis))");
    const body = ruleBody(".home-inner");
    expect(body).toContain("max-width: var(--container)");
    expect(body).toContain("padding-inline: var(--axis)");
    expect(ruleBody(".heading-hero")).toContain("var(--hero-size)");
    expect(ruleBody(".heading-closing")).toContain("var(--closing-size)");
  });
});

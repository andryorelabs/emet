import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/home.css", import.meta.url), "utf8");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
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

  it("sets no block margin on the closing panel", () => {
    const body = ruleBody(".closing");
    expect(body).not.toMatch(/(^|\s)margin\s*:/);
    expect(body).not.toMatch(/margin-(block|top|bottom)/);
    expect(body).toContain("margin-inline: var(--edge)");
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

describe("Home hero", () => {
  it("sets the sentence at 20px and weight 500 over a token-driven scrim", () => {
    const sentence = ruleBody(".hero-sentence");
    expect(sentence).toContain("font-size: 20px");
    expect(sentence).toContain("font-weight: 500");
    expect(ruleBody(".hero-copy::before")).toContain(
      "color-mix(in oklch, var(--bg) 62%, transparent)",
    );
  });
});

describe("Features rows", () => {
  it("stack the claim above its report below 1100px", () => {
    expect(css).toMatch(
      /@media \(max-width: 1100px\) \{[^@]*\.features-row \{\s*grid-template-columns: 1fr;/,
    );
  });
});

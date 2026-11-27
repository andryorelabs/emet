import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../Closing.astro", import.meta.url), "utf8");
const css = readFileSync(new URL("../../../styles/home/closing.css", import.meta.url), "utf8");
const graphics = readFileSync(new URL("../../../styles/graphics.css", import.meta.url), "utf8");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 * @param sheet - The stylesheet source.
 * @param selector - The exact selector text.
 * @returns The text between the rule's braces.
 */
function ruleBody(sheet: string, selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>"=]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(sheet);
  if (match?.[1] === undefined) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Closing parity with the prototype", () => {
  it("is full-bleed with the prototype's 8px edge", () => {
    expect(ruleBody(css, ".closing")).toContain("--edge: max(8px,");
  });

  it("sets the heading at the closing size, 0.95 leading and -0.05em tracking", () => {
    expect(source).toContain('class="heading-closing"');
    const body = ruleBody(css, ".closing h2");
    expect(body).toContain("line-height: 0.95");
    expect(body).toContain("letter-spacing: -0.05em");
    expect(body).toContain("max-width: 9em");
  });

  it("keeps the command pill dark in both schemes", () => {
    const body = ruleBody(css, ".closing-command");
    expect(body).toContain("background: var(--closing-pill)");
    expect(body).toContain("color: var(--closing-pill-text)");
  });

  it("does not drift the painting, so the WebGL layers stay on the painted golem", () => {
    expect(source).not.toContain("data-drift");
  });

  it("places the CSS valley fallback at the painting's 50% 70%", () => {
    const body = ruleBody(graphics, '.valley[data-valley="closing"]');
    expect(body).toContain("--ox: 0.5");
    expect(body).toContain("--oy: 0.7");
  });
});

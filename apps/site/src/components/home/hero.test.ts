import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/home/hero.css", import.meta.url), "utf8");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  if (match?.[1] === undefined) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

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

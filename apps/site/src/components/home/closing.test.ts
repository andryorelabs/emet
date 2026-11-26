import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/home/closing.css", import.meta.url), "utf8");

/**
 * Returns the declaration block of the first rule whose selector is exactly `selector`.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\>]/g, String.raw`\$&`);
  const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css);
  if (match?.[1] === undefined) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Home closing", () => {
  it("sets no block margin on the closing panel", () => {
    const body = ruleBody(".closing");
    expect(body).not.toMatch(/(^|\s)margin\s*:/);
    expect(body).not.toMatch(/margin-(block|top|bottom)/);
    expect(body).toContain("margin-inline: var(--edge)");
  });
});

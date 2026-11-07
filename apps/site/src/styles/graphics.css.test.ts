import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("graphics.css", import.meta.url), "utf8");

/**
 * Returns the enclosing at-rule preludes of every declaration that matches.
 * @param source - The stylesheet text.
 * @param declaration - Matches the end of the text before a `;` or `}`.
 * @returns One list of enclosing at-rule preludes per match.
 */
function enclosingAtRules(source: string, declaration: RegExp): string[][] {
  const stack: string[] = [];
  const found: string[][] = [];
  let prelude = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") {
      stack.push(prelude.trim());
      prelude = "";
    } else if (char === "}") {
      if (declaration.test(prelude)) found.push(stack.filter((entry) => entry.startsWith("@")));
      stack.pop();
      prelude = "";
    } else if (char === ";") {
      if (declaration.test(prelude)) found.push(stack.filter((entry) => entry.startsWith("@")));
      prelude = "";
    } else {
      prelude += char;
    }
  }
  return found;
}

const allowsMotion = (rule: string): boolean =>
  rule.startsWith("@media") && rule.includes("prefers-reduced-motion: no-preference");

/**
 * The typing cursor (`tt-blink`) is exempt: script creates it only when motion
 * is allowed, so it never exists for reduced-motion visitors.
 */
describe("graphics.css", () => {
  it("runs every animation only when reduced motion is not requested", () => {
    const animations = enclosingAtRules(css, /^\s*animation:(?!\s*tt-blink)/);
    expect(animations.length).toBeGreaterThan(0);
    for (const rules of animations) {
      expect(rules.some(allowsMotion)).toBe(true);
    }
  });

  it("keeps the valley hidden until motion is allowed", () => {
    expect(css).toMatch(/\.valley\s*\{\s*display:\s*none;\s*\}/);
    const shown = enclosingAtRules(css, /^\s*display:\s*block/).filter((rules) =>
      rules.some(allowsMotion),
    );
    expect(shown.length).toBeGreaterThan(0);
  });
});

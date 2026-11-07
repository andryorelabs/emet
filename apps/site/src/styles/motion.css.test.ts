import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("motion.css", import.meta.url), "utf8");

/**
 * Returns the at-rule preludes enclosing each `opacity: 0` declaration,
 * ignoring decorative `::after` overlays that hide no content.
 * @param source - The stylesheet text.
 * @returns One list of enclosing at-rule preludes per declaration.
 */
function enclosingAtRules(source: string): string[][] {
  const stack: string[] = [];
  const found: string[][] = [];
  let prelude = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === "{") {
      stack.push(prelude.trim());
      prelude = "";
    } else if (char === "}") {
      stack.pop();
      prelude = "";
    } else if (char === ";") {
      prelude = "";
    } else {
      prelude += char;
      const overlay = stack.at(-1)?.includes("::after") ?? false;
      if (!overlay && /opacity:\s*0(?![.\d])$/.test(prelude)) {
        found.push(stack.filter((entry) => entry.startsWith("@")));
      }
    }
  }
  return found;
}

describe("motion.css", () => {
  it("hides content only inside the reduced-motion-safe gate or a keyframe", () => {
    const declarations = enclosingAtRules(css);
    expect(declarations.length).toBeGreaterThan(0);
    for (const rules of declarations) {
      const gated = rules.some(
        (rule) =>
          rule.startsWith("@keyframes") ||
          (rule.startsWith("@media") && rule.includes("prefers-reduced-motion: no-preference")),
      );
      expect(gated).toBe(true);
    }
  });
});

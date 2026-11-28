import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../../styles/home/about.css", import.meta.url), "utf8");

describe("About CSS parity with prototype v17", () => {
  test("fades the whole aleph span, strike included, as the prototype does", () => {
    expect(css).toMatch(
      /html\[data-motion\] \.hebrew-aleph \{[^}]*opacity: calc\(1 - 0\.65 \* var\(--strike, 0\)\)/,
    );
    expect(css).not.toMatch(/html\[data-motion\] \.hebrew-aleph \{[^}]*color:/);
  });

  test("scopes the hiding rule to the reveal canvas so the eyes canvas stays displayable", () => {
    expect(css).toMatch(/\.portrait-frame canvas\[data-pixel-reveal\] \{\s*display: none;/);
    expect(css).not.toMatch(/\.portrait-frame canvas \{/);
  });

  test("leaves About without data-drift so the eyes stay aligned", () => {
    const source = readFileSync(new URL("../About.astro", import.meta.url), "utf8");
    expect(source).not.toContain("data-drift");
  });

  test("clips the portrait frame so the drifting sky copy cannot poke out of its corners", () => {
    expect(css).toMatch(/\.portrait-frame \{[^}]*overflow: clip;[^}]*border-radius: 10px/);
  });
});

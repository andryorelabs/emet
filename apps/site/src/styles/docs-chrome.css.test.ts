import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("docs.css", import.meta.url), "utf8");
const header = readFileSync(
  new URL("../components/docs/DocsHeader.astro", import.meta.url),
  "utf8",
);

/**
 * Reads the body of the first rule whose selector list is exactly `selector`.
 * @param selector - The rule selector, e.g. `.sl-menu-button`.
 * @returns The declarations between the braces, or an empty string.
 */
function ruleBody(selector: string): string {
  const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(String.raw`(?:^|\})\s*${escaped}\s*\{([^}]*)\}`, "m").exec(css)?.[1] ?? "";
}

describe("docs chrome", () => {
  it("hides Starlight's fixed menu button so it cannot cover the language selector", () => {
    expect(ruleBody(".sl-menu-button")).toContain("display: none");
  });

  it("keeps the Starlight menu button reachable when scripting is off", () => {
    expect(css).toMatch(
      /@media \(scripting: none\)\s*\{[^@]*\.sl-menu-button\s*\{\s*display: revert/,
    );
  });

  it("styles the active link of the docs mobile menu sheet like the sidebar one", () => {
    const activeRules = [
      ...css.matchAll(/([^{}]*a\[aria-current="page"\][^{}]*)\{[^}]*--surface[^}]*\}/g),
    ];
    const selectors = activeRules.map((rule) => rule[1]).join(",");
    for (const state of ["", ":hover", ":focus"]) {
      expect(selectors).toContain(`[data-menu-sidebar] a[aria-current="page"]${state}`);
    }
  });

  it("mounts the site mobile menu inside the docs header", () => {
    expect(header).toContain("MobileMenu");
  });

  it("hides the mobile table-of-contents bar once the footer is reached", () => {
    expect(css).toMatch(
      /html\[data-footer-reached\] mobile-starlight-toc\s*\{[^}]*visibility: hidden/,
    );
    expect(header).toContain("data-footer-reached");
    expect(header).toContain("IntersectionObserver");
  });
});

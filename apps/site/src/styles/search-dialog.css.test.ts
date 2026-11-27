import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Reads a file relative to this test.
 * @param relative - The path relative to `src/styles`.
 * @returns The file text.
 */
function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const dialogCss = read("search-dialog.css");
const headerControlsCss = read("header-controls.css");
const docsCss = read("docs.css");
const astroConfig = read("../../astro.config.ts");
const docsSearch = read("../components/docs/DocsSearch.astro");

describe("search dialog stylesheet", () => {
  it("sizes the dialog to its content up to the existing max-height", () => {
    expect(dialogCss).toMatch(/\[data-search-part="dialog"\] \{[^}]*height: fit-content;/);
    expect(dialogCss).not.toMatch(/\[data-search-part="dialog"\] \{[^}]*height: auto;/);
    expect(dialogCss).toMatch(
      /\[data-search-part="dialog"\] \{[^}]*max-height: calc\(100dvh - 32px\);/,
    );
  });

  it("leaves the centering to the shadcn dialog utilities", () => {
    expect(dialogCss).not.toMatch(
      /\[data-search-part="dialog"\] \{[^}]*(inset|translate|transform|margin):/,
    );
  });

  it("contains overscroll inside the results container", () => {
    expect(dialogCss).toMatch(
      /\[data-search-part="dialog"\] \.search-container \{[^}]*overscroll-behavior: contain;/,
    );
  });

  it("styles the shadcn dialog popup, not Starlight's native dialog", () => {
    expect(dialogCss).not.toContain("site-search");
    expect(dialogCss).toMatch(/\[data-search-part="dialog"\] \{[^}]*position: fixed;/);
    expect(dialogCss).toContain('[data-slot="dialog-overlay"]:has(+ [data-search-part="dialog"])');
  });

  it("maps Starlight tokens to the site tokens only on the standalone home page", () => {
    expect(dialogCss).toMatch(
      /\[data-search-part="dialog"\]\[data-standalone\] \{[^}]*--sl-color-text: var\(--text\);/,
    );
  });

  it("is shared by the docs and the home page", () => {
    expect(astroConfig).toContain('"./src/styles/search-dialog.css"');
    expect(docsSearch).toContain('import "../../styles/search-dialog.css";');
  });

  it("keeps no dialog, result or state rules in header-controls.css", () => {
    expect(headerControlsCss).not.toContain("pagefind-ui__result");
    expect(headerControlsCss).not.toContain("search-footer");
    expect(headerControlsCss).not.toContain("data-search-state");
  });

  it("keeps the standalone token mapping and close button display", () => {
    expect(headerControlsCss).toContain("--sl-color-text: var(--text);");
    expect(headerControlsCss).toMatch(/\[data-close-modal\] \{\s*display: flex;/);
  });

  it("moves the dialog block out of docs.css", () => {
    expect(docsCss).not.toContain("site-search dialog");
  });

  it("loads the mascot from a hashed site asset", () => {
    expect(dialogCss).toContain('url("../assets/mascot-sleep.svg")');
    expect(dialogCss).not.toContain("docs/brand");
    expect(existsSync(new URL("../assets/mascot-sleep.svg", import.meta.url))).toBe(true);
  });

  it("matches state selectors to the dialog the attribute is set on", () => {
    expect(dialogCss).toContain('[data-search-state="empty"] #starlight__search');
    expect(dialogCss).not.toContain("docs-search--standalone");
  });
});

import { describe, expect, test } from "bun:test";

/**
 * Reads a component source of this folder.
 * @param name - The file name.
 * @returns The file text.
 */
function source(name: string): Promise<string> {
  return Bun.file(new URL(name, import.meta.url)).text();
}

describe("header buttons render shadcn markup on the server", () => {
  test("the search button uses button and kbd data-slot markup and no island", async () => {
    const markup = await source("SearchButton.astro");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("buttonVariants(");
    expect(markup).toContain('<kbd data-slot="kbd"');
    expect(markup).not.toContain("client:");
    expect(markup).not.toContain("../ui/kbd");
  });

  test("the home header scopes the 44 px glass pill shape and keeps the 36 px docs buttons", async () => {
    const css = await Bun.file(new URL("../../styles/header-buttons.css", import.meta.url)).text();
    const rule = css.slice(css.indexOf(".site-header--home nav a:first-child,"));
    expect(rule).toContain(".site-header--home .search-button,");
    expect(rule).toContain("height: 44px;");
    expect(rule).toContain("border-radius: 12px;");
    expect(css).toContain("height: 36px;");
  });

  test("the home search pill grows from a 260 px minimum and the home wordmark is 20 px", async () => {
    const css = await Bun.file(new URL("../../styles/header-buttons.css", import.meta.url)).text();
    const wide = css.slice(
      css.indexOf("@media (min-width: 1000px) {\n  .site-header--home .search-button {"),
    );
    const rule = wide.slice(0, wide.indexOf("@media (max-width: 480px)"));
    expect(rule).toContain("width: auto;");
    expect(rule).toContain("min-width: 260px;");
    expect(rule).not.toMatch(/\n\s+width: 260px;/);
    expect(rule).toContain("overflow: visible;");
    expect(rule).toContain("text-overflow: clip;");
    expect(css).toContain(".site-header--home .wordmark {\n  font-size: 20px !important;");
  });

  test("the GitHub stars pill uses button and badge data-slot markup and no island", async () => {
    const markup = await source("GithubStars.astro");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-slot="badge"');
    expect(markup).not.toContain("client:");
  });

  test("the home pills match the prototype padding, icon sizes and chips", async () => {
    const css = await Bun.file(new URL("../../styles/header-buttons.css", import.meta.url)).text();
    expect(css).toContain("font-weight: 500;");
    expect(css).toContain(".site-header--home .search-button {\n  gap: 8px;\n  padding: 0 16px;");
    expect(css).toContain(
      ".site-header--home .search-button-icon {\n  width: 18px;\n  height: 18px;",
    );
    expect(css).toContain(".site-header--home .search-button-label {\n  opacity: 0.85;");
    expect(css).toContain("padding: 2px 7px;\n  border-radius: 6px;");
    expect(css).toContain("line-height: normal;");
    expect(css).toContain(
      ".site-header--home .github-stars--header {\n  gap: 8px;\n  padding: 0 16px;",
    );
    expect(css).toContain("width: 20px;\n  height: 20px;");
  });
});

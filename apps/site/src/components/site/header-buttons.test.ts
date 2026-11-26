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

  test("the GitHub stars pill uses button and badge data-slot markup and no island", async () => {
    const markup = await source("GithubStars.astro");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-slot="badge"');
    expect(markup).not.toContain("client:");
  });
});

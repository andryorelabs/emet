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

  test("the GitHub stars pill uses button and badge data-slot markup and no island", async () => {
    const markup = await source("GithubStars.astro");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-slot="badge"');
    expect(markup).not.toContain("client:");
  });
});

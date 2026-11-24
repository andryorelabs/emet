import { describe, expect, test } from "bun:test";

import { rewriteMarkdownLinks } from "./markdown";

const guide = { sourcePath: "docs/start/install.md" };

describe("rewriteMarkdownLinks reference definitions", () => {
  test("rewrites the target of a reference definition and keeps its title", () => {
    const markdown = '[cli]: ../reference/cli.md "The CLI"';
    expect(rewriteMarkdownLinks(markdown, guide)).toBe('[cli]: /docs/reference/cli/ "The CLI"');
  });

  test("rewrites an indented definition and a localized one", () => {
    expect(
      rewriteMarkdownLinks("  [fleet]: ../how-to/check-a-fleet.md#usage", {
        ...guide,
        locale: "pt-BR",
      }),
    ).toBe("  [fleet]: /pt-br/docs/how-to/check-a-fleet/#usage");
  });

  test("leaves a definition inside a fence untouched", () => {
    const markdown = "```md\n[cli]: ../reference/cli.md\n```";
    expect(rewriteMarkdownLinks(markdown, guide)).toBe(markdown);
  });
});

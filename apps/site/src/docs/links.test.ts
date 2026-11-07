import { describe, expect, test } from "bun:test";

import { rewriteImageSource, rewriteLink } from "./links";
import { rewriteMarkdownLinks } from "./markdown";

const guide = { sourcePath: "docs/guide/getting-started.md" };

describe("rewriteLink", () => {
  test("turns a published file into a site route", () => {
    expect(rewriteLink("../reference/cli.md", guide)).toBe("/docs/reference/cli/");
  });

  test("keeps the fragment and uses the locale prefix", () => {
    expect(rewriteLink("fleet.md#usage", { ...guide, locale: "pt-BR" })).toBe(
      "/pt-br/docs/guide/fleet/#usage",
    );
  });

  test("sends an unpublished file to its GitHub blob URL", () => {
    expect(rewriteLink("../../GLOSSARY.md", guide)).toBe(
      "https://github.com/andryorelabs/emet/blob/main/GLOSSARY.md",
    );
    expect(rewriteLink("../adr/0010-local-merge-landing.md", guide)).toBe(
      "https://github.com/andryorelabs/emet/blob/main/docs/adr/0010-local-merge-landing.md",
    );
  });

  test("sends an unpublished folder to its tree URL", () => {
    expect(rewriteLink("../adr/", guide)).toBe(
      "https://github.com/andryorelabs/emet/tree/main/docs/adr",
    );
  });

  test("leaves anchors, absolute URLs and outside targets alone", () => {
    expect(rewriteLink("#section", guide)).toBe("#section");
    expect(rewriteLink("https://example.com/a.md", guide)).toBe("https://example.com/a.md");
    expect(rewriteLink("../../../outside.md", guide)).toBe("../../../outside.md");
  });

  test("resolves links of the changelog from the repository root", () => {
    expect(rewriteLink("docs/guide/fleet.md", { sourcePath: "CHANGELOG.md" })).toBe(
      "/docs/guide/fleet/",
    );
  });
});

describe("rewriteImageSource", () => {
  const raw = "https://raw.githubusercontent.com/andryorelabs/emet/main";

  test("turns a repository image into a GitHub raw URL", () => {
    expect(rewriteImageSource("../brand/mascot/mascot-done.svg", guide)).toBe(
      `${raw}/docs/brand/mascot/mascot-done.svg`,
    );
  });

  test("keeps absolute URLs and targets outside the repository", () => {
    expect(rewriteImageSource("https://example.com/a.png", guide)).toBe(
      "https://example.com/a.png",
    );
    expect(rewriteImageSource("../../../a.png", guide)).toBe("../../../a.png");
  });
});

describe("rewriteMarkdownImages", () => {
  test("rewrites html and markdown image sources but not code", () => {
    const markdown = [
      '<img src="../brand/mascot/mascot-done.svg" alt="done" width="96">',
      "![logo](../brand/logo/mark.svg)",
      '`<img src="../brand/logo/mark.svg">`',
    ].join("\n");
    expect(rewriteMarkdownLinks(markdown, guide).split("\n")).toEqual([
      '<img src="https://raw.githubusercontent.com/andryorelabs/emet/main/docs/brand/mascot/mascot-done.svg" alt="done" width="96">',
      "![logo](https://raw.githubusercontent.com/andryorelabs/emet/main/docs/brand/logo/mark.svg)",
      '`<img src="../brand/logo/mark.svg">`',
    ]);
  });
});

describe("rewriteMarkdownLinks", () => {
  test("rewrites inline links but not code", () => {
    const markdown = [
      "See [the CLI](../reference/cli.md).",
      "Inline `[x](../reference/cli.md)` stays.",
      "```md",
      "[y](../reference/cli.md)",
      "```",
    ].join("\n");
    expect(rewriteMarkdownLinks(markdown, guide).split("\n")).toEqual([
      "See [the CLI](/docs/reference/cli/).",
      "Inline `[x](../reference/cli.md)` stays.",
      "```md",
      "[y](../reference/cli.md)",
      "```",
    ]);
  });
});

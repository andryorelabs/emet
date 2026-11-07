import { describe, expect, test } from "bun:test";

import { renderCodeWithStyles } from "../highlight/render";
import { buildCodeColorsCss, classifyTokenStyles } from "./code-classes";

const SAMPLE = 'bun add x --y "s" # c';

describe("classifyTokenStyles", () => {
  test("never keeps a --0/--1 style attribute on a token span", () => {
    const html = [
      '<span style="--0:#D4D4D4;--1:#1A1A1A">a</span>',
      '<span style="--0: #abcdef; --1: #012345">b</span>',
      '<span style="--0:#abc;--1:#def;">c</span>',
    ].join("");
    const classified = classifyTokenStyles(html);
    expect(classified).not.toMatch(/style="--0/);
    expect(classified).not.toContain("style=");
    expect(classified).toContain('<span class="tk-d4d4d4-1a1a1a">a</span>');
    expect(classified).toContain('<span class="tk-abc-def">c</span>');
  });

  test("turns a font weight and style into classes", () => {
    const classified = classifyTokenStyles(
      '<span style="--0:#005CC5;--0fw:bold;--0fs:italic;--1:#79B8FF;--1fw:bold;--1fs:italic">a</span>',
    );
    expect(classified).toBe('<span class="tk-005cc5-79b8ff tk-fw-bold tk-fs-italic">a</span>');
  });

  test("leaves a style it does not know untouched", () => {
    const html = '<span style="--0:#fff;--1:#000;--0xx:underline">a</span>';
    expect(classifyTokenStyles(html)).toBe(html);
  });
});

describe("buildCodeColorsCss", () => {
  test("has a rule for every tk class a fenced block renders", async () => {
    const { html } = await renderCodeWithStyles(SAMPLE, "bash");
    const classes = [...html.matchAll(/class="(tk-[0-9a-f]+-[0-9a-f]+)"/g)].map((m) => m[1]);
    expect(classes.length).toBeGreaterThan(3);
    const css = await buildCodeColorsCss([`# t\n\n\`\`\`bash\n${SAMPLE}\n\`\`\`\n`]);
    for (const className of classes) {
      expect(css).toContain(`.${className}{color:light-dark(#`);
    }
  });

  test("leaves no inline style on an emphasised markdown fence", async () => {
    const source = "# **bold** and *italic*\n\n- [link](https://x.y)";
    const { html, css } = await renderCodeWithStyles(source, "md");
    expect(html).not.toContain("style=");
    const classes = [...html.matchAll(/class="([^"]*tk-[^"]*)"/g)].flatMap((m) =>
      (m[1] ?? "").split(" ").filter((name) => name.startsWith("tk-")),
    );
    expect(classes.length).toBeGreaterThan(0);
    for (const className of classes) expect(css).toContain(`.${className}{`);
    const built = await buildCodeColorsCss([`\`\`\`md\n${source}\n\`\`\`\n`]);
    for (const className of classes) expect(built).toContain(`.${className}{`);
  });
});

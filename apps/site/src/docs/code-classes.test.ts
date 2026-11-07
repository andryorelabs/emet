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
});

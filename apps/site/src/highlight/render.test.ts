import { expect, test } from "bun:test";

import { renderCode, renderCodeWithStyles } from "./render";

test("renderCode emits no style attribute for bash or json", async () => {
  expect(await renderCode('bun add x --y "s" # c', "bash")).not.toContain("style=");
  expect(await renderCode('{ "wave": [2, true, null] }', "json")).not.toContain("style=");
});

test("every token class has a light-dark colour rule", async () => {
  const { html, css } = await renderCodeWithStyles('bun add x --y "s" # c', "bash");
  const classes = [...html.matchAll(/class="(tk-[0-9a-f]+-[0-9a-f]+)"/g)].map((m) => m[1]);
  expect(classes.length).toBeGreaterThan(3);
  for (const className of classes) {
    expect(css).toContain(`.${className}{color:light-dark(#`);
  }
  expect(new Set(classes).size).toBeGreaterThan(2);
});

test("renderCode escapes markup in the source", async () => {
  const html = await renderCode('echo "<script>alert(1)</script>"', "bash");
  expect(html).not.toContain("<script>");
});

test("renderCode renders plain text", async () => {
  const html = await renderCode("hello world", "text");
  expect(html).toContain("hello world");
});

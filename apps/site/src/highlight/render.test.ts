import { expect, test } from "bun:test";

import { renderCode } from "./render";

test("renderCode highlights bash with light and dark token colours", async () => {
  const html = await renderCode("bun run check --fix", "bash");
  expect(html).toContain("--0:");
  expect(html).toContain("--1:");
  expect(html).toContain("bun");
});

test("renderCode escapes markup in the source", async () => {
  const html = await renderCode('echo "<script>alert(1)</script>"', "bash");
  expect(html).not.toContain("<script>");
});

test("renderCode renders plain text", async () => {
  const html = await renderCode("hello world", "text");
  expect(html).toContain("hello world");
});

test("renderCode highlights json", async () => {
  const html = await renderCode('{ "wave": 2 }', "json");
  expect(html).toContain("--0:");
});

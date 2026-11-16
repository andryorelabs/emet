import { expect, test } from "bun:test";

import { classifyTokens, renderCode, renderCodeWithStyles, type TreeNode } from "./render";

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

test("classifyTokens keeps existing string classes and drops the style", () => {
  const node: TreeNode = {
    type: "element",
    properties: { style: "--0:#111111;--1:#eeeeee", className: ["ec", 7, "x"] },
    children: [{ type: "text" }],
  };
  const rules = new Map<string, string>();
  classifyTokens(node, rules);
  expect(node.properties?.style).toBeUndefined();
  const classes = node.properties?.className;
  if (!Array.isArray(classes)) throw new Error("className was not rewritten to an array");
  expect(classes.slice(0, 2)).toEqual(["ec", "x"]);
  expect(classes).toHaveLength(3);
  expect(rules.size).toBe(1);
});

test("classifyTokens leaves unknown or non-string styles untouched", () => {
  const unknown: TreeNode = { type: "element", properties: { style: "color:red" } };
  const absent: TreeNode = { type: "element", properties: { style: 3 } };
  const rules = new Map<string, string>();
  classifyTokens(unknown, rules);
  classifyTokens(absent, rules);
  expect(unknown.properties?.style).toBe("color:red");
  expect(absent.properties?.style).toBe(3);
  expect(rules.size).toBe(0);
});

test("renderCode renders plain text", async () => {
  const html = await renderCode("hello world", "text");
  expect(html).toContain("hello world");
});

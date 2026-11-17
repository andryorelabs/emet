import { describe, expect, test } from "bun:test";

import {
  type ContainerDirectiveNode,
  type MdastNode,
  emetDirectives,
  registerDirective,
  remarkEmetDirectives,
} from "./index";

const codeBlock: MdastNode = { type: "code", lang: "bash", value: "codex plugin add x" };

function directive(name: string, children: MdastNode[]): ContainerDirectiveNode {
  return { type: "containerDirective", name, children };
}

function orderedList(): MdastNode {
  return {
    type: "list",
    ordered: true,
    children: [
      { type: "listItem", children: [{ type: "paragraph", children: [] }, codeBlock] },
      { type: "listItem", children: [{ type: "paragraph", children: [] }] },
    ],
  };
}

describe("remarkEmetDirectives", () => {
  test("turns :::steps into an ol.emet-steps carrying the list items", () => {
    const list = orderedList();
    const result = remarkEmetDirectives.containerDirective(directive("steps", [list]));
    expect(result?.data).toEqual({ hName: "ol", hProperties: { class: "emet-steps" } });
    expect(result?.children).toBe(list.children);
  });

  test("keeps a code block nested in a step", () => {
    const result = remarkEmetDirectives.containerDirective(directive("steps", [orderedList()]));
    expect(result?.children?.[0]?.children?.[1]).toBe(codeBlock);
  });

  test("leaves an unknown directive alone", () => {
    expect(remarkEmetDirectives.containerDirective(directive("nope", [orderedList()]))).toBe(
      undefined,
    );
  });

  test("leaves :::steps without an ordered list alone", () => {
    const bullets: MdastNode = { type: "list", ordered: false, children: [] };
    expect(remarkEmetDirectives.containerDirective(directive("steps", [bullets]))).toBe(undefined);
  });

  test("registerDirective adds a handler by name", () => {
    registerDirective("note-test", (node) => ({ type: "paragraph", children: node.children }));
    const result = remarkEmetDirectives.containerDirective(directive("note-test", [codeBlock]));
    expect(result?.children).toEqual([codeBlock]);
  });
});

describe("emetDirectives", () => {
  test("appends the plugin to the Markdown processor", () => {
    const mdastPlugins: unknown[] = [];
    emetDirectives().hooks["astro:config:setup"]({
      config: { markdown: { processor: { options: { mdastPlugins } } } },
    });
    expect(mdastPlugins).toEqual([remarkEmetDirectives]);
  });

  test("throws when the processor has no mdast plugin list", () => {
    expect(() => {
      emetDirectives().hooks["astro:config:setup"]({ config: {} });
    }).toThrow("Satteri");
  });
});

import { describe, expect, test } from "bun:test";

import { type ContainerDirectiveNode, type MdastNode, remarkEmetDirectives } from "./index";

function code(meta: string, value: string): MdastNode {
  return { type: "code", lang: "bash", meta, value };
}

function directive(children: MdastNode[]): ContainerDirectiveNode {
  return { type: "containerDirective", name: "install-tabs", children };
}

describe(":::install-tabs", () => {
  test("wraps each labelled code block in a labelled panel", () => {
    const result = remarkEmetDirectives.containerDirective(
      directive([code('tab="Claude Code"', "a"), code("tab='Codex'", "b")]),
    );
    expect(result?.data?.hProperties?.["data-install-tabs"]).toBe("");
    const [list, first, second] = result?.children ?? [];
    expect(list?.data?.hProperties?.role).toBe("tablist");
    expect(first?.data?.hProperties?.["data-tab-label"]).toBe("Claude Code");
    expect(second?.data?.hProperties?.["data-tab-label"]).toBe("Codex");
    expect(result?.data?.hProperties?.["data-slot"]).toBe("tabs");
    expect(list?.data?.hProperties?.["data-slot"]).toBe("tabs-list");
    expect(first?.data?.hProperties?.["data-slot"]).toBe("tabs-content");
    expect(first?.children?.[1]).toMatchObject({ type: "code", value: "a", meta: "frame=none" });
  });

  test("leaves a directive without labelled code alone", () => {
    expect(
      remarkEmetDirectives.containerDirective(
        directive([code("", "a"), { type: "paragraph", children: [] }]),
      ),
    ).toBe(undefined);
  });
});

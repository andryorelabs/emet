import { expect, test } from "bun:test";

import { EMBEDDED_TREE } from "./embedded-tree.generated";

test("the generated module embeds the install tree as non-empty text", () => {
  const paths = Object.keys(EMBEDDED_TREE);
  expect(paths).toContain("commands/run.md");
  for (const file of paths) expect(EMBEDDED_TREE[file]?.length).toBeGreaterThan(0);
});

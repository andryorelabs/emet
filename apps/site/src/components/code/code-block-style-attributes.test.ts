import { describe, expect, test } from "bun:test";

import {
  CODE_BLOCK_STYLE_ATTRIBUTE_HASHES,
  CODE_BLOCK_STYLE_ATTRIBUTES,
} from "./code-block-style-attributes";

describe("code block style attributes", () => {
  test("allows only the line counter reset of the vendored code block", () => {
    expect(CODE_BLOCK_STYLE_ATTRIBUTES).toEqual(["counter-reset:line 0"]);
  });

  test("hashes the style value for the CSP", () => {
    expect(CODE_BLOCK_STYLE_ATTRIBUTE_HASHES).toEqual([
      "sha256-8tqh6a/etznAMV9DgXnVMaUPL63Ue8gZFaCPYe0Nt9I=",
    ]);
  });
});

import { describe, expect, test } from "bun:test";

import { collectStarlightInlineScriptHashes } from "./starlight-inline-hashes";

describe("collectStarlightInlineScriptHashes", () => {
  test("returns sha256 hashes, each once", () => {
    const hashes = collectStarlightInlineScriptHashes();
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) expect(hash).toMatch(/^sha256-[\w+/]{43}=$/);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

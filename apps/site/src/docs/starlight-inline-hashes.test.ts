import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  collectStarlightInlineScriptHashes,
  collectStarlightInlineStyleHashes,
} from "./starlight-inline-hashes";

function hashOf(value: string): `sha256-${string}` {
  return `sha256-${createHash("sha256").update(value).digest("base64")}`;
}

describe("collectStarlightInlineStyleHashes", () => {
  test("returns sha256 hashes, each once", () => {
    const hashes = collectStarlightInlineStyleHashes();
    for (const hash of hashes) expect(hash).toMatch(/^sha256-[\w+/]{43}=$/);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  test("covers the attributes Starlight renders on the docs pages", () => {
    const hashes = collectStarlightInlineStyleHashes();
    const rendered = [
      "display: none",
      "padding: 0",
      "--depth: 0;",
      "--depth: 1;",
      "--sl-icon-size: 1em;",
      "--sl-icon-size: 1rem;",
      "--sl-icon-size: 1.2em;",
      "--sl-icon-size: 1.25rem;",
      "--sl-icon-size: 1.5rem;",
    ];
    for (const value of rendered) expect(hashes).toContain(hashOf(value));
  });
});

describe("collectStarlightInlineScriptHashes", () => {
  test("returns sha256 hashes, each once", () => {
    const hashes = collectStarlightInlineScriptHashes();
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) expect(hash).toMatch(/^sha256-[\w+/]{43}=$/);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

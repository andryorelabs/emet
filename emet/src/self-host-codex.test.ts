import { describe, expect, test } from "bun:test";

import { embeddedTree } from "./assets";
import { installCodexHost } from "./self-host-codex";

describe("installCodexHost (stub)", () => {
  test("skips Codex, writes nothing and logs one line", () => {
    const lines: string[] = [];
    const result = installCodexHost({
      home: "/nonexistent-emet-home",
      emetBin: "/nonexistent-emet-home/.local/bin/emet",
      tree: embeddedTree(),
      dryRun: false,
      force: false,
      now: () => new Date(0),
      log: (line) => lines.push(line),
    });
    expect(result).toEqual({
      host: "codex",
      status: "skipped",
      writes: [],
      notes: ["the Codex adapter is not available yet; Codex skipped"],
    });
    expect(lines).toEqual(["codex: the Codex adapter is not available yet; Codex skipped"]);
  });
});

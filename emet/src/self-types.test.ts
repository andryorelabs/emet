import { describe, expect, test } from "bun:test";

import { embeddedTree } from "./assets";
import type { HostContext, HostResult } from "./self-types";

describe("self-types", () => {
  test("a HostContext carries the tree, flags, clock and logger a host adapter needs", () => {
    const lines: string[] = [];
    const context: HostContext = {
      home: "/tmp/home",
      emetBin: "/tmp/home/.local/bin/emet",
      tree: embeddedTree(),
      dryRun: true,
      force: false,
      now: () => new Date("2026-11-23T00:00:00Z"),
      log: (line) => lines.push(line),
    };
    context.log("hello");
    expect(lines).toEqual(["hello"]);
    expect(context.now().toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(context.tree.list()).toContain("commands/run.md");
  });

  test("a HostResult names its host, status, writes and notes", () => {
    const result: HostResult = {
      host: "codex",
      status: "skipped",
      writes: [],
      notes: ["Codex not found; skipped"],
    };
    expect(result).toEqual({
      host: "codex",
      status: "skipped",
      writes: [],
      notes: ["Codex not found; skipped"],
    });
  });
});

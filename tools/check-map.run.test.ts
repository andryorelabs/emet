import { describe, expect, test } from "bun:test";

import { MAP_STALE_COMMAND, runMapGate } from "./check-map";

/** A stream that collects what the gate echoes. */
function collector(): { written: string; write(text: string): void } {
  const stream = {
    written: "",
    write(text: string): void {
      stream.written += text;
    },
  };
  return stream;
}

describe("runMapGate", () => {
  test("runs emet map --stale by default", () => {
    expect(MAP_STALE_COMMAND).toEqual(["bun", "emet/bin/emet.ts", "map", "--stale"]);
  });

  test("echoes stdout and stderr and passes a fresh map", () => {
    const stream = collector();
    expect(runMapGate(["sh", "-c", "echo fresh; echo note >&2"], stream)).toBe(0);
    expect(stream.written).toBe("fresh\nnote\n");
  });

  test("fails a stale map", () => {
    const stream = collector();
    expect(runMapGate(["sh", "-c", "echo stale: 11 commits; exit 1"], stream)).toBe(1);
    expect(stream.written).toBe("stale: 11 commits\n");
  });

  test("tolerates a stamp missing from history", () => {
    const stream = collector();
    expect(runMapGate(["sh", "-c", "echo stamped abc not in history >&2; exit 1"], stream)).toBe(0);
    expect(stream.written).toContain("not in history");
  });
});

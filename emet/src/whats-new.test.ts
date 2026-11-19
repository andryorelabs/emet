import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import { run, whatsNewMarkerPath, whatsNewNotice } from "./whats-new";

let directory = "";
let marker = "";

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-whats-new-"));
  marker = path.join(directory, "last-seen-version");
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const stored = (): string => readFileSync(marker, "utf8").trim();

describe("whatsNewNotice", () => {
  test("prints once after an update and rewrites the marker", () => {
    writeFileSync(marker, "0.9.0\n");
    const line =
      "emet updated 0.9.0 → 0.10.0. What's new: https://emet.andryore.dev/docs/whats-new/#0100";
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBe(line);
    expect(stored()).toBe("0.10.0");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
  });

  test("stays silent without a marker, on equal versions and on a downgrade", () => {
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
    expect(stored()).toBe("0.10.0");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
    writeFileSync(marker, "0.11.0");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
    expect(stored()).toBe("0.10.0");
  });

  test("handles a v prefix, whitespace and a prerelease marker", () => {
    writeFileSync(marker, "  v0.9.0 \n\n");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toContain("0.9.0 → 0.10.0");
    writeFileSync(marker, "0.10.0-rc.1");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
  });

  test("a malformed marker is silent and rewritten", () => {
    writeFileSync(marker, "garbage");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: marker })).toBeNull();
    expect(stored()).toBe("0.10.0");
  });

  test("an unwritable marker never throws", () => {
    const blocked = path.join(directory, "file");
    writeFileSync(blocked, "x");
    expect(whatsNewNotice({ current: "0.10.0", markerPath: path.join(blocked, "m") })).toBeNull();
  });
});

describe("whatsNewMarkerPath", () => {
  test("uses the data directory when non-empty, else ~/.emet", () => {
    expect(whatsNewMarkerPath("/tmp/x", "/home/u")).toBe("/tmp/x/last-seen-version");
    expect(whatsNewMarkerPath("", "/home/u")).toBe("/home/u/.emet/last-seen-version");
    expect(whatsNewMarkerPath(undefined, "/home/u")).toBe("/home/u/.emet/last-seen-version");
  });
});

describe("run", () => {
  test("prints the line, or one JSON object with --hook, using --data-dir", async () => {
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      writeFileSync(marker, "0.0.1");
      await run(["--data-dir", directory], "1.0.0");
      expect(String(log.mock.calls[0]?.[0])).toContain(`0.0.1 → 1.0.0`);
      log.mockClear();
      writeFileSync(marker, "0.0.1");
      await run(["--hook", "--data-dir", directory], "1.0.0");
      const parsed: unknown = JSON.parse(String(log.mock.calls[0]?.[0]));
      expect(isObject(parsed)).toBe(true);
      expect(Object.keys(isObject(parsed) ? parsed : {})).toEqual(["systemMessage"]);
      log.mockClear();
      await run(["--hook", "--data-dir", directory], "1.0.0");
      expect(log).not.toHaveBeenCalled();
      expect(existsSync(marker)).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  test("resolves even when printing throws", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {
      throw new Error("EPIPE");
    });
    try {
      writeFileSync(marker, "0.0.1");
      await run(["--data-dir", directory], "1.0.0");
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});

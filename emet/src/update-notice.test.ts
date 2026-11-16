import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { updateNotice, type FetchLatest, type UpdateNoticeInput } from "./update-notice";

const now = new Date("2026-11-16T12:00:00.000Z");

function countingFetch(latest: string): { fetchLatest: FetchLatest; calls: () => number } {
  let count = 0;
  return {
    fetchLatest: () => {
      count += 1;
      return Promise.resolve(latest);
    },
    calls: () => count,
  };
}

const failingFetch: FetchLatest = () => Promise.reject(new Error("offline"));
const hangingFetch: FetchLatest = () => new Promise(() => undefined);

describe("updateNotice", () => {
  let dir: string;
  let cacheFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "emet-update-"));
    cacheFile = path.join(dir, "nested", "update.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeCache(checkedAt: string, latest: string): void {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt, latest }));
  }

  function input(overrides: Partial<UpdateNoticeInput> = {}): UpdateNoticeInput {
    return { current: "1.0.0", isTTY: true, json: false, now, cacheFile, ...overrides };
  }

  it("is silent under --json and never fetches", async () => {
    const fetcher = countingFetch("2.0.0");
    expect(await updateNotice(input({ json: true, fetchLatest: fetcher.fetchLatest }))).toBeNull();
    expect(fetcher.calls()).toBe(0);
  });

  it("is silent without a TTY and never fetches", async () => {
    const fetcher = countingFetch("2.0.0");
    expect(
      await updateNotice(input({ isTTY: false, fetchLatest: fetcher.fetchLatest })),
    ).toBeNull();
    expect(fetcher.calls()).toBe(0);
  });

  it("returns null on a cold cache, then caches in the background", async () => {
    const fetcher = countingFetch("2.0.0");
    expect(await updateNotice(input({ fetchLatest: fetcher.fetchLatest }))).toBeNull();
    await Bun.sleep(20);
    expect(fs.readFileSync(cacheFile, "utf8")).toContain('"latest":"2.0.0"');
  });

  it("announces a newer cached version without fetching while fresh", async () => {
    writeCache("2026-11-16T06:00:00.000Z", "1.2.0");
    const fetcher = countingFetch("9.9.9");
    expect(await updateNotice(input({ fetchLatest: fetcher.fetchLatest }))).toBe(
      "emet 1.2.0 is available (you have 1.0.0).",
    );
    expect(fetcher.calls()).toBe(0);
  });

  it("stays quiet when the cached version is not newer", async () => {
    writeCache("2026-11-16T06:00:00.000Z", "1.0.0");
    expect(await updateNotice(input())).toBeNull();
  });

  it("refreshes a cache older than a day", async () => {
    writeCache("2026-11-14T06:00:00.000Z", "1.0.0");
    const fetcher = countingFetch("1.5.0");
    await updateNotice(input({ fetchLatest: fetcher.fetchLatest }));
    await Bun.sleep(20);
    expect(fetcher.calls()).toBe(1);
    expect(fs.readFileSync(cacheFile, "utf8")).toContain('"latest":"1.5.0"');
  });

  it("survives a failing fetch and a corrupt cache", async () => {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, "not json");
    expect(await updateNotice(input({ fetchLatest: failingFetch }))).toBeNull();
    await Bun.sleep(20);
    expect(fs.readFileSync(cacheFile, "utf8")).toBe("not json");
  });

  it("does not wait for a slow fetch", async () => {
    const started = Date.now();
    expect(await updateNotice(input({ fetchLatest: hangingFetch }))).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

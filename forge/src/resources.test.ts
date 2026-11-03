import { describe, expect, test } from "bun:test";

import { checkMemoryHeadroom, computeAutoMaxLiveWorkers, type HostResources } from "./resources";

const GIB = 1024 ** 3;

describe("computeAutoMaxLiveWorkers", () => {
  test("a small host (2 cores, 4 GiB) floors at the minimum", () => {
    const resources: HostResources = {
      cpuCount: 2,
      memTotalBytes: 4 * GIB,
      memAvailableBytes: 3 * GIB,
    };
    /**
     * memory-bound: floor((4 - 8) / 2) clamps to 0 before the floor, so the
     * absolute min (2) wins.
     */
    expect(computeAutoMaxLiveWorkers(resources)).toBe(2);
  });

  test("a huge host (96 cores, 512 GiB) clamps at the maximum", () => {
    const resources: HostResources = {
      cpuCount: 96,
      memTotalBytes: 512 * GIB,
      memAvailableBytes: 400 * GIB,
    };
    expect(computeAutoMaxLiveWorkers(resources)).toBe(32);
  });

  test("this host's own numbers (16 cores, 62 GiB) land at 16, memory-bound above it", () => {
    const resources: HostResources = {
      cpuCount: 16,
      memTotalBytes: 62 * GIB,
      memAvailableBytes: 49 * GIB,
    };
    /**
     * cpu-bound: 16 × 1 = 16; memory-bound: floor((62-8)/2) = 27 — cpu wins.
     */
    expect(computeAutoMaxLiveWorkers(resources)).toBe(16);
  });

  test("a memory-starved host picks the memory arm over the cpu arm", () => {
    const resources: HostResources = {
      cpuCount: 32,
      memTotalBytes: 16 * GIB,
      memAvailableBytes: 10 * GIB,
    };
    /**
     * cpu-bound: 32; memory-bound: floor((16-8)/2) = 4 — memory wins.
     */
    expect(computeAutoMaxLiveWorkers(resources)).toBe(4);
  });

  test("a cgroup-limited container (4 cores exposed, 8 GiB) is bound by what readHostResources already narrowed", () => {
    const resources: HostResources = {
      cpuCount: 4,
      memTotalBytes: 8 * GIB,
      memAvailableBytes: 6 * GIB,
    };
    /**
     * cpu-bound: 4; memory-bound: floor((8-8)/2) = 0 -> min(4,0)=0 -> floors at the absolute min (2).
     */
    expect(computeAutoMaxLiveWorkers(resources)).toBe(2);
  });

  test("custom options override every default", () => {
    const resources: HostResources = {
      cpuCount: 8,
      memTotalBytes: 32 * GIB,
      memAvailableBytes: 20 * GIB,
    };
    /** cpu-bound: 8*2=16; memory-bound: floor((32-4)/1)=28 -> cpu wins */
    expect(
      computeAutoMaxLiveWorkers(resources, {
        cpuOversubscribe: 2,
        memReserveBytes: 4 * GIB,
        memPerWorkerBytes: 1 * GIB,
        min: 1,
        max: 100,
      }),
    ).toBe(16);
  });

  test("never goes below min even on a starved host", () => {
    const resources: HostResources = { cpuCount: 1, memTotalBytes: 1 * GIB, memAvailableBytes: 0 };
    expect(computeAutoMaxLiveWorkers(resources)).toBe(2);
  });
});

describe("checkMemoryHeadroom", () => {
  test("ok when available memory is at or above the reserve", () => {
    const resources: HostResources = {
      cpuCount: 8,
      memTotalBytes: 32 * GIB,
      memAvailableBytes: 10 * GIB,
    };
    expect(checkMemoryHeadroom(resources, 8 * GIB)).toEqual({ ok: true });
  });

  test("denies when available memory is below the reserve, with a stated reason", () => {
    const resources: HostResources = {
      cpuCount: 8,
      memTotalBytes: 32 * GIB,
      memAvailableBytes: 2 * GIB,
    };
    const verdict = checkMemoryHeadroom(resources, 8 * GIB);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toMatch(/2\.0 GiB available/);
      expect(verdict.memAvailableBytes).toBe(2 * GIB);
      expect(verdict.reserveBytes).toBe(8 * GIB);
    }
  });

  test("passes vacuously when memAvailableBytes cannot be read (non-Linux host)", () => {
    const resources: HostResources = {
      cpuCount: 8,
      memTotalBytes: 32 * GIB,
      memAvailableBytes: null,
    };
    expect(checkMemoryHeadroom(resources, 8 * GIB)).toEqual({ ok: true });
  });
});

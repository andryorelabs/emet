import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_FORGE_CONFIG, type ForgeConfig } from "./config";
import { readPhase } from "./phase";
import {
  acquireSlot,
  isSlotStale,
  listOccupiedSlots,
  releaseAllSlotsForRun,
  releaseSlot,
  releaseSlotIfOwned,
  resolveMaxLiveWorkers,
} from "./slots";

/**
 * A pid outside the kernel's pid range — the cheapest reliable stand-in for
 * "this run's anchor is definitely dead" without mocking `/proc`. Mirrors
 * `forge-claims.test.ts`'s own constant.
 */
const IMPOSSIBLE_PID = 999_999_999;

/**
 * A pid standing in for a "live" anchor, paired with an injected
 * `isAnchorAliveFn` rather than a real `/proc`-backed `claude` ancestor.
 */
const LIVE_MARKER_PID = 424_242;

function expectSlot(index: number | null): number {
  if (index === null) throw new Error("expected an acquired slot index");
  return index;
}

describe("acquireSlot / releaseSlot / releaseAllSlotsForRun", () => {
  let slotsDirectory: string;

  beforeEach(() => {
    slotsDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-test-"));
  });

  afterEach(() => {
    rmSync(slotsDirectory, { recursive: true, force: true });
  });

  test("claims the first free slot out of cap", async () => {
    const index = await acquireSlot(4, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(index).toBe(0);
  });

  test("a second run claims the next free slot, never the same one", async () => {
    const first = await acquireSlot(4, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    const second = await acquireSlot(4, "run-b", LIVE_MARKER_PID, "AO-2", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  test("returns null once every slot is held by a live owner", async () => {
    for (let index = 0; index < 2; index++) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- slots must be acquired one at a time to assert ordering
      await acquireSlot(2, `run-${index}`, LIVE_MARKER_PID, `AO-${index}`, slotsDirectory, {
        isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
      });
    }
    const result = await acquireSlot(2, "run-overflow", LIVE_MARKER_PID, "AO-99", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(result).toBeNull();
  });

  test("reclaims a slot whose owning run has no live anchor", async () => {
    await acquireSlot(2, "run-dead", IMPOSSIBLE_PID, "AO-1", slotsDirectory);
    const reclaimed = await acquireSlot(2, "run-b", LIVE_MARKER_PID, "AO-2", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(reclaimed).toBe(0);
  });

  test("releaseSlot frees an index for immediate re-acquisition", async () => {
    const index = await acquireSlot(2, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(index).not.toBeNull();
    releaseSlot(slotsDirectory, expectSlot(index));

    const reacquired = await acquireSlot(2, "run-b", LIVE_MARKER_PID, "AO-2", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(reacquired).toBe(0);
  });

  test("releaseAllSlotsForRun releases only that run’s own slots", async () => {
    await acquireSlot(4, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    await acquireSlot(4, "run-a", LIVE_MARKER_PID, "AO-2", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    await acquireSlot(4, "run-b", LIVE_MARKER_PID, "AO-3", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });

    const released = await releaseAllSlotsForRun("run-a", slotsDirectory);

    expect(released.toSorted((a, b) => a - b)).toEqual([0, 1]);
    const remaining = await listOccupiedSlots(slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.holder.runId).toBe("run-b");
  });

  test("releaseAllSlotsForRun on a missing slots directory returns an empty list", async () => {
    rmSync(slotsDirectory, { recursive: true, force: true });
    expect(await releaseAllSlotsForRun("run-a", slotsDirectory)).toEqual([]);
  });
});

describe("releaseSlotIfOwned", () => {
  let slotsDirectory: string;

  beforeEach(() => {
    slotsDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-test-"));
  });

  afterEach(() => {
    rmSync(slotsDirectory, { recursive: true, force: true });
  });

  test("releases a slot held by the expected run", async () => {
    const index = await acquireSlot(2, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    const result = releaseSlotIfOwned(slotsDirectory, expectSlot(index), "run-a");
    expect(result).toEqual({ outcome: "released", previousOwnerRunId: "run-a" });
    expect(isSlotStale(slotsDirectory, expectSlot(index))).toBe(true);
  });

  test("an unoccupied index is a no-op, not an error", () => {
    expect(releaseSlotIfOwned(slotsDirectory, 0, "run-a")).toEqual({
      outcome: "not-occupied",
    });
  });

  /**
   * The regression this guards: before the ownership check existed,
   * `--release-index` freed any slot unconditionally, so one coordinator
   * could free a slot a different, still-live coordinator legitimately holds.
   */
  test("refuses to release a slot held by a different run", async () => {
    const index = await acquireSlot(2, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    const result = releaseSlotIfOwned(slotsDirectory, expectSlot(index), "run-b");
    expect(result).toEqual({ outcome: "owned-by-another", ownerRunId: "run-a" });
    expect(
      isSlotStale(slotsDirectory, expectSlot(index), {
        isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
      }),
    ).toBe(false);
  });

  test("force releases another run's slot anyway", async () => {
    const index = await acquireSlot(2, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    const result = releaseSlotIfOwned(slotsDirectory, expectSlot(index), "run-b", true);
    expect(result).toEqual({ outcome: "released", previousOwnerRunId: "run-a" });
  });
});

describe("isSlotStale", () => {
  let slotsDirectory: string;

  beforeEach(() => {
    slotsDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-test-"));
  });

  afterEach(() => {
    rmSync(slotsDirectory, { recursive: true, force: true });
  });

  test("an unoccupied index is stale", () => {
    expect(isSlotStale(slotsDirectory, 0)).toBe(true);
  });

  test("a live owner is not stale", async () => {
    await acquireSlot(1, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    expect(
      isSlotStale(slotsDirectory, 0, {
        isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
      }),
    ).toBe(false);
  });

  test("a dead owner is stale", async () => {
    await acquireSlot(1, "run-dead", IMPOSSIBLE_PID, "AO-1", slotsDirectory);
    expect(isSlotStale(slotsDirectory, 0)).toBe(true);
  });
});

function configWith(maxLiveWorkers: ForgeConfig["concurrency"]["maxLiveWorkers"]): ForgeConfig {
  return {
    ...DEFAULT_FORGE_CONFIG,
    concurrency: { ...DEFAULT_FORGE_CONFIG.concurrency, maxLiveWorkers },
  };
}

describe("resolveMaxLiveWorkers", () => {
  const originalEnv = process.env.FORGE_MAX_LIVE_WORKERS;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.FORGE_MAX_LIVE_WORKERS;
    else process.env.FORGE_MAX_LIVE_WORKERS = originalEnv;
  });

  test("returns the config's own fixed number when no env override is set", () => {
    delete process.env.FORGE_MAX_LIVE_WORKERS;
    expect(resolveMaxLiveWorkers(configWith(6))).toBe(6);
  });

  test("a numeric env override wins over the config value", () => {
    process.env.FORGE_MAX_LIVE_WORKERS = "3";
    expect(resolveMaxLiveWorkers(configWith(6))).toBe(3);
  });

  test('config "auto" resolves to a positive integer from this host\'s own resources', () => {
    delete process.env.FORGE_MAX_LIVE_WORKERS;
    const result = resolveMaxLiveWorkers(configWith("auto"));
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  test('an env override of "auto" also resolves to a positive integer, even over a fixed config value', () => {
    process.env.FORGE_MAX_LIVE_WORKERS = "auto";
    const result = resolveMaxLiveWorkers(configWith(6));
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  test("an invalid env override falls back to the config value", () => {
    process.env.FORGE_MAX_LIVE_WORKERS = "not-a-number";
    expect(resolveMaxLiveWorkers(configWith(6))).toBe(6);
  });

  test("EMET_MAX_LIVE_WORKERS wins over the legacy FORGE_MAX_LIVE_WORKERS", () => {
    const originalEmet = process.env.EMET_MAX_LIVE_WORKERS;
    try {
      process.env.EMET_MAX_LIVE_WORKERS = "2";
      process.env.FORGE_MAX_LIVE_WORKERS = "5";
      expect(resolveMaxLiveWorkers(configWith(6))).toBe(2);
    } finally {
      if (originalEmet === undefined) delete process.env.EMET_MAX_LIVE_WORKERS;
      else process.env.EMET_MAX_LIVE_WORKERS = originalEmet;
    }
  });

  test("a legacy FORGE_MAX_LIVE_WORKERS alone still applies", () => {
    const originalEmet = process.env.EMET_MAX_LIVE_WORKERS;
    delete process.env.EMET_MAX_LIVE_WORKERS;
    try {
      process.env.FORGE_MAX_LIVE_WORKERS = "4";
      expect(resolveMaxLiveWorkers(configWith(6))).toBe(4);
    } finally {
      if (originalEmet !== undefined) process.env.EMET_MAX_LIVE_WORKERS = originalEmet;
    }
  });
});

describe("listOccupiedSlots", () => {
  let slotsDirectory: string;

  beforeEach(() => {
    slotsDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-test-"));
  });

  afterEach(() => {
    rmSync(slotsDirectory, { recursive: true, force: true });
  });

  test("reports each occupied slot with its verdict, sorted by index", async () => {
    await acquireSlot(4, "run-a", LIVE_MARKER_PID, "AO-1", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });
    await acquireSlot(4, "run-dead", IMPOSSIBLE_PID, "AO-2", slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });

    const entries = await listOccupiedSlots(slotsDirectory, {
      isAnchorAliveFn: (pid) => pid === LIVE_MARKER_PID,
    });

    expect(entries).toMatchObject([
      {
        index: 0,
        verdict: "live",
        holder: { runId: "run-a", ticket: "AO-1" },
      },
      {
        index: 1,
        verdict: "dead",
        holder: {
          runId: "run-dead",
          ticket: "AO-2",
        },
      },
    ]);
  });

  test("an empty slots directory reports no occupied slots", async () => {
    expect(await listOccupiedSlots(slotsDirectory)).toEqual([]);
  });
});

describe("slots --acquire CLI", () => {
  test("writes the working phase for the run", () => {
    const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-slots-phase-")));
    const stateDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-state-"));
    try {
      Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
      copyFileSync(
        path.join(import.meta.dir, "..", "..", "emet.config.json"),
        path.join(repo, "emet.config.json"),
      );
      const result = Bun.spawnSync(
        [
          "bun",
          path.join(import.meta.dir, "slots.ts"),
          "--acquire",
          "--run",
          "run-phase",
          "--anchor",
          String(process.pid),
          "--ticket",
          "T-1",
        ],
        {
          cwd: repo,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, EMET_STATE_DIR: stateDirectory, EMET_MEM_RESERVE_GIB: "0.001" },
        },
      );
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      const record = readPhase(repo);
      expect(record?.phase).toBe("working");
      expect(record?.runId).toBe("run-phase");
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDirectory, { recursive: true, force: true });
    }
  });

  test("an unwritable phase file does not change the exit code or output", () => {
    const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-slots-blocked-")));
    const stateDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-slots-state-"));
    try {
      Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
      copyFileSync(
        path.join(import.meta.dir, "..", "..", "emet.config.json"),
        path.join(repo, "emet.config.json"),
      );
      mkdirSync(path.join(repo, ".emet", "phase.json"), { recursive: true });
      const result = Bun.spawnSync(
        [
          "bun",
          path.join(import.meta.dir, "slots.ts"),
          "--acquire",
          "--run",
          "run-blocked",
          "--anchor",
          String(process.pid),
          "--ticket",
          "T-1",
        ],
        {
          cwd: repo,
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, EMET_STATE_DIR: stateDirectory, EMET_MEM_RESERVE_GIB: "0.001" },
        },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain("acquired slot");
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(stateDirectory, { recursive: true, force: true });
    }
  });
});

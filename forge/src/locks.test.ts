import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  acquireLock,
  didAcquireLock,
  HOLDERLESS_LOCK_GRACE_MS,
  isLockStale,
  type LockHolder,
  readLockHolder,
  releaseLock,
} from "./locks";
import { errorMessage } from "./narrow";

/**
 * Builds a fresh holder the same way a real caller's `buildHolder` would —
 * `process.pid`/`process.cwd()` are both trivially "alive" and "exists" from
 * this test process's own point of view, which is exactly what the
 * round-trip and racing tests need.
 */
function buildHolder(overrides: Partial<LockHolder> = {}): LockHolder {
  return {
    pid: process.pid,
    worktree: process.cwd(),
    acquiredAt: Date.now(),
    ...overrides,
  };
}

describe("forge-locks", () => {
  let temporaryRoot: string;
  let lockDirectory: string;

  beforeEach(() => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), "forge-locks-test-"));
    lockDirectory = path.join(temporaryRoot, "test.lock");
  });

  afterEach(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  describe("didAcquireLock / releaseLock", () => {
    test("acquire/release round trip: creates holder.json, then removes the directory", () => {
      const holder = buildHolder();
      expect(didAcquireLock(lockDirectory, holder)).toBe(true);
      expect(existsSync(lockDirectory)).toBe(true);
      expect(readLockHolder(lockDirectory)).toEqual(holder);

      releaseLock(lockDirectory);
      expect(existsSync(lockDirectory)).toBe(false);
    });

    test("two acquires racing: the second mkdirSync loses to EEXIST and returns false", () => {
      expect(didAcquireLock(lockDirectory, buildHolder())).toBe(true);
      expect(didAcquireLock(lockDirectory, buildHolder())).toBe(false);
      /**
       * The first holder's record must survive the losing second attempt.
       */
      expect(readLockHolder(lockDirectory)?.pid).toBe(process.pid);
    });

    test("a lock directory never exists without holder.json and leaves no staging directory", () => {
      expect(didAcquireLock(lockDirectory, buildHolder())).toBe(true);
      expect(existsSync(path.join(lockDirectory, "holder.json"))).toBe(true);
      expect(readdirSync(temporaryRoot)).toEqual(["test.lock"]);
      expect(didAcquireLock(lockDirectory, buildHolder({ pid: 1 }))).toBe(false);
      expect(readLockHolder(lockDirectory)?.pid).toBe(process.pid);
      expect(readdirSync(temporaryRoot)).toEqual(["test.lock"]);
    });

    test("releaseLock is idempotent, matching --unlock force-releasing a lock that may already be gone", () => {
      didAcquireLock(lockDirectory, buildHolder());
      releaseLock(lockDirectory);
      expect(existsSync(lockDirectory)).toBe(false);
      expect(() => releaseLock(lockDirectory)).not.toThrow();
    });

    test("releaseLock leaves no trash directory behind", () => {
      didAcquireLock(lockDirectory, buildHolder());
      releaseLock(lockDirectory);
      expect(readdirSync(temporaryRoot)).toEqual([]);
    });
  });

  describe("isLockStale", () => {
    test("a freshly created holder-less lock directory is not stale within the grace period", () => {
      mkdirSync(lockDirectory);
      expect(isLockStale(lockDirectory, 999_999_999)).toBe(false);
    });

    test("a holder-less lock directory older than the grace period is stale", () => {
      mkdirSync(lockDirectory);
      const old = new Date(Date.now() - HOLDERLESS_LOCK_GRACE_MS - 1000);
      utimesSync(lockDirectory, old, old);
      expect(isLockStale(lockDirectory, 999_999_999)).toBe(true);
    });

    test("a lock held by a live pid, well within maxAgeMs, is not stale", () => {
      didAcquireLock(lockDirectory, buildHolder());
      expect(isLockStale(lockDirectory, 999_999_999)).toBe(false);
    });
  });

  describe("acquireLock", () => {
    test("reclaims a lock whose holder pid is dead", async () => {
      const deadProcess = Bun.spawn(["true"]);
      await deadProcess.exited;
      const staleHolder: LockHolder = {
        pid: deadProcess.pid,
        worktree: path.join(temporaryRoot, "gone-worktree"),
        acquiredAt: Date.now(),
      };
      mkdirSync(lockDirectory);
      writeFileSync(path.join(lockDirectory, "holder.json"), JSON.stringify(staleHolder));

      await acquireLock(lockDirectory, buildHolder, {
        timeoutMs: 2000,
        pollIntervalMs: 10,
        maxAgeMs: 999_999_999,
        logLabel: "test",
      });

      expect(readLockHolder(lockDirectory)?.pid).toBe(process.pid);
    });

    test("reclaims a lock past maxAgeMs once its recorded worktree no longer exists", async () => {
      const staleHolder: LockHolder = {
        pid: process.pid,
        worktree: path.join(temporaryRoot, "gone-worktree"),
        acquiredAt: Date.now() - 10_000,
      };
      mkdirSync(lockDirectory);
      writeFileSync(path.join(lockDirectory, "holder.json"), JSON.stringify(staleHolder));

      await acquireLock(lockDirectory, buildHolder, {
        timeoutMs: 2000,
        pollIntervalMs: 10,
        maxAgeMs: 1000,
        logLabel: "test",
      });

      expect(readLockHolder(lockDirectory)?.pid).toBe(process.pid);
    });

    test("never reclaims a lock held by a live, fresh holder — it times out instead", async () => {
      didAcquireLock(lockDirectory, buildHolder());

      /**
       * A plain try/catch, not `expect(...).rejects`, because this
       * assertion must genuinely wait out `acquireLock`'s real
       * `Bun.sleep`-based poll — unlike the other tests here, there is no
       * synchronous fake clock to make an un-awaited floating assertion
       * settle in time.
       */
      let thrownError: unknown;
      try {
        await acquireLock(lockDirectory, buildHolder, {
          timeoutMs: 50,
          pollIntervalMs: 10,
          maxAgeMs: 999_999_999,
          logLabel: "test",
        });
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(Error);
      expect(errorMessage(thrownError)).toMatch(/timed out/);
    });
  });
});

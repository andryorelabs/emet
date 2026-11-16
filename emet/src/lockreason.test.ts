import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ForgeConfigError } from "./config";
import {
  DEFAULT_LOCK_REASON_TEMPLATE,
  buildLockReason,
  readLockReasonTemplate,
  run,
  type LockReasonFields,
} from "./lockreason";
import { errorMessage } from "./narrow";
import * as runs from "./runs";
import { resolveWorktreeOwner } from "./worktrees";

/**
 * The contract under test is a round trip, not a string: whatever
 * {@link buildLockReason} emits must come back out of
 * {@link resolveWorktreeOwner} — the same parser `preflight`/`cleanup` use —
 * as the fields that went in. Asserting the literal format would pass just
 * as happily if the parser and the builder drifted apart together, which is
 * the only failure mode that actually matters here.
 */

const FIELDS: LockReasonFields = {
  runId: "run-abc123",
  ticket: "AO-321",
  anchorPid: 4242,
  coordinatorSlug: "-home-andryore-code-repo",
  iso: "2026-09-15T12:00:00.000Z",
};

function parse(reason: string) {
  return resolveWorktreeOwner({
    directory: "/repo/.claude/worktrees/agent-a",
    branch: null,
    lockedReason: reason,
  });
}

describe("buildLockReason", () => {
  test("round-trips every field through the real parser", () => {
    const owner = parse(buildLockReason(FIELDS));
    expect(owner).toEqual({
      runId: "run-abc123",
      ticket: "AO-321",
      anchorPid: 4242,
      at: "2026-09-15T12:00:00.000Z",
      coordinatorSlug: "-home-andryore-code-repo",
    });
  });

  test("writes the emet token", () => {
    expect(buildLockReason(FIELDS)).toBe(
      "emet run=run-abc123 ticket=AO-321 anchor=4242 slug=-home-andryore-code-repo at=2026-09-15T12:00:00.000Z",
    );
  });

  test("still accepts a legacy override that keeps the forge token", () => {
    const reason = buildLockReason(
      FIELDS,
      "forge run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}",
    );
    expect(parse(reason)?.ticket).toBe("AO-321");
  });

  test("names the emet binary in its errors", () => {
    expect(() => buildLockReason({ ...FIELDS, anchorPid: 0 })).toThrow(/^emet lock-reason: /);
  });

  test("the default template carries the slug — the whole point of the command", () => {
    expect(DEFAULT_LOCK_REASON_TEMPLATE).toContain("slug={coordinatorSlug}");
    expect(parse(buildLockReason(FIELDS))?.coordinatorSlug).toBe("-home-andryore-code-repo");
  });

  test("accepts an override that adds a field, as the schema invites", () => {
    const reason = buildLockReason(FIELDS, `${DEFAULT_LOCK_REASON_TEMPLATE} wave=3`);
    expect(parse(reason)?.ticket).toBe("AO-321");
    expect(reason).toContain("wave=3");
  });

  test("rejects an override that drops a required field", () => {
    expect(() =>
      buildLockReason(FIELDS, "forge run={runId} ticket={ticket} slug={coordinatorSlug} at={iso}"),
    ).toThrow(/does not round-trip/);
  });

  test("rejects an override that drops the literal lock token", () => {
    expect(() =>
      buildLockReason(
        FIELDS,
        "run={runId} ticket={ticket} anchor={anchorPid} slug={coordinatorSlug} at={iso}",
      ),
    ).toThrow(/does not round-trip/);
  });

  /**
   * A template keeping all four originals still parses, so the round-trip
   * check above passes — this is the separate, more pointed failure for the
   * one field whose absence is silent rather than fatal.
   */
  test("rejects an override that drops only the slug", () => {
    expect(() =>
      buildLockReason(FIELDS, "forge run={runId} ticket={ticket} anchor={anchorPid} at={iso}"),
    ).toThrow(/drops the slug/);
  });

  test("rejects a slug containing whitespace instead of emitting a corrupt reason", () => {
    expect(() => buildLockReason({ ...FIELDS, coordinatorSlug: "-home-my user-code" })).toThrow(
      /slug contains whitespace/,
    );
  });

  test("rejects a ticket containing whitespace", () => {
    expect(() => buildLockReason({ ...FIELDS, ticket: "AO 321" })).toThrow(
      /ticket contains whitespace/,
    );
  });

  test.each([0, -1, 1.5, Number.NaN])(
    "rejects a non-positive-integer anchor pid (%p)",
    (anchorPid) => {
      expect(() => buildLockReason({ ...FIELDS, anchorPid })).toThrow(
        /--anchor must be a positive integer/,
      );
    },
  );

  test("every rejection is a ForgeConfigError, so the CLI exits 2 not 1", () => {
    let caught: unknown;
    try {
      buildLockReason({ ...FIELDS, anchorPid: 0 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForgeConfigError);
  });
});

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("readLockReasonTemplate", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "forge-lockreason-test-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  async function writeConfig(value: unknown): Promise<void> {
    await Bun.write(
      path.join(repoRoot, "forge.config.json"),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }

  test("falls back to the built-in template with no config file", async () => {
    expect(await readLockReasonTemplate(repoRoot)).toBe(DEFAULT_LOCK_REASON_TEMPLATE);
  });

  test("falls back to the built-in template with no worktree block", async () => {
    await writeConfig({ repo: { trunk: "main" } });
    expect(await readLockReasonTemplate(repoRoot)).toBe(DEFAULT_LOCK_REASON_TEMPLATE);
  });

  test("returns a repo's own override", async () => {
    const template = `${DEFAULT_LOCK_REASON_TEMPLATE} wave={runId}`;
    await writeConfig({ worktree: { lockReason: template } });
    expect(await readLockReasonTemplate(repoRoot)).toBe(template);
  });

  test("reads emet.config.json before the legacy forge.config.json", async () => {
    const legacyTemplate = `${DEFAULT_LOCK_REASON_TEMPLATE} source=legacy`;
    const currentTemplate = `${DEFAULT_LOCK_REASON_TEMPLATE} source=current`;
    await writeConfig({ worktree: { lockReason: legacyTemplate } });
    expect(await readLockReasonTemplate(repoRoot)).toBe(legacyTemplate);
    await Bun.write(
      path.join(repoRoot, "emet.config.json"),
      JSON.stringify({ worktree: { lockReason: currentTemplate } }),
    );
    expect(await readLockReasonTemplate(repoRoot)).toBe(currentTemplate);
  });

  test("throws on malformed JSON rather than silently using the default", async () => {
    await writeConfig("{not json");
    const error = await captureRejection(readLockReasonTemplate(repoRoot));
    expect(error).toBeInstanceOf(ForgeConfigError);
  });

  test("throws on a non-string override", async () => {
    await writeConfig({ worktree: { lockReason: 42 } });
    const error = await captureRejection(readLockReasonTemplate(repoRoot));
    expect(errorMessage(error)).toMatch(/must be a non-empty string/);
  });
});

describe("run", () => {
  let workdir: string;
  let originalCwd: string;
  let logged: string[];
  let errored: unknown[];
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalExitCode = process.exitCode;
    process.exitCode = 0;
    workdir = mkdtempSync(path.join(os.tmpdir(), "emet-lockreason-run-"));
    logged = [];
    errored = [];
    spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.join(" "));
    });
    spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errored.push(args[0]);
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    rmSync(workdir, { recursive: true, force: true });
    mock.restore();
  });

  function initRepo(): void {
    Bun.spawnSync(["git", "init", "-q", workdir]);
    process.chdir(workdir);
  }

  test("prints usage and exits 2 without arguments or with --help", async () => {
    await run([]);
    expect(process.exitCode).toBe(2);
    expect(String(errored[0])).toContain("usage: emet lock-reason --run");
    process.exitCode = 0;
    await run(["--help"]);
    expect(process.exitCode).toBe(2);
  });

  test("exits 2 outside a git repository", async () => {
    process.chdir(workdir);
    await run(["--run", "r1", "--ticket", "T-1"]);
    expect(process.exitCode).toBe(2);
    expect(String(errored[0])).toContain("not inside a git repository");
  });

  test("exits 2 when --run or --ticket is missing or lacks a value", async () => {
    initRepo();
    await run(["--ticket", "T-1"]);
    expect(process.exitCode).toBe(2);
    expect(String(errored[0])).toContain("--run requires a value");
    process.exitCode = 0;
    await run(["--run", "r1", "--ticket", "--anchor"]);
    expect(process.exitCode).toBe(2);
    expect(String(errored[1])).toContain("--ticket requires a value");
  });

  test("prints a reason that round-trips, using an explicit anchor", async () => {
    initRepo();
    await run(["--run", "r1", "--ticket", "T-1", "--anchor", "4242"]);
    expect(process.exitCode).toBe(0);
    expect(logged).toHaveLength(1);
    const owner = parse(logged[0] ?? "");
    expect(owner?.runId).toBe("r1");
    expect(owner?.ticket).toBe("T-1");
    expect(owner?.anchorPid).toBe(4242);
  });

  test("defaults the anchor to a positive pid and honours a config template", async () => {
    initRepo();
    writeFileSync(
      path.join(workdir, "emet.config.json"),
      JSON.stringify({
        worktree: {
          lockReason:
            "emet ticket={ticket} run={runId} anchor={anchorPid} slug={coordinatorSlug} at={iso}",
        },
      }),
    );
    spyOn(runs, "resolveAnchorPid").mockReturnValue(4242);
    await run(["--run", "r1", "--ticket", "T-1"]);
    expect(process.exitCode).toBe(0);
    expect(logged[0]?.startsWith("emet ticket=T-1 run=r1 anchor=")).toBe(true);
    expect(parse(logged[0] ?? "")?.anchorPid).toBeGreaterThan(0);
  });

  test("exits 2 for an invalid anchor pid", async () => {
    initRepo();
    await run(["--run", "r1", "--ticket", "T-1", "--anchor", "abc"]);
    expect(process.exitCode).toBe(2);
    expect(String(errored[0])).toContain("--anchor must be a positive integer pid");
    expect(logged).toHaveLength(0);
  });

  test("exits 1 and logs the raw error for an unexpected failure", async () => {
    initRepo();
    writeFileSync(path.join(workdir, "emet.config.json"), "{}");
    const boom = new Error("disk exploded");
    const fileSpy = spyOn(Bun, "file").mockImplementation(() => {
      throw boom;
    });
    try {
      await run(["--run", "r1", "--ticket", "T-1", "--anchor", "7"]);
    } finally {
      fileSpy.mockRestore();
    }
    expect(process.exitCode).toBe(1);
    expect(errored[0]).toBe(boom);
  });
});

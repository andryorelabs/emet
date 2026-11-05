import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ForgeConfigError } from "./config";
import {
  DEFAULT_LOCK_REASON_TEMPLATE,
  buildLockReason,
  readLockReasonTemplate,
  type LockReasonFields,
} from "./lockreason";
import { resolveWorktreeOwner } from "./worktrees";
import { errorMessage } from "./narrow";

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

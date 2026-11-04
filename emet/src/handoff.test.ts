import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * `handoff.ts` previously had no test file at all — this file's own doc
 * comment used to call it out as "the only one of the nine modules that had
 * this gap". `checkHandoff`/`parseSections`/`ticketReferenceFromPath` aren't
 * exported (this module's public surface is `run()`, invoked by
 * `bin/emet.ts`), so these tests drive it the same way the CLI does: real
 * `.emet/handoff-<ticket>.md` files under a tmpdir, checked via
 * `run(['--check', path])`/`run(['--render', path])` and asserted against
 * captured stdout/stderr and `process.exitCode`.
 */
import { run } from "./handoff";

let directory: string;
let logs: string[];
let errors: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;

beforeEach(() => {
  /**
   * Deliberately avoids the literal substring "handoff-" in the tmpdir
   * prefix: `ticketReferenceFromPath`'s regex (`/handoff-(.+)\.md$/i`) is
   * unanchored, and a prefix containing it would match *inside the tmpdir
   * path itself* before ever reaching the real `handoff-<ticket>.md`
   * basename this suite writes.
   */
  directory = mkdtempSync(path.join(os.tmpdir(), "forge-checkpoint-test-"));
  /**
   * Reset to `0`, never `undefined`: once `process.exitCode` has been set to
   * a real number anywhere in this (shared, bun:test-managed) process, Bun
   * silently ignores a later assignment of `undefined` — it does not clear
   * back to "unset" the way Node's own docs describe. `run()`'s own success
   * path never touches `process.exitCode` at all, so `0` is what a clean run
   * leaves behind here, and every "clean" assertion below checks for `0`,
   * never `toBeUndefined()`.
   */
  process.exitCode = 0;
  logs = [];
  errors = [];
  originalLog = console.log;
  originalError = console.error;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  rmSync(directory, { recursive: true, force: true });
});

const VALID_HANDOFF = [
  "state: implementing",
  "done: wired the /login route",
  "next: add the refresh-token test",
  "dead-ends: tried a middleware guard, reverted — broke the health check",
  "invariants: session cookie is httpOnly",
  "files: src/auth/login.ts",
  "commands: bun test src/auth",
].join("\n");

async function writeHandoff(ticket: string, content: string): Promise<string> {
  const filePath = path.join(directory, `handoff-${ticket}.md`);
  await Bun.write(filePath, content);
  return filePath;
}

describe("emet handoff --check", () => {
  test("passes a well-formed handoff note", async () => {
    const filePath = await writeHandoff("AO-321", VALID_HANDOFF);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(0);
    /**
     * `errors` may carry `run()`'s own "no forge.config.json — using
     * defaults" note (this test's cwd is inside a real repo with no config
     * at its root) — that's not a validation problem, so only assert no
     * `checkHandoff` problem line was printed.
     */
    expect(errors.join("\n")).not.toMatch(/--check failed/);
    expect(logs.join("\n")).toMatch(/--check OK/);
  });

  test("fails when a required section is missing", async () => {
    const withoutFiles = VALID_HANDOFF.split("\n")
      .filter((line) => !line.startsWith("files:"))
      .join("\n");
    const filePath = await writeHandoff("AO-322", withoutFiles);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/missing or empty required section "files:"/);
  });

  test("fails when a required section is present but empty", async () => {
    const emptyCommands = VALID_HANDOFF.replace("commands: bun test src/auth", "commands:");
    const filePath = await writeHandoff("AO-323", emptyCommands);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/missing or empty required section "commands:"/);
  });

  test("fails on a state outside the valid vocabulary", async () => {
    const badState = VALID_HANDOFF.replace("state: implementing", "state: paused");
    const filePath = await writeHandoff("AO-324", badState);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/"state: paused" is not one of/);
  });

  /**
   * `dead-ends` is itself one of `REQUIRED_SECTIONS` — empty always fails
   * the generic "missing or empty required section" check regardless of
   * state. The state-specific message below is strictly additional: it only
   * ever fires *alongside* that generic one (never instead of it), and only
   * for a still-open ticket — this is the field the whole handoff mechanism
   * pays for, so a still-open ticket gets a second, more pointed message
   * than "done" does for the exact same empty section.
   */
  test("an empty dead-ends section on a still-open ticket fails with both the generic and the state-specific message", async () => {
    const noDeadEnds = VALID_HANDOFF.replace(
      "dead-ends: tried a middleware guard, reverted — broke the health check",
      "dead-ends:",
    );
    const filePath = await writeHandoff("AO-325", noDeadEnds);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    const combined = errors.join("\n");
    expect(combined).toMatch(/missing or empty required section "dead-ends:"/);
    expect(combined).toMatch(/state is "implementing" but "dead-ends:" is empty/);
  });

  test('an empty dead-ends section on a "done" ticket fails only with the generic message, not the state-specific one', async () => {
    const done = VALID_HANDOFF.replace("state: implementing", "state: done").replace(
      "dead-ends: tried a middleware guard, reverted — broke the health check",
      "dead-ends:",
    );
    const filePath = await writeHandoff("AO-326", done);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    const combined = errors.join("\n");
    expect(combined).toMatch(/missing or empty required section "dead-ends:"/);
    expect(combined).not.toMatch(/but "dead-ends:" is empty/);
  });

  test("fails a note over the configured line budget", async () => {
    const filler = Array.from({ length: 65 }, (_, index) => `padding line ${index}`).join("\n");
    const filePath = await writeHandoff("AO-327", `${VALID_HANDOFF}\nfiles: ${filler}`);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/exceeds the 60-line budget/);
  });

  test("reports every violation at once, not just the first", async () => {
    const filePath = await writeHandoff("AO-328", "state: bogus\n");
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    const combined = errors.join("\n");
    expect(combined).toMatch(/"state: bogus" is not one of/);
    expect(combined).toMatch(/missing or empty required section "done:"/);
    expect(combined).toMatch(/missing or empty required section "dead-ends:"/);
  });

  test("fails with exit 1 and no throw when the file does not exist", async () => {
    await run(["--check", path.join(directory, "handoff-AO-999.md")]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/not found/);
  });

  test("usage error on a missing path or unknown mode", async () => {
    await run(["--check"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/usage: emet handoff/);
  });
});

describe("emet handoff --render", () => {
  test("renders a heading with the ticket extracted from the filename", async () => {
    const filePath = await writeHandoff("AO-321", VALID_HANDOFF);
    await run(["--render", filePath]);
    expect(logs.join("\n")).toMatch(/^## Handoff — AO-321/);
    expect(logs.join("\n")).toContain(VALID_HANDOFF.trim());
  });

  test("does not validate — a broken note still renders", async () => {
    const filePath = await writeHandoff("AO-329", "state: bogus\n");
    await run(["--render", filePath]);
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toMatch(/## Handoff — AO-329/);
  });
});

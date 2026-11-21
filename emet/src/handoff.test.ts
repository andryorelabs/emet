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

  describe("skills section", () => {
    const DONE = VALID_HANDOFF.replace("state: implementing", "state: done");

    test("a done handoff without skills fails and shows the expected format", async () => {
      const filePath = await writeHandoff("AO-330", DONE);
      await run(["--check", filePath]);
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toMatch(/"skills:" is required[\s\S]*loaded: a, b; missing: c/);
    });

    test("a non-done handoff may omit skills", async () => {
      const filePath = await writeHandoff("AO-331", VALID_HANDOFF);
      await run(["--check", filePath]);
      expect(process.exitCode).toBe(0);
    });

    test("a done handoff with skills none passes", async () => {
      const filePath = await writeHandoff("AO-332", `${DONE}\nskills: none`);
      await run(["--check", filePath]);
      expect(process.exitCode).toBe(0);
    });

    test("a malformed skills value fails", async () => {
      const filePath = await writeHandoff("AO-333", `${DONE}\nskills: tdd`);
      await run(["--check", filePath]);
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toMatch(/"skills: tdd" must be/);
    });

    test("expected skills in loaded or missing pass and missing ones are printed", async () => {
      const filePath = await writeHandoff(
        "AO-334",
        `${DONE}\nskills: loaded: tdd; missing: codebase-design`,
      );
      await run(["--check", filePath, "--expect-skills", "tdd,codebase-design"]);
      expect(process.exitCode).toBe(0);
      expect(logs.join("\n")).toMatch(/--check OK/);
      expect(logs.join("\n")).toMatch(/missing skills: codebase-design/);
    });

    test("an expected skill in neither list fails and names it", async () => {
      const filePath = await writeHandoff("AO-335", `${DONE}\nskills: loaded: tdd; missing: x`);
      await run(["--check", filePath, "--expect-skills", "tdd,other"]);
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toMatch(/expected skill "other"/);
    });

    test("expect-skills tolerates spaces, duplicates and empty entries", async () => {
      const filePath = await writeHandoff("AO-336", `${DONE}\nskills: loaded: tdd; missing: none`);
      await run(["--check", filePath, "--expect-skills", " tdd , tdd,,"]);
      expect(process.exitCode).toBe(0);
    });

    test("a multi-line skills value does not swallow the next section", async () => {
      const content = `${DONE.replace("files: src/auth/login.ts", "")}\nskills:\n  loaded: tdd;\n  missing: none\nfiles: src/auth/login.ts`;
      const filePath = await writeHandoff("AO-337", content);
      await run(["--check", filePath, "--expect-skills", "tdd"]);
      expect(process.exitCode).toBe(0);
    });

    test("an expect-skills value of none is ignored for a done handoff with skills none", async () => {
      const filePath = await writeHandoff("AO-339", `${DONE}\nskills: none`);
      await run(["--check", filePath, "--expect-skills", "none"]);
      expect(process.exitCode).toBe(0);
    });

    test("an empty expect-skills list is ignored", async () => {
      const filePath = await writeHandoff("AO-338", VALID_HANDOFF);
      await run(["--check", filePath, "--expect-skills", ""]);
      expect(process.exitCode).toBe(0);
    });
  });

  test("fails a note over the configured line budget", async () => {
    const filler = Array.from({ length: 65 }, (_, index) => `padding line ${index}`).join("\n");
    const filePath = await writeHandoff("AO-327", `${VALID_HANDOFF}\nfiles: ${filler}`);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/exceeds the 60-line budget/);
  });

  test("fails a note over the configured character budget", async () => {
    const wide = "x".repeat(8100);
    const filePath = await writeHandoff("AO-328", `${VALID_HANDOFF}\nfiles: ${wide}`);
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toMatch(/chars exceeds the ~8000-char/);
  });

  test("logs the error and exits 1 when the command throws", async () => {
    const filePath = await writeHandoff("AO-329", VALID_HANDOFF);
    console.log = () => {
      throw new Error("stdout closed");
    };
    await run(["--check", filePath]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("stdout closed");
  });

  test("falls back to the default config outside a git repository", async () => {
    const filePath = await writeHandoff("AO-330", VALID_HANDOFF);
    const originalCwd = process.cwd();
    process.chdir(directory);
    try {
      await run(["--check", filePath]);
    } finally {
      process.chdir(originalCwd);
    }
    expect(process.exitCode).toBe(0);
    expect(logs.join("\n")).toContain("--check OK");
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

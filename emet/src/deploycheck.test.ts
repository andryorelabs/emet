import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { run } from "./deploycheck";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("deploy-check skeleton", () => {
  test("exits 2 with a not implemented message", async () => {
    const errors: string[] = [];
    const spy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.join(" "));
    });
    await run([]);
    spy.mockRestore();
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("not implemented");
  });
});

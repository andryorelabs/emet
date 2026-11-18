import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { run } from "./ci";

describe("ci skeleton", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0;
  });

  test("exits 2 with a not implemented message", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await run([]);
      expect(process.exitCode).toBe(2);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("not implemented");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

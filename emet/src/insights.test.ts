import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { run } from "./insights";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode ?? 0;
});

describe("insights skeleton", () => {
  test("sets the usage exit code and says it is not implemented", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    await run([]);
    expect(process.exitCode).toBe(2);
    expect(errorSpy.mock.calls[0]?.[0]).toContain("not implemented");
    errorSpy.mockRestore();
  });
});

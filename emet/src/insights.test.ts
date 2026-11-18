import { describe, expect, spyOn, test } from "bun:test";

import { run } from "./insights";

describe("insights skeleton", () => {
  test("exits 2 with a not implemented message", () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`exit ${code}`);
    });
    expect(() => run([])).toThrow("exit 2");
    expect(errorSpy.mock.calls[0]?.[0]).toContain("not implemented");
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

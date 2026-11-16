import { describe, expect, test } from "bun:test";

import { currentExitCode } from "./exit-code";

describe("currentExitCode", () => {
  test("reads the exit code and defaults an unset one to 0", () => {
    const original = process.exitCode;
    try {
      process.exitCode = undefined;
      expect(currentExitCode()).toBe(0);
      process.exitCode = 3;
      expect(currentExitCode()).toBe(3);
    } finally {
      process.exitCode = original;
    }
  });
});

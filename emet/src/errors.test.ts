import { describe, expect, test } from "bun:test";

import { EmetError, exitCodeFor } from "./errors";
import { exitCodes } from "./exit-codes";

describe("EmetError", () => {
  test("carries code, fix and exit code", () => {
    const error = new EmetError("land-usage", "bad", "fix it", exitCodes.usage);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("land-usage");
    expect(error.fix).toBe("fix it");
    expect(error.exitCode).toBe(2);
    expect(error.message).toBe("bad");
  });

  test("defaults to the internal exit code", () => {
    expect(new EmetError("internal", "x", "y").exitCode).toBe(exitCodes.internal);
  });
});

describe("exitCodeFor", () => {
  test("uses the error's exit code", () => {
    expect(exitCodeFor(new EmetError("land-refused", "x", "y", exitCodes.findings))).toBe(1);
  });

  test("maps unknown throws to internal", () => {
    expect(exitCodeFor(new Error("boom"))).toBe(3);
    expect(exitCodeFor("boom")).toBe(3);
  });
});

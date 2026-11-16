import { describe, expect, test } from "bun:test";

import { commandOutcomes, exitCodes } from "./exit-codes";

describe("exit code map", () => {
  test("keeps the documented numbers", () => {
    expect(exitCodes).toEqual({ success: 0, findings: 1, usage: 2, internal: 3, interrupted: 130 });
    expect(commandOutcomes.ask).toEqual({ sliceTimeout: 3, expired: 4 });
    expect(commandOutcomes["review-package"]).toEqual({ badRange: 3 });
  });
});

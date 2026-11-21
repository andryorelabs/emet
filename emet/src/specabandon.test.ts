import { describe, expect, spyOn, test } from "bun:test";

import { DEFAULT_FORGE_CONFIG } from "./config";
import { exitCodes } from "./exit-codes";
import { runAbandon } from "./specabandon";
import type { SpecBranchContext } from "./specbranch";

const context: SpecBranchContext = {
  root: "/nonexistent",
  spec: "1",
  config: DEFAULT_FORGE_CONFIG,
  trunk: "main",
};

describe("spec abandon stub", () => {
  test("abandon exits with findings and says it is not implemented", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runAbandon([], context)).toBe(exitCodes.findings);
    expect(errors.mock.calls[0]?.[0]).toContain("not implemented");
    errors.mockRestore();
  });
});

import { describe, expect, spyOn, test } from "bun:test";

import { DEFAULT_FORGE_CONFIG } from "./config";
import { exitCodes } from "./exit-codes";
import type { SpecBranchContext } from "./specbranch";
import { runLand, runSync } from "./speclanding";

const context: SpecBranchContext = {
  root: "/nonexistent",
  spec: "1",
  config: DEFAULT_FORGE_CONFIG,
  trunk: "main",
};

describe("spec landing stubs", () => {
  test("sync exits with findings and says it is not implemented", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runSync([], context)).toBe(exitCodes.findings);
    expect(errors.mock.calls[0]?.[0]).toContain("not implemented");
    errors.mockRestore();
  });

  test("land exits with findings and says it is not implemented", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runLand([], context)).toBe(exitCodes.findings);
    expect(errors.mock.calls[0]?.[0]).toContain("not implemented");
    errors.mockRestore();
  });
});

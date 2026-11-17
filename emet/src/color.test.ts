import { describe, expect, it } from "bun:test";

import { isColorEnabled } from "./color";

const base = { env: {}, isTTY: true, noColorFlag: false };

describe("isColorEnabled", () => {
  it("is on for a TTY with a clean environment", () => {
    expect(isColorEnabled(base)).toBe(true);
  });

  it("is off without a TTY", () => {
    expect(isColorEnabled({ ...base, isTTY: false })).toBe(false);
  });

  it("is off under --no-color even with FORCE_COLOR", () => {
    expect(isColorEnabled({ ...base, noColorFlag: true, env: { FORCE_COLOR: "1" } })).toBe(false);
  });

  it("is off when NO_COLOR is set, even with FORCE_COLOR", () => {
    expect(isColorEnabled({ ...base, env: { NO_COLOR: "1", FORCE_COLOR: "1" } })).toBe(false);
  });

  it("ignores an empty NO_COLOR", () => {
    expect(isColorEnabled({ ...base, env: { NO_COLOR: "" } })).toBe(true);
  });

  it("is forced on by FORCE_COLOR without a TTY", () => {
    expect(isColorEnabled({ ...base, isTTY: false, env: { FORCE_COLOR: "1" } })).toBe(true);
  });

  it("treats FORCE_COLOR=0 as unset", () => {
    expect(isColorEnabled({ ...base, isTTY: false, env: { FORCE_COLOR: "0" } })).toBe(false);
  });

  it("is off for TERM=dumb", () => {
    expect(isColorEnabled({ ...base, env: { TERM: "dumb" } })).toBe(false);
  });
});

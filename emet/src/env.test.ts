import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { activeEnvName, ENV_VARS, readEnv, resetLegacyWarnings, snapshotEnv } from "./env";

afterEach(() => {
  resetLegacyWarnings();
});

describe("readEnv", () => {
  test("prefers the EMET_ spelling over FORGE_", () => {
    const env = { EMET_STATE_DIR: "/new", FORGE_STATE_DIR: "/old" };
    expect(readEnv("EMET_STATE_DIR", env)).toBe("/new");
  });

  test("falls back to FORGE_ and warns once", () => {
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const env = { FORGE_STATE_DIR: "/old" };
      expect(readEnv("EMET_STATE_DIR", env)).toBe("/old");
      expect(readEnv("EMET_STATE_DIR", env)).toBe("/old");
      expect(write).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
    }
  });

  test("treats an empty value as unset", () => {
    expect(readEnv("EMET_STATE_DIR", { EMET_STATE_DIR: "" })).toBeUndefined();
  });

  test("reads a variable with no legacy spelling", () => {
    expect(readEnv("CODEX_HOME", { CODEX_HOME: "/codex" })).toBe("/codex");
    expect(readEnv("CODEX_HOME", { FORGE_CODEX_HOME: "/x" })).toBeUndefined();
  });

  test("defaults to the process environment", () => {
    expect(readEnv("CODEX_HOME")).toBe(readEnv("CODEX_HOME", process.env));
  });
});

describe("activeEnvName", () => {
  test("names the spelling that is set", () => {
    expect(activeEnvName("EMET_STATE_DIR", { EMET_STATE_DIR: "/a" })).toBe("EMET_STATE_DIR");
    expect(activeEnvName("EMET_STATE_DIR", { FORGE_STATE_DIR: "/a" })).toBe("FORGE_STATE_DIR");
    expect(activeEnvName("EMET_STATE_DIR", {})).toBeUndefined();
  });
});

describe("snapshotEnv", () => {
  test("copies the given environment", () => {
    const source = { A: "1" };
    const copy = snapshotEnv(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
  });
});

describe("ENV_VARS", () => {
  test("has unique names and a summary each", () => {
    const names = ENV_VARS.map((variable) => variable.name);
    expect(new Set(names).size).toBe(names.length);
    for (const variable of ENV_VARS) expect(variable.summary.length).toBeGreaterThan(0);
  });
});

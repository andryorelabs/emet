import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { binaryName, buildBinary, parseArguments, readPluginVersion } from "./build-binaries";

describe("build-binaries helpers", () => {
  test("binaryName drops the bun- prefix", () => {
    expect(binaryName("bun-darwin-arm64")).toBe("emet-darwin-arm64");
  });

  test("parseArguments defaults to all four targets", () => {
    expect(parseArguments([])).toEqual({
      targets: ["bun-linux-x64", "bun-linux-arm64", "bun-darwin-x64", "bun-darwin-arm64"],
      outdir: "dist",
    });
  });

  test("parseArguments accepts one target and an outdir", () => {
    expect(parseArguments(["--target", "bun-linux-x64", "--outdir", "out"])).toEqual({
      targets: ["bun-linux-x64"],
      outdir: "out",
    });
  });

  test("parseArguments rejects unknown targets and flags", () => {
    expect(() => parseArguments(["--target", "bun-windows-x64"])).toThrow("unsupported target");
    expect(() => parseArguments(["--nope"])).toThrow("unknown argument");
    expect(() => parseArguments(["--outdir"])).toThrow("needs a value");
  });

  test("readPluginVersion reads plugin.json and falls back to the dev version", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "emet-version-"));
    try {
      expect(readPluginVersion(root)).toBe("0.0.0-dev");
      mkdirSync(path.join(root, ".claude-plugin"));
      writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), "{}");
      expect(readPluginVersion(root)).toBe("0.0.0-dev");
      writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), '{"version":"0.2.0"}');
      expect(readPluginVersion(root)).toBe("0.2.0");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "compiled binary smoke",
  () => {
    let workdir = "";
    let binary = "";

    beforeAll(async () => {
      workdir = mkdtempSync(path.join(os.tmpdir(), "emet-binary-"));
      mkdirSync(path.join(workdir, "emptybin"));
      binary = await buildBinary("bun-linux-x64", path.join(workdir, "out"), "0.2.0");
      chmodSync(binary, 0o755);
    }, 120_000);
    afterAll(() => rmSync(workdir, { recursive: true, force: true }));

    const run = (...args: string[]) =>
      Bun.spawnSync([binary, ...args], {
        cwd: workdir,
        env: { HOME: workdir, PATH: path.join(workdir, "emptybin") },
      });

    test("prints the embedded version", () => {
      const result = run("--version");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString().trim()).toBe("0.2.0");
    });

    test("selftest refuses inside a binary", () => {
      const result = run("selftest");
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(
        "selftest needs a source install; run emet doctor",
      );
    });

    test("init, validate --help and doctor never crash with no bun on PATH", () => {
      expect(run("init", "--help").exitCode).not.toBe(3);
      expect(run("validate", "--help").exitCode).not.toBe(3);
      const doctor = run("doctor");
      expect(doctor.exitCode).not.toBe(3);
      expect(doctor.stderr.toString()).not.toContain("Cannot find module");
    });
  },
);

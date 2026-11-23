import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { binaryName, buildBinary, main, parseArguments, readPluginVersion } from "./build-binaries";

const SCRIPT = path.resolve(import.meta.dir, "build-binaries.ts");

function failingBuild(): Promise<Bun.BuildOutput> {
  return Promise.resolve({ success: false, outputs: [], logs: [] });
}

describe("build-binaries buildBinary and entry point", () => {
  test("buildBinary passes the target and version to the build and returns the outfile", async () => {
    const calls: Bun.BuildConfig[] = [];
    const outfile = await buildBinary("bun-linux-arm64", "out-dir", "1.2.3", (config) => {
      calls.push(config);
      return Promise.resolve({ success: true, outputs: [], logs: [] });
    });
    expect(outfile).toBe(path.resolve("out-dir", "emet-linux-arm64"));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.define).toEqual({ FORGE_BUILD_VERSION: '"1.2.3"' });
  });

  test("buildBinary throws with the build logs when the build fails", async () => {
    const error = await buildBinary("bun-linux-x64", "out", "1.0.0", failingBuild).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("build failed for bun-linux-x64");
  });

  test("main builds each requested target in order and logs the paths", async () => {
    const built: string[] = [];
    const logged: string[] = [];
    await main(
      ["--outdir", "o"],
      (target, outdir, version) => {
        built.push(`${target}|${outdir}|${version}`);
        return Promise.resolve(`${outdir}/${binaryName(target)}`);
      },
      (message) => logged.push(message),
      () => 0,
    );
    expect(built).toHaveLength(4);
    expect(built[0]).toStartWith("bun-linux-x64|o|");
    expect(logged).toEqual([
      "o/emet-linux-x64",
      "o/emet-linux-arm64",
      "o/emet-darwin-x64",
      "o/emet-darwin-arm64",
    ]);
  });

  test("the entry point exits 1 on an unsupported target", () => {
    const result = Bun.spawnSync(["bun", SCRIPT, "--target", "bun-windows-x64"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("unsupported target");
  });

  test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
    "the entry point compiles one target and prints its path",
    () => {
      const outdir = mkdtempSync(path.join(os.tmpdir(), "emet-main-"));
      try {
        const result = Bun.spawnSync([
          "bun",
          SCRIPT,
          "--target",
          "bun-linux-x64",
          "--outdir",
          outdir,
        ]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString().trim()).toBe(path.join(outdir, "emet-linux-x64"));
      } finally {
        rmSync(outdir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

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
      writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), '{"version":""}');
      expect(readPluginVersion(root)).toBe("0.0.0-dev");
      writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), "null");
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
    afterAll(() => {
      rmSync(workdir, { recursive: true, force: true });
    });

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

    test("never loads the working directory's .env into the environment", () => {
      const stubBin = path.join(workdir, "stubbin");
      const probeFile = path.join(workdir, "gh-saw-token");
      mkdirSync(stubBin, { recursive: true });
      writeFileSync(
        path.join(stubBin, "gh"),
        `#!/bin/sh\nprintf '%s' "\${GITHUB_TOKEN:-unset}" > "${probeFile}"\nexit 0\n`,
      );
      chmodSync(path.join(stubBin, "gh"), 0o755);
      writeFileSync(path.join(workdir, ".env"), "GITHUB_TOKEN=from-dotenv\n");
      Bun.spawnSync([binary, "doctor"], {
        cwd: workdir,
        env: { HOME: workdir, PATH: `${stubBin}:${path.join(workdir, "emptybin")}` },
      });
      expect(existsSync(probeFile)).toBe(true);
      expect(readFileSync(probeFile, "utf8")).toBe("unset");
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

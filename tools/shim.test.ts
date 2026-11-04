import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const shimSource = path.resolve(import.meta.dir, "../bin/emet");
const version = "9.9.9";
const platform = process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const assetName = `emet-${platform}-${arch}`;
const fixtureBody = '#!/bin/sh\necho "fixture-binary $*"\n';

let workDir = "";
let pluginRoot = "";
let cacheDir = "";
let releaseDir = "";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function publishRelease(options: { checksum?: string; listAsset?: boolean } = {}): void {
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(path.join(releaseDir, assetName), fixtureBody);
  const line =
    options.listAsset === false ? "" : `${options.checksum ?? sha256(fixtureBody)}  ${assetName}\n`;
  writeFileSync(path.join(releaseDir, "SHA256SUMS"), line);
}

type ShimResult = { code: number; stdout: string; stderr: string };

function runShim(args: string[], env: Record<string, string> = {}): ShimResult {
  return runShimWithEnv(args, {
    EMET_CACHE_DIR: cacheDir,
    EMET_RELEASE_BASE_URL: `file://${path.join(workDir, "releases")}`,
    ...env,
  });
}

/** Runs the shim with only PATH, HOME and `env`: no default cache or release URL. */
function runShimWithEnv(args: string[], env: Record<string, string>): ShimResult {
  const result = Bun.spawnSync(["sh", path.join(pluginRoot, "bin/emet"), ...args], {
    env: { PATH: process.env["PATH"] ?? "", HOME: workDir, ...env },
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "emet-shim-"));
  pluginRoot = path.join(workDir, "plugin");
  cacheDir = path.join(workDir, "cache");
  releaseDir = path.join(workDir, "releases", `v${version}`);
  mkdirSync(path.join(pluginRoot, "bin"), { recursive: true });
  mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
  copyFileSync(shimSource, path.join(pluginRoot, "bin/emet"));
  writeFileSync(
    path.join(pluginRoot, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "emet", version }),
  );
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("bin/emet shim", () => {
  test("downloads, verifies, caches and execs the binary", () => {
    publishRelease();
    const result = runShim(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("fixture-binary --version\n");
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(true);
  });

  test("uses the cached binary without touching the network", () => {
    mkdirSync(path.join(cacheDir, version), { recursive: true });
    const cached = path.join(cacheDir, version, "emet");
    writeFileSync(cached, '#!/bin/sh\necho "cached $*"\n');
    chmodSync(cached, 0o755);
    const result = runShim(["guard"], { EMET_RELEASE_BASE_URL: "file:///nonexistent" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("cached guard\n");
  });

  test("a checksum mismatch exits 1 and leaves no cached binary", () => {
    publishRelease({ checksum: "0".repeat(64) });
    const result = runShim(["--version"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("checksum mismatch");
    expect(result.stdout).toBe("");
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(false);
    expect(readdirSync(path.join(cacheDir, version))).toEqual([]);
  });

  test("a missing checksum entry refuses to exec", () => {
    publishRelease({ listAsset: false });
    const result = runShim(["--version"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no checksum listed");
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(false);
  });

  test("a missing release exits non-zero with a one-line reason", () => {
    const result = runShim(["--version"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("not found");
  });

  test("EMET_PREFETCH caches the binary without running it", () => {
    publishRelease();
    const result = runShim([], { EMET_PREFETCH: "1" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(true);
  });

  test("EMET_FROM_SOURCE=1 execs the source entrypoint through bun", () => {
    const sourceEntry = path.join(pluginRoot, "emet/bin/emet.ts");
    mkdirSync(path.dirname(sourceEntry), { recursive: true });
    writeFileSync(sourceEntry, 'console.log("from-source", process.argv.slice(2).join(" "));\n');
    const bunDirectory = path.dirname(process.execPath);
    const result = runShim(["init"], {
      EMET_FROM_SOURCE: "1",
      PATH: `${bunDirectory}:${process.env["PATH"] ?? ""}`,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("from-source init\n");
  });

  test("defaults to the emet release URL and the emet asset name", () => {
    const fakeBin = path.join(workDir, "fake-bin");
    mkdirSync(fakeBin, { recursive: true });
    const curlLog = path.join(workDir, "curl.log");
    writeFileSync(
      path.join(fakeBin, "curl"),
      `#!/bin/sh\nfor arg in "$@"; do echo "$arg" >> "${curlLog}"; done\nexit 22\n`,
    );
    chmodSync(path.join(fakeBin, "curl"), 0o755);
    const result = runShimWithEnv(["--version"], {
      EMET_CACHE_DIR: cacheDir,
      PATH: `${fakeBin}:${process.env["PATH"] ?? ""}`,
    });
    expect(result.code).toBe(1);
    expect(readFileSync(curlLog, "utf8")).toContain(
      `https://github.com/AndryOre/emet/releases/download/v${version}/${assetName}\n`,
    );
  });

  test("caches under ~/.cache/emet by default", () => {
    publishRelease();
    const result = runShimWithEnv(["--version"], {
      EMET_RELEASE_BASE_URL: `file://${path.join(workDir, "releases")}`,
    });
    expect(result.code).toBe(0);
    expect(existsSync(path.join(workDir, ".cache", "emet", version, "emet"))).toBe(true);
  });
});

describe("bin/emet shim legacy FORGE_* fallback", () => {
  test("reads FORGE_CACHE_DIR, FORGE_RELEASE_BASE_URL and FORGE_PREFETCH", () => {
    publishRelease();
    const result = runShimWithEnv([], {
      FORGE_CACHE_DIR: cacheDir,
      FORGE_RELEASE_BASE_URL: `file://${path.join(workDir, "releases")}`,
      FORGE_PREFETCH: "1",
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(true);
  });

  test("EMET_CACHE_DIR wins over FORGE_CACHE_DIR", () => {
    publishRelease();
    const legacyCache = path.join(workDir, "legacy-cache");
    const result = runShim([], { FORGE_CACHE_DIR: legacyCache, EMET_PREFETCH: "1" });
    expect(result.code).toBe(0);
    expect(existsSync(path.join(cacheDir, version, "emet"))).toBe(true);
    expect(existsSync(legacyCache)).toBe(false);
  });

  test("FORGE_FROM_SOURCE=1 still execs the source entrypoint", () => {
    const sourceEntry = path.join(pluginRoot, "emet/bin/emet.ts");
    mkdirSync(path.dirname(sourceEntry), { recursive: true });
    writeFileSync(sourceEntry, 'console.log("from-source", process.argv.slice(2).join(" "));\n');
    const bunDirectory = path.dirname(process.execPath);
    const result = runShim(["doctor"], {
      FORGE_FROM_SOURCE: "1",
      PATH: `${bunDirectory}:${process.env["PATH"] ?? ""}`,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("from-source doctor\n");
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const shimSource = path.resolve(import.meta.dir, "../bin/forge");
const version = "9.9.9";
const platform = process.platform === "darwin" ? "darwin" : "linux";
const arch = process.arch === "arm64" ? "arm64" : "x64";
const assetName = `forge-${platform}-${arch}`;
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

function runShim(
  args: string[],
  env: Record<string, string> = {},
): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["sh", path.join(pluginRoot, "bin/forge"), ...args], {
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: workDir,
      FORGE_CACHE_DIR: cacheDir,
      FORGE_RELEASE_BASE_URL: `file://${path.join(workDir, "releases")}`,
      ...env,
    },
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "forge-shim-"));
  pluginRoot = path.join(workDir, "plugin");
  cacheDir = path.join(workDir, "cache");
  releaseDir = path.join(workDir, "releases", `v${version}`);
  mkdirSync(path.join(pluginRoot, "bin"), { recursive: true });
  mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
  copyFileSync(shimSource, path.join(pluginRoot, "bin/forge"));
  writeFileSync(
    path.join(pluginRoot, ".claude-plugin/plugin.json"),
    JSON.stringify({ name: "forge", version }),
  );
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("bin/forge shim", () => {
  test("downloads, verifies, caches and execs the binary", () => {
    publishRelease();
    const result = runShim(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("fixture-binary --version\n");
    expect(existsSync(path.join(cacheDir, version, "forge"))).toBe(true);
  });

  test("uses the cached binary without touching the network", () => {
    mkdirSync(path.join(cacheDir, version), { recursive: true });
    const cached = path.join(cacheDir, version, "forge");
    writeFileSync(cached, '#!/bin/sh\necho "cached $*"\n');
    chmodSync(cached, 0o755);
    const result = runShim(["guard"], { FORGE_RELEASE_BASE_URL: "file:///nonexistent" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("cached guard\n");
  });

  test("a checksum mismatch exits 1 and leaves no cached binary", () => {
    publishRelease({ checksum: "0".repeat(64) });
    const result = runShim(["--version"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("checksum mismatch");
    expect(result.stdout).toBe("");
    expect(existsSync(path.join(cacheDir, version, "forge"))).toBe(false);
    expect(readdirSync(path.join(cacheDir, version))).toEqual([]);
  });

  test("a missing checksum entry refuses to exec", () => {
    publishRelease({ listAsset: false });
    const result = runShim(["--version"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no checksum listed");
    expect(existsSync(path.join(cacheDir, version, "forge"))).toBe(false);
  });

  test("a missing release exits non-zero with a one-line reason", () => {
    const result = runShim(["--version"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("not found");
  });

  test("FORGE_PREFETCH caches the binary without running it", () => {
    publishRelease();
    const result = runShim([], { FORGE_PREFETCH: "1" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(path.join(cacheDir, version, "forge"))).toBe(true);
  });

  test("FORGE_FROM_SOURCE=1 execs the source entrypoint through bun", () => {
    const sourceEntry = path.join(pluginRoot, "forge/bin/forge.ts");
    mkdirSync(path.dirname(sourceEntry), { recursive: true });
    writeFileSync(sourceEntry, 'console.log("from-source", process.argv.slice(2).join(" "));\n');
    const bunDirectory = path.dirname(process.execPath);
    const result = runShim(["init"], {
      FORGE_FROM_SOURCE: "1",
      PATH: `${bunDirectory}:${process.env["PATH"] ?? ""}`,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("from-source init\n");
  });
});

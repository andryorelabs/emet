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

interface ShimResult {
  code: number;
  stdout: string;
  stderr: string;
}

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
    env: { PATH: process.env.PATH ?? "", HOME: workDir, ...env },
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Seeds `cacheDir/<cachedVersion>/emet` with `body` and file `mode`. */
function seedVersion(cachedVersion: string, body: string, mode = 0o755): void {
  const directory = path.join(cacheDir, cachedVersion);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "emet"), body);
  chmodSync(path.join(directory, "emet"), mode);
}

/** Lists the `.download.*` staging directories left under the plugin version's cache dir. */
function stagingLeftovers(): string[] {
  const directory = path.join(cacheDir, version);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((entry) => entry.startsWith(".download."));
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

  test("the PreToolUse guard fails closed with exit 2 and a recovery message", () => {
    const result = runShim(["guard"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("not found");
    expect(result.stderr).toContain("blocked");
    expect(result.stderr).toContain("EMET_PREFETCH=1");
    expect(result.stderr).toContain("claude plugin disable emet");
  });

  test("the guard falls back to the newest cached binary when the release asset is missing", () => {
    const older = path.join(cacheDir, "0.0.1");
    mkdirSync(older, { recursive: true });
    writeFileSync(path.join(older, "emet"), '#!/bin/sh\necho "older $*"\n');
    chmodSync(path.join(older, "emet"), 0o755);
    const result = runShim(["guard"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("older guard\n");
    expect(result.stderr).toContain("cached v0.0.1");
  });

  test("the guard never falls back to a cached binary on a checksum mismatch", () => {
    const older = path.join(cacheDir, "0.0.1");
    mkdirSync(older, { recursive: true });
    writeFileSync(path.join(older, "emet"), '#!/bin/sh\necho "older $*"\n');
    chmodSync(path.join(older, "emet"), 0o755);
    publishRelease({ checksum: "0".repeat(64) });
    const result = runShim(["guard"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("checksum mismatch");
  });

  test("the guard fails closed when the manifest has no version", () => {
    writeFileSync(path.join(pluginRoot, ".claude-plugin/plugin.json"), "{}");
    const result = runShim(["guard"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("no version");
  });

  test("Stop and SubagentStop guard events fail open with exit 1, so a session can still end", () => {
    for (const event of ["Stop", "SubagentStop"]) {
      const result = runShim(["guard", "--event", event]);
      expect(result.code).toBe(1);
      expect(result.stderr).not.toContain("blocked");
    }
  });

  test("any command falls back to the cached binary when the release asset is missing", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\nexit 7\n');
    const result = runShim(["status"]);
    expect(result.code).toBe(7);
    expect(result.stdout).toBe("older status\n");
    expect(result.stderr).toBe(
      `emet: release v${version} has no downloadable asset yet (it may still be publishing); using the cached v0.0.1. Retry in a few minutes.\n`,
    );
  });

  test("the fallback picks the newest executable cached version, never the failed version itself", () => {
    seedVersion("0.0.2", '#!/bin/sh\necho "v2"\n');
    seedVersion("0.0.10", '#!/bin/sh\necho "v10"\n');
    seedVersion("0.0.11", '#!/bin/sh\necho "v11"\n', 0o644);
    seedVersion(version, '#!/bin/sh\necho "failed"\n', 0o644);
    const result = runShim(["status"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("v10\n");
    expect(result.stderr).toContain("using the cached v0.0.10");
  });

  test("no command falls back to a cached binary on a checksum mismatch", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\n');
    publishRelease({ checksum: "0".repeat(64) });
    const result = runShim(["status"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("checksum mismatch");
    expect(result.stderr).not.toContain("using the cached");
  });

  test("no command falls back to a cached binary when SHA256SUMS is missing", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\n');
    publishRelease();
    rmSync(path.join(releaseDir, "SHA256SUMS"));
    const result = runShim(["status"]);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("SHA256SUMS not found");
  });

  test("with no usable cache a missing asset says the release may still be publishing", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\n', 0o644);
    const status = runShim(["status"]);
    expect(status.code).toBe(1);
    expect(status.stderr).toContain(
      `emet: release asset ${assetName} not found at file://${path.join(workDir, "releases")}/v${version}; the release may still be publishing, retry in a few minutes.`,
    );
    const guard = runShim(["guard"]);
    expect(guard.code).toBe(2);
    expect(guard.stderr).toContain("the release may still be publishing");
  });

  test("prefetch with a missing asset and a cached binary prints the notice and runs nothing", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\n');
    const result = runShim([], { EMET_PREFETCH: "1" });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("using the cached v0.0.1. Retry in a few minutes.");
    expect(stagingLeftovers()).toEqual([]);
  });

  test("a fallback exec leaves no download staging directory behind", () => {
    seedVersion("0.0.1", '#!/bin/sh\necho "older $*"\n');
    for (const args of [["status"], ["guard"]]) {
      const result = runShim(args);
      expect(result.code).toBe(0);
      expect(stagingLeftovers()).toEqual([]);
    }
  });

  test("a non-guard command that cannot resolve the binary still exits 1", () => {
    const result = runShim(["status"]);
    expect(result.code).toBe(1);
    expect(result.stderr).not.toContain("blocked");
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
      PATH: `${bunDirectory}:${process.env.PATH ?? ""}`,
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
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    });
    expect(result.code).toBe(1);
    expect(readFileSync(curlLog, "utf8")).toContain(
      `https://github.com/andryorelabs/emet/releases/download/v${version}/${assetName}\n`,
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

const windowsNotice = {
  systemMessage:
    "emet does not support native Windows; run Claude Code inside WSL, or disable the plugin with 'claude plugin disable emet'.",
};

/** Single-quotes `value` for a POSIX shell script. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Writes a fake `uname` answering `-s` and `-m`, and returns a PATH that finds it first. */
function fakeUnamePath(system: string, machine: string): string {
  const fakeBin = path.join(workDir, "fake-uname");
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(
    path.join(fakeBin, "uname"),
    `#!/bin/sh\ncase "\${1:-}" in -m) printf '%s\\n' ${shellQuote(machine)} ;; *) printf '%s\\n' ${shellQuote(system)} ;; esac\n`,
  );
  chmodSync(path.join(fakeBin, "uname"), 0o755);
  return `${fakeBin}:${process.env.PATH ?? ""}`;
}

/** Seeds a cached binary for `version` that would print `cached <args>` if it ever ran. */
function seedCachedBinary(): void {
  mkdirSync(path.join(cacheDir, version), { recursive: true });
  const cached = path.join(cacheDir, version, "emet");
  writeFileSync(cached, '#!/bin/sh\necho "cached $*"\n');
  chmodSync(cached, 0o755);
}

describe("bin/emet shim on an unsupported platform", () => {
  test("the guard on MINGW exits 0 silently, downloading and caching nothing", () => {
    publishRelease();
    const result = runShim(["guard"], { PATH: fakeUnamePath("MINGW64_NT-10.0-26200", "x86_64") });
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(existsSync(cacheDir)).toBe(false);
  });

  test("guard events on MINGW exit 0 silently", () => {
    for (const event of ["Stop", "SubagentStop", "UserPromptSubmit"]) {
      const result = runShim(["guard", "--event", event], {
        PATH: fakeUnamePath("MINGW64_NT-10.0-26200", "x86_64"),
      });
      expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
    }
  });

  test("never execs an already cached binary", () => {
    seedCachedBinary();
    const result = runShim(["guard"], { PATH: fakeUnamePath("CYGWIN_NT-10.0", "x86_64") });
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  test("prefetch on MSYS prints exactly the Windows systemMessage line", () => {
    publishRelease();
    const result = runShim([], {
      EMET_PREFETCH: "1",
      PATH: fakeUnamePath("MSYS_NT-10.0", "x86_64"),
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(`${JSON.stringify(windowsNotice)}\n`);
    expect(existsSync(cacheDir)).toBe(false);
  });

  test("prefetch prints the Windows notice for MINGW and CYGWIN too, and honours FORGE_PREFETCH", () => {
    for (const system of ["MINGW32_NT-6.1", "CYGWIN_NT-10.0-19045"]) {
      const result = runShim([], { FORGE_PREFETCH: "1", PATH: fakeUnamePath(system, "x86_64") });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(windowsNotice);
    }
  });

  test("setup --notice on MSYS prints nothing on stdout or stderr", () => {
    const result = runShim(["setup", "--notice"], {
      PATH: fakeUnamePath("MSYS_NT-10.0", "x86_64"),
    });
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
  });

  test("an unsupported Linux architecture degrades the same way", () => {
    publishRelease();
    const unamePath = fakeUnamePath("Linux", "armv7l");
    expect(runShim(["guard"], { PATH: unamePath })).toEqual({ code: 0, stdout: "", stderr: "" });
    const prefetch = runShim([], { EMET_PREFETCH: "1", PATH: unamePath });
    expect(prefetch.code).toBe(0);
    expect(prefetch.stdout).toBe(
      `${JSON.stringify({ systemMessage: "emet does not support Linux/armv7l; emet stays inactive in this session." })}\n`,
    );
    expect(existsSync(cacheDir)).toBe(false);
  });

  test("an unsupported OS gets the generic notice naming its os/arch", () => {
    const result = runShim([], {
      EMET_PREFETCH: "1",
      PATH: fakeUnamePath("FreeBSD", "amd64"),
    });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      systemMessage: "emet does not support FreeBSD/amd64; emet stays inactive in this session.",
    });
  });

  test("the notice stays valid JSON when uname returns quotes or backslashes", () => {
    const result = runShim([], {
      EMET_PREFETCH: "1",
      PATH: fakeUnamePath('Weird"OS\\x', 'ar"m\\'),
    });
    expect(result.code).toBe(0);
    expect(result.stdout.split("\n")).toHaveLength(2);
    expect(JSON.parse(result.stdout)).toEqual({
      systemMessage: "emet does not support WeirdOSx/arm; emet stays inactive in this session.",
    });
  });

  test("the platform check runs before EMET_FROM_SOURCE=1 with bun on PATH", () => {
    const sourceEntry = path.join(pluginRoot, "emet/bin/emet.ts");
    mkdirSync(path.dirname(sourceEntry), { recursive: true });
    writeFileSync(sourceEntry, 'console.log("from-source", process.argv.slice(2).join(" "));\n');
    const bunDirectory = path.dirname(process.execPath);
    const result = runShim(["guard"], {
      EMET_FROM_SOURCE: "1",
      PATH: `${bunDirectory}:${fakeUnamePath("MINGW64_NT-10.0-26200", "x86_64")}`,
    });
    expect(result).toEqual({ code: 0, stdout: "", stderr: "" });
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
      PATH: `${bunDirectory}:${process.env.PATH ?? ""}`,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("from-source doctor\n");
  });
});

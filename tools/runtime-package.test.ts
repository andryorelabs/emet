import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { embeddedTree } from "../emet/src/assets";
import { sourceInstall } from "../emet/src/self-source";

const repoRoot = join(import.meta.dir, "..");

const allowedRuntimeDevDependencies = new Set(["@types/bun", "@types/node", "typescript"]);

/** Whether `value` is a plain object whose values are all strings. */
function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/** Reads and parses emet/package.json, the manifest the source install ships to users. */
function readRuntimeManifest(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, "emet/package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("emet/package.json is not a JSON object");
  }
  const manifest = Object.fromEntries(Object.entries(parsed));
  return {
    ...(isStringRecord(manifest.dependencies) ? { dependencies: manifest.dependencies } : {}),
    ...(isStringRecord(manifest.devDependencies)
      ? { devDependencies: manifest.devDependencies }
      : {}),
  };
}

test("emet/package.json ships no runtime dependencies", () => {
  expect(Object.keys(readRuntimeManifest().dependencies ?? {})).toEqual([]);
});

test("emet/package.json devDependencies stay on the allowlist the source install can afford", () => {
  const unexpected = Object.keys(readRuntimeManifest().devDependencies ?? {}).filter(
    (name) => !allowedRuntimeDevDependencies.has(name),
  );
  expect(unexpected).toEqual([]);
});

test("the source install installs only from emet/ and leaves the repo root untouched", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "emet-runtime-package-"));
  try {
    const home = join(workDir, "home");
    const toolsDir = join(workDir, "tools");
    mkdirSync(home, { recursive: true });
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(join(toolsDir, "bun"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(toolsDir, "bun"), 0o755);
    const bunInstallDirectories: string[] = [];
    const errors: string[] = [];
    const exitCode = await sourceInstall(
      {
        from: repoRoot,
        dryRun: false,
        runBunInstall: (_bun, cwd) => {
          bunInstallDirectories.push(cwd);
          return Promise.resolve(0);
        },
      },
      {
        home,
        executablePath: join(workDir, "emet"),
        compiled: false,
        version: "0.0.0-test",
        tree: embeddedTree,
        interactive: false,
        pathEnv: toolsDir,
        runSetup: () => Promise.resolve(0),
        now: () => new Date(0),
        log: () => undefined,
        error: (line) => errors.push(line),
      },
    );
    expect({ exitCode, errors }).toEqual({ exitCode: 0, errors: [] });
    const installRoot = join(home, ".claude", "emet");
    expect(bunInstallDirectories).toEqual([installRoot]);
    expect(readFileSync(join(installRoot, "package.json"), "utf8")).toBe(
      readFileSync(join(repoRoot, "emet/package.json"), "utf8"),
    );
    expect(existsSync(join(installRoot, "node_modules"))).toBe(false);
    expect(existsSync(join(installRoot, "turbo.json"))).toBe(false);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

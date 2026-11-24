import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { embeddedTree } from "../emet/src/assets";
import type { SelfDeps } from "../emet/src/self-install";
import { sourceInstall } from "../emet/src/self-source";

/**
 * Snapshot of what `emet self install --from <checkout>` writes for the Claude Code path: the
 * sorted installed paths and the sha256 of every shipped prompt (`commands/*.md`, `agents/*.md`,
 * `emet/reference/*.md`, as installed). Adding, removing or rewording any of them fails the test
 * and names the file. Runtime modules under `.claude/emet/src/` are left out of the path list:
 * they are code covered by their own tests, and every feature adds some.
 *
 * To update the snapshot after an intentional change to the Claude install set, run:
 *
 *   EMET_UPDATE_CLAUDE_INSTALL_SNAPSHOT=1 bun test tools/claude-install-invariant.test.ts
 *
 * then review and commit `tools/fixtures/claude-install-snapshot.json`.
 */

interface ClaudeInstallSnapshot {
  paths: string[];
  promptSha256: Record<string, string>;
}

const repoRoot = path.resolve(import.meta.dir, "..");
const snapshotPath = path.join(import.meta.dir, "fixtures/claude-install-snapshot.json");
const updateRequested = process.env.EMET_UPDATE_CLAUDE_INSTALL_SNAPSHOT === "1";
const promptDirectories = [".claude/commands", ".claude/agents", ".claude/emet/reference"];

let workDir = "";
let homeDir = "";
let toolsDir = "";
let errors: string[] = [];

/** A `bun` on the fixture PATH, so the source install finds one; `bun install` itself is stubbed. */
function prepareFakeBun(): void {
  mkdirSync(toolsDir, { recursive: true });
  const fakeBunPath = path.join(toolsDir, "bun");
  writeFileSync(fakeBunPath, "#!/bin/sh\nexit 0\n");
  chmodSync(fakeBunPath, 0o755);
}

function installDeps(): SelfDeps {
  return {
    home: homeDir,
    executablePath: path.join(workDir, "emet"),
    compiled: false,
    version: "0.0.0-snapshot",
    tree: embeddedTree,
    interactive: false,
    pathEnv: toolsDir,
    runSetup: () => Promise.resolve(0),
    now: () => new Date("2026-11-23T00:00:00Z"),
    log: () => undefined,
    error: (line) => errors.push(line),
  };
}

async function runInstaller(): Promise<void> {
  const exitCode = await sourceInstall(
    { from: repoRoot, dryRun: false, runBunInstall: () => Promise.resolve(0) },
    installDeps(),
  );
  if (exitCode !== 0) {
    throw new Error(`emet self install --from failed (${exitCode}): ${errors.join("\n")}`);
  }
}

function listEntries(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listEntries(entryPath);
    return [entryPath];
  });
}

function relativeToHome(absolutePath: string): string {
  return path.relative(homeDir, absolutePath).split(path.sep).join("/");
}

function sha256Of(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Records the installed paths (files and symlinks) and the hash of every installed prompt. */
function captureInstall(): ClaudeInstallSnapshot {
  const installedPaths = [
    ...new Set(
      listEntries(homeDir)
        .map(relativeToHome)
        .filter((entry) => !entry.startsWith(".claude/emet/src/")),
    ),
  ].toSorted();
  const promptSha256: Record<string, string> = {};
  for (const directory of promptDirectories) {
    const absoluteDirectory = path.join(homeDir, directory);
    if (!existsSync(absoluteDirectory)) continue;
    for (const filePath of listEntries(absoluteDirectory)) {
      if (filePath.endsWith(".md")) promptSha256[relativeToHome(filePath)] = sha256Of(filePath);
    }
  }
  const sortedPromptSha256 = Object.fromEntries(
    Object.entries(promptSha256).toSorted(([left], [right]) => left.localeCompare(right)),
  );
  return { paths: installedPaths, promptSha256: sortedPromptSha256 };
}

function describeDrift(expected: ClaudeInstallSnapshot, actual: ClaudeInstallSnapshot): string[] {
  const drift: string[] = [];
  for (const added of actual.paths.filter((entry) => !expected.paths.includes(entry))) {
    drift.push(`added: ${added}`);
  }
  for (const removed of expected.paths.filter((entry) => !actual.paths.includes(entry))) {
    drift.push(`removed: ${removed}`);
  }
  for (const [file, hash] of Object.entries(actual.promptSha256)) {
    const expectedHash = expected.promptSha256[file];
    if (expectedHash !== undefined && expectedHash !== hash) drift.push(`reworded: ${file}`);
  }
  return drift;
}

function parseSnapshot(text: string): ClaudeInstallSnapshot {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("snapshot is not an object");
  const { paths, promptSha256 } = parsed as Partial<ClaudeInstallSnapshot>;
  if (!Array.isArray(paths) || !promptSha256 || typeof promptSha256 !== "object") {
    throw new Error("snapshot must have `paths` and `promptSha256`");
  }
  return { paths, promptSha256 };
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "emet-claude-snapshot-"));
  homeDir = path.join(workDir, "home");
  toolsDir = path.join(workDir, "tools");
  errors = [];
  mkdirSync(homeDir, { recursive: true });
  prepareFakeBun();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

setDefaultTimeout(60_000);

describe("claude install invariant", () => {
  test("claude install invariant", async () => {
    await runInstaller();
    expect(lstatSync(path.join(homeDir, ".claude/commands/emet/run.md")).isFile()).toBe(true);
    const actual = captureInstall();
    if (updateRequested) {
      writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    const expected = parseSnapshot(readFileSync(snapshotPath, "utf8"));
    expect(describeDrift(expected, actual)).toEqual([]);
    expect(actual).toEqual(expected);
  });

  test("a second install writes nothing", async () => {
    await runInstaller();
    const first = captureInstall();
    const manifestPath = path.join(homeDir, ".claude/emet/.install-manifest.json");
    const manifestBefore = readFileSync(manifestPath, "utf8");
    await runInstaller();
    expect(captureInstall()).toEqual(first);
    expect(readFileSync(manifestPath, "utf8")).toBe(manifestBefore);
  });
});

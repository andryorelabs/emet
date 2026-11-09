import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Snapshot of what `install.sh` writes for the Claude Code path: the sorted installed paths and
 * the sha256 of every shipped prompt (`commands/*.md`, `agents/*.md`, `emet/reference/*.md`, as
 * installed). Adding, removing or rewording any of them fails the test and names the file.
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
const updateRequested = process.env["EMET_UPDATE_CLAUDE_INSTALL_SNAPSHOT"] === "1";
const bashPath = Bun.which("bash") ?? "/bin/bash";
const installerTools = [
  "awk",
  "cat",
  "chmod",
  "cp",
  "curl",
  "cut",
  "date",
  "dirname",
  "find",
  "grep",
  "jq",
  "ln",
  "ls",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "rsync",
  "sed",
  "sha256sum",
  "sort",
  "tail",
  "uname",
];
const commandNames = ["run", "init", "doctor"] as const;
const promptDirectories = [".claude/commands", ".claude/agents", ".claude/emet/reference"];

let workDir = "";
let homeDir = "";
let toolsDir = "";
let fixtureRepo = "";

/** Builds a repo copy laid out as install.sh expects, linking the real sources into it. */
function buildFixtureRepo(): void {
  fixtureRepo = path.join(workDir, "repo");
  mkdirSync(path.join(fixtureRepo, "agents"), { recursive: true });
  mkdirSync(path.join(fixtureRepo, "bin"), { recursive: true });
  copyFileSync(path.join(repoRoot, "install.sh"), path.join(fixtureRepo, "install.sh"));
  for (const directory of ["emet", ".claude-plugin"]) {
    symlinkSync(path.join(repoRoot, directory), path.join(fixtureRepo, directory));
  }
  mkdirSync(path.join(fixtureRepo, "commands"));
  for (const commandName of commandNames) {
    symlinkSync(
      path.join(repoRoot, "commands", `${commandName}.md`),
      path.join(fixtureRepo, "commands", `${commandName}.md`),
    );
  }
  for (const role of ["worker", "reviewer"]) {
    symlinkSync(
      path.join(repoRoot, `agents/emet-${role}.md`),
      path.join(fixtureRepo, "agents", `emet-${role}.md`),
    );
  }
  symlinkSync(path.join(repoRoot, "bin/emet"), path.join(fixtureRepo, "bin", "emet"));
}

function prepareTools(): void {
  mkdirSync(toolsDir, { recursive: true });
  for (const name of installerTools) {
    const resolved = Bun.which(name);
    if (resolved) symlinkSync(resolved, path.join(toolsDir, name));
  }
  const fakeBunPath = path.join(toolsDir, "bun");
  writeFileSync(fakeBunPath, "#!/bin/sh\nexit 0\n");
  chmodSync(fakeBunPath, 0o755);
}

function runInstaller(): void {
  const result = Bun.spawnSync([bashPath, path.join(fixtureRepo, "install.sh")], {
    cwd: fixtureRepo,
    env: { HOME: homeDir, PATH: toolsDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`install.sh failed (${result.exitCode}): ${result.stderr.toString()}`);
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
  return path
    .relative(homeDir, absolutePath)
    .split(path.sep)
    .join("/")
    .replace(/\.pre-emet-guard-backup\.\d{8}T\d{6}Z$/, ".pre-emet-guard-backup.<timestamp>");
}

function sha256Of(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

/** Records the installed paths (files and symlinks) and the hash of every installed prompt. */
function captureInstall(): ClaudeInstallSnapshot {
  const installedPaths = listEntries(homeDir).map(relativeToHome).toSorted();
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
  if (!Array.isArray(paths) || typeof promptSha256 !== "object" || promptSha256 === null) {
    throw new Error("snapshot must have `paths` and `promptSha256`");
  }
  return { paths, promptSha256 };
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "emet-claude-snapshot-"));
  homeDir = path.join(workDir, "home");
  toolsDir = path.join(workDir, "tools");
  mkdirSync(homeDir, { recursive: true });
  buildFixtureRepo();
  prepareTools();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

setDefaultTimeout(60_000);

describe.skipIf(!Bun.which("rsync"))("claude install invariant", () => {
  test("claude install invariant", () => {
    runInstaller();
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
});

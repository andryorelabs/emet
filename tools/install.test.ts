import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
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

const repoRoot = path.resolve(import.meta.dir, "..");
const installerPath = path.join(repoRoot, "install.sh");
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
  "sort",
  "tail",
  "uname",
];
const hashTools = {
  sha256sum: ["sha256sum"],
  shasum: ["shasum", "perl"],
};

let workDir = "";
let homeDir = "";
let toolsDir = "";

function linkTools(names: string[]): void {
  mkdirSync(toolsDir, { recursive: true });
  for (const name of names) {
    const resolved = Bun.which(name);
    if (resolved) symlinkSync(resolved, path.join(toolsDir, name));
  }
}

function addFakeBun(): void {
  const fakeBunPath = path.join(toolsDir, "bun");
  writeFileSync(fakeBunPath, "#!/bin/sh\nexit 0\n");
  chmodSync(fakeBunPath, 0o755);
}

function runInstaller(options: { hashTool?: keyof typeof hashTools; withBun?: boolean } = {}): {
  exitCode: number;
  output: string;
} {
  rmSync(toolsDir, { recursive: true, force: true });
  linkTools([...installerTools, ...hashTools[options.hashTool ?? "sha256sum"]]);
  if (options.withBun) addFakeBun();
  const result = Bun.spawnSync([bashPath, installerPath], {
    cwd: repoRoot,
    env: { HOME: homeDir, PATH: toolsDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

function listFilesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "forge-install-"));
  homeDir = path.join(workDir, "home");
  toolsDir = path.join(workDir, "tools");
  mkdirSync(homeDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("install.sh without bun", () => {
  test("installs rewritten prompts and the shim into a temp HOME", () => {
    const { exitCode, output } = runInstaller();
    expect(output).toContain("bun not found");
    expect(exitCode).toBe(0);

    const command = readFileSync(path.join(homeDir, ".claude/commands/forge.md"), "utf8");
    expect(command).toContain("forge-worker");
    expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");

    expect(lstatSync(path.join(homeDir, ".local/bin/forge")).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(homeDir, ".claude/forge/.claude-plugin/plugin.json"))).toBe(true);
  });

  test("leaves no plugin placeholder or agent prefix in any installed prompt", () => {
    expect(runInstaller().exitCode).toBe(0);
    const promptFiles = [
      ...listFilesRecursively(path.join(homeDir, ".claude/agents")),
      ...listFilesRecursively(path.join(homeDir, ".claude/commands")),
      ...listFilesRecursively(path.join(homeDir, ".claude/forge/reference")),
    ];
    expect(promptFiles.length).toBeGreaterThan(0);
    for (const promptFile of promptFiles) {
      const content = readFileSync(promptFile, "utf8");
      expect(content).not.toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(content).not.toMatch(/forge:forge-(worker|reviewer)|\/forge:run/);
    }
  });

  test.skipIf(!Bun.which("shasum") || !Bun.which("perl"))(
    "accepts shasum when sha256sum is absent",
    () => {
      expect(runInstaller({ hashTool: "shasum" }).exitCode).toBe(0);
    },
  );

  test("keeps a user-edited prompt and writes the new version beside it as .new", () => {
    expect(runInstaller().exitCode).toBe(0);
    const agentPath = path.join(homeDir, ".claude/agents/forge-worker.md");
    const original = readFileSync(agentPath, "utf8");
    writeFileSync(agentPath, `${original}\nuser edit\n`);

    const secondRun = runInstaller();
    expect(secondRun.exitCode).toBe(0);
    expect(readFileSync(agentPath, "utf8")).toContain("user edit");
    expect(readFileSync(`${agentPath}.new`, "utf8")).toBe(original);
  });
});

describe("install.sh with bun", () => {
  test("installs the bun wrapper, not the shim", () => {
    const { exitCode, output } = runInstaller({ withBun: true });
    expect(output).not.toContain("bun not found");
    expect(exitCode).toBe(0);

    const wrapperPath = path.join(homeDir, ".local/bin/forge");
    expect(lstatSync(wrapperPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(wrapperPath, "utf8")).toContain("forge.ts");
    const command = readFileSync(path.join(homeDir, ".claude/commands/forge.md"), "utf8");
    expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
  });

  test("a source install over a binary-mode install leaves the shim intact", () => {
    expect(runInstaller().exitCode).toBe(0);
    const shimPath = path.join(homeDir, ".claude/forge/bin/forge");
    const shimBefore = readFileSync(shimPath, "utf8");
    expect(runInstaller({ withBun: true }).exitCode).toBe(0);

    const wrapperPath = path.join(homeDir, ".local/bin/forge");
    expect(lstatSync(wrapperPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(wrapperPath, "utf8")).toContain("forge.ts");
    if (existsSync(shimPath)) expect(readFileSync(shimPath, "utf8")).toBe(shimBefore);
  });
});

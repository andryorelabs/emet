import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
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

const repoRoot = path.resolve(import.meta.dir, "..");
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
let fixtureRepo = "";

/** Builds a repo copy laid out as install.sh expects, linking the real sources into it. */
function buildFixtureRepo(): void {
  fixtureRepo = path.join(workDir, "repo");
  mkdirSync(path.join(fixtureRepo, "agents"), { recursive: true });
  mkdirSync(path.join(fixtureRepo, "bin"), { recursive: true });
  copyFileSync(path.join(repoRoot, "install.sh"), path.join(fixtureRepo, "install.sh"));
  for (const directory of ["emet", "commands", ".claude-plugin"]) {
    symlinkSync(path.join(repoRoot, directory), path.join(fixtureRepo, directory));
  }
  for (const role of ["worker", "reviewer"]) {
    symlinkSync(
      path.join(repoRoot, `agents/emet-${role}.md`),
      path.join(fixtureRepo, "agents", `emet-${role}.md`),
    );
  }
  symlinkSync(path.join(repoRoot, "bin/emet"), path.join(fixtureRepo, "bin", "emet"));
}

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
  const result = Bun.spawnSync([bashPath, path.join(fixtureRepo, "install.sh")], {
    cwd: fixtureRepo,
    env: { HOME: homeDir, PATH: toolsDir },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  if (result.exitCode !== 0)
    process.stderr.write(`install.sh failed (${result.exitCode}):\n${output}\n`);
  return { exitCode: result.exitCode, output };
}

function listFilesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "emet-install-"));
  homeDir = path.join(workDir, "home");
  toolsDir = path.join(workDir, "tools");
  mkdirSync(homeDir, { recursive: true });
  buildFixtureRepo();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Each test runs install.sh once or twice; one run hashes every file it ships. */
setDefaultTimeout(60_000);

const describeInstaller = describe.skipIf(!Bun.which("rsync"));

describeInstaller("install.sh without bun", () => {
  test("installs rewritten prompts and the shim into a temp HOME", () => {
    const { exitCode, output } = runInstaller();
    expect(output).toContain("bun not found");
    expect(exitCode).toBe(0);

    const command = readFileSync(path.join(homeDir, ".claude/commands/emet.md"), "utf8");
    expect(command).toContain("emet-worker");
    expect(command).not.toMatch(/forge-(worker|reviewer)/);
    expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");

    for (const role of ["worker", "reviewer"]) {
      expect(existsSync(path.join(homeDir, `.claude/agents/emet-${role}.md`))).toBe(true);
    }
    expect(existsSync(path.join(homeDir, ".claude/emet/bin/emet"))).toBe(true);
    expect(existsSync(path.join(homeDir, ".claude/emet/.install-manifest.json"))).toBe(true);
    expect(lstatSync(path.join(homeDir, ".local/bin/emet")).isSymbolicLink()).toBe(true);
    expect(existsSync(path.join(homeDir, ".claude/emet/.claude-plugin/plugin.json"))).toBe(true);
  });

  test("leaves no plugin placeholder or agent prefix in any installed prompt", () => {
    expect(runInstaller().exitCode).toBe(0);
    const promptFiles = [
      ...listFilesRecursively(path.join(homeDir, ".claude/agents")),
      ...listFilesRecursively(path.join(homeDir, ".claude/commands")),
      ...listFilesRecursively(path.join(homeDir, ".claude/emet/reference")),
    ];
    expect(promptFiles.length).toBeGreaterThan(0);
    for (const promptFile of promptFiles) {
      const content = readFileSync(promptFile, "utf8");
      expect(content).not.toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(content).not.toMatch(/(forge|emet):(forge|emet)-(worker|reviewer)|\/(forge|emet):run/);
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
    const agentPath = path.join(homeDir, ".claude/agents/emet-worker.md");
    const original = readFileSync(agentPath, "utf8");
    writeFileSync(agentPath, `${original}\nuser edit\n`);

    const secondRun = runInstaller();
    expect(secondRun.exitCode).toBe(0);
    expect(readFileSync(agentPath, "utf8")).toContain("user edit");
    expect(readFileSync(`${agentPath}.new`, "utf8")).toBe(original);
  });
});

describeInstaller("install.sh with bun", () => {
  test("installs the bun wrapper, not the shim", () => {
    const { exitCode, output } = runInstaller({ withBun: true });
    expect(output).not.toContain("bun not found");
    expect(exitCode).toBe(0);

    const wrapperPath = path.join(homeDir, ".local/bin/emet");
    expect(lstatSync(wrapperPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(wrapperPath, "utf8")).toContain("emet.ts");
    const command = readFileSync(path.join(homeDir, ".claude/commands/emet.md"), "utf8");
    expect(command).not.toContain("${CLAUDE_PLUGIN_ROOT}");
  });

  test("a source install over a binary-mode install leaves the shim intact", () => {
    expect(runInstaller().exitCode).toBe(0);
    const shimPath = path.join(homeDir, ".claude/emet/bin/emet");
    const shimBefore = readFileSync(shimPath, "utf8");
    expect(runInstaller({ withBun: true }).exitCode).toBe(0);

    const wrapperPath = path.join(homeDir, ".local/bin/emet");
    expect(lstatSync(wrapperPath).isSymbolicLink()).toBe(false);
    expect(readFileSync(wrapperPath, "utf8")).toContain("emet.ts");
    if (existsSync(shimPath)) expect(readFileSync(shimPath, "utf8")).toBe(shimBefore);
  });
});

describeInstaller("install.sh prompt rewrites", () => {
  test("rewrites the plugin command and agent names to the installed ones", () => {
    rmSync(path.join(fixtureRepo, "commands"));
    mkdirSync(path.join(fixtureRepo, "commands"));
    writeFileSync(
      path.join(fixtureRepo, "commands", "run.md"),
      "Run /emet:run, dispatch emet:emet-worker and emet:emet-reviewer.\n",
    );
    expect(runInstaller().exitCode).toBe(0);
    expect(readFileSync(path.join(homeDir, ".claude/commands/emet.md"), "utf8")).toBe(
      "Run /emet, dispatch emet-worker and emet-reviewer.\n",
    );
  });
});

/** SHA-256 hex digest of `content`, as install.sh records it in its manifest. */
function sha256(content: string): string {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex");
}

/** Writes `files` under HOME plus a legacy manifest; `edited` files differ from their recorded hash. */
function seedLegacyInstall(files: Record<string, string>, edited: readonly string[]): void {
  const entries = Object.entries(files).map(([relativePath, content]) => {
    const absolutePath = path.join(homeDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, edited.includes(relativePath) ? `${content}user edit\n` : content);
    return `  "${relativePath}": "${sha256(content)}"`;
  });
  entries.sort();
  writeFileSync(
    path.join(homeDir, ".claude/forge/.install-manifest.json"),
    `{\n${entries.join(",\n")}\n}\n`,
  );
}

interface HookSettings {
  hooks?: Record<string, { hooks?: { type?: string; command?: string }[] }[]>;
}

/** Reads settings.json as hook settings. */
function readHookSettings(settingsPath: string): HookSettings {
  const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("settings is not an object");
  return parsed;
}

/** Every hook command in settings.json, across all events, in file order. */
function hookCommands(settings: HookSettings): string[] {
  return Object.values(settings.hooks ?? {}).flatMap((groups) =>
    groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command ?? "")),
  );
}

const legacyFiles = {
  ".claude/forge/bin/forge.ts": "legacy entry\n",
  ".claude/forge/reference/phases.md": "legacy reference\n",
  ".claude/commands/forge.md": "legacy command\n",
  ".claude/agents/forge-worker.md": "legacy worker\n",
  ".claude/agents/forge-reviewer.md": "legacy reviewer\n",
  ".local/bin/forge": "#!/usr/bin/env bash\nexec bun legacy\n",
};

/** Seeds settings.json with the legacy guard hooks, plus `extraStopCommand` under Stop. */
function seedLegacySettings(extraStopCommand?: string): string {
  const legacyGuard = `${homeDir}/.local/bin/forge guard`;
  const stopHooks = [{ hooks: [{ type: "command", command: `${legacyGuard} --event Stop` }] }];
  if (extraStopCommand) stopHooks.push({ hooks: [{ type: "command", command: extraStopCommand }] });
  const settings = {
    model: "opusplan",
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash|ScheduleWakeup|Skill|Edit|Write|MultiEdit|NotebookEdit",
          hooks: [{ type: "command", command: legacyGuard }],
        },
        { matcher: "Bash", hooks: [{ type: "command", command: "other-hook" }] },
      ],
      SubagentStop: [
        { hooks: [{ type: "command", command: `${legacyGuard} --event SubagentStop` }] },
      ],
      Stop: stopHooks,
    },
  };
  const settingsPath = path.join(homeDir, ".claude/settings.json");
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

describeInstaller("install.sh over a legacy forge install", () => {
  test("installs the emet paths, removes unmodified legacy files and keeps edited ones", () => {
    seedLegacyInstall(legacyFiles, [".claude/agents/forge-reviewer.md"]);
    const { exitCode, output } = runInstaller();
    expect(exitCode).toBe(0);

    for (const emetPath of [
      ".claude/emet/.install-manifest.json",
      ".claude/commands/emet.md",
      ".claude/agents/emet-worker.md",
      ".claude/agents/emet-reviewer.md",
      ".local/bin/emet",
    ]) {
      expect(existsSync(path.join(homeDir, emetPath))).toBe(true);
    }
    for (const removedPath of [
      ".claude/forge/bin/forge.ts",
      ".claude/forge/reference/phases.md",
      ".claude/commands/forge.md",
      ".claude/agents/forge-worker.md",
      ".local/bin/forge",
    ]) {
      expect(existsSync(path.join(homeDir, removedPath))).toBe(false);
    }
    expect(readFileSync(path.join(homeDir, ".claude/agents/forge-reviewer.md"), "utf8")).toContain(
      "user edit",
    );
    expect(output).toContain("~/.claude/agents/forge-reviewer.md");
  });

  test("clears the legacy directory when every legacy file was unmodified", () => {
    seedLegacyInstall(legacyFiles, []);
    mkdirSync(path.join(homeDir, ".claude/forge/node_modules/pkg"), { recursive: true });
    writeFileSync(path.join(homeDir, ".claude/forge/node_modules/pkg/index.js"), "");
    expect(runInstaller().exitCode).toBe(0);
    expect(existsSync(path.join(homeDir, ".claude/forge"))).toBe(false);
  });

  test("removes the legacy binary-mode shim link", () => {
    seedLegacyInstall({ ".claude/forge/bin/forge": "#!/bin/sh\nlegacy shim\n" }, []);
    mkdirSync(path.join(homeDir, ".local/bin"), { recursive: true });
    symlinkSync(
      path.join(homeDir, ".claude/forge/bin/forge"),
      path.join(homeDir, ".local/bin/forge"),
    );
    expect(runInstaller().exitCode).toBe(0);
    expect(existsSync(path.join(homeDir, ".local/bin/forge"))).toBe(false);
    expect(lstatSync(path.join(homeDir, ".local/bin/emet")).isSymbolicLink()).toBe(true);
  });

  test("rewrites the forge guard hooks to emet guard after a backup, and re-running is safe", () => {
    seedLegacyInstall(legacyFiles, []);
    const settingsPath = seedLegacySettings();
    const legacySettings = readFileSync(settingsPath, "utf8");
    expect(runInstaller().exitCode).toBe(0);

    const emetGuard = `${homeDir}/.local/bin/emet guard`;
    const expectedCommands = [
      emetGuard,
      "other-hook",
      `${emetGuard} --event SubagentStop`,
      `${emetGuard} --event Stop`,
    ];
    expect(hookCommands(readHookSettings(settingsPath))).toEqual(expectedCommands);
    expect(readFileSync(settingsPath, "utf8")).toContain('"model": "opusplan"');
    const settingsDirectory = path.dirname(settingsPath);
    const backups = readdirSync(settingsDirectory).filter((name) =>
      name.startsWith("settings.json.pre-emet-guard-backup."),
    );
    expect(
      backups.some(
        (name) => readFileSync(path.join(settingsDirectory, name), "utf8") === legacySettings,
      ),
    ).toBe(true);

    expect(runInstaller().exitCode).toBe(0);
    expect(hookCommands(readHookSettings(settingsPath))).toEqual(expectedCommands);
  });

  test("drops a duplicate when both forge guard and emet guard are wired", () => {
    const emetStop = `${homeDir}/.local/bin/emet guard --event Stop`;
    const settingsPath = seedLegacySettings(emetStop);
    expect(runInstaller().exitCode).toBe(0);
    const stopCommands = hookCommands(readHookSettings(settingsPath)).filter((command) =>
      command.endsWith("--event Stop"),
    );
    expect(stopCommands).toEqual([emetStop]);
  });
});

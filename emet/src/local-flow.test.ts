import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";

const CLI_ENTRY = path.resolve(import.meta.dir, "../bin/emet.ts");

let repo = "";
let emptyBin = "";
let scratchDir = "";

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function childPath(): string {
  return `${emptyBin}:${path.dirname(process.execPath)}`;
}

function childEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: childPath(),
    HOME: path.join(scratchDir, "home"),
  };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GH_") || key.startsWith("GITHUB_")) Reflect.deleteProperty(env, key);
  }
  return env;
}

function forge(...args: string[]): CliResult {
  const result = Bun.spawnSync([process.execPath, CLI_ENTRY, ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
    env: childEnv(),
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function forgeOk(...args: string[]): string {
  const result = forge(...args);
  if (result.exitCode !== 0) {
    throw new Error(`forge ${args.join(" ")} exited ${result.exitCode}: ${result.stderr}`);
  }
  return result.stdout;
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-local-flow-")));
  emptyBin = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-local-flow-bin-")));
  scratchDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "forge-local-flow-body-")));
  const agentsDirectory = path.join(scratchDir, "home", ".claude", "agents");
  mkdirSync(agentsDirectory, { recursive: true });
  for (const agentName of ["forge-worker", "forge-reviewer"]) {
    writeFileSync(path.join(agentsDirectory, `${agentName}.md`), "stub\n");
  }
  const gitBinary = Bun.which("git");
  if (gitBinary === null) throw new Error("git is required on PATH");
  symlinkSync(gitBinary, path.join(emptyBin, "git"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "commit.gpgsign", "false");
  writeFileSync(path.join(repo, "README.md"), "hi\n");
  git(repo, "add", "README.md");
  git(repo, "commit", "-q", "-m", "init");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(emptyBin, { recursive: true, force: true });
  rmSync(scratchDir, { recursive: true, force: true });
});

function frontierIds(): string[] {
  const parsed: unknown = JSON.parse(forgeOk("tracker", "frontier", "--spec", "demo"));
  if (!Array.isArray(parsed)) throw new Error("frontier did not return an array");
  return parsed.map((ticket: unknown) => {
    if (typeof ticket !== "object" || ticket === null || !("id" in ticket)) {
      throw new Error("frontier entry has no id");
    }
    return String(ticket.id);
  });
}

function resolveInitTodoMarkers(): void {
  const guidePath = path.join(repo, "docs", "agents", "emet.md");
  writeFileSync(guidePath, readFileSync(guidePath, "utf8").replaceAll("TODO(emet):", "Done:"));
}

describe("local flow", () => {
  test("init, three waves through the spec branch, land, cleanup and preflight with no remote and no gh", () => {
    expect(Bun.which("gh", { PATH: childPath() })).toBeNull();
    expect(Bun.which("git", { PATH: childPath() })).not.toBeNull();
    expect(git(repo, "remote")).toBe("");

    forgeOk("init", "--tracker", "local");
    resolveInitTodoMarkers();
    const configPath = path.join(repo, "emet.config.json");
    const initialConfig: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    const initialLanding = isObject(initialConfig) ? initialConfig.landing : undefined;
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          ...(isObject(initialConfig) ? initialConfig : {}),
          landing: { ...(isObject(initialLanding) ? initialLanding : {}), unit: "spec" },
        },
        null,
        2,
      )}\n`,
    );
    mkdirSync(path.join(repo, ".claude"), { recursive: true });
    writeFileSync(
      path.join(repo, ".claude", "settings.json"),
      `${JSON.stringify({ worktree: { baseRef: "head" } }, null, 2)}\n`,
    );
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore: forge init");

    const bodyFile = path.join(scratchDir, "body.md");
    writeFileSync(bodyFile, "body\n");
    forgeOk("tracker", "create-spec", "--slug", "demo", "--title", "Demo", "--body-file", bodyFile);
    const ticketIds = ["demo-01", "demo-02", "demo-03"];
    ticketIds.forEach((_, index) => {
      forgeOk(
        "tracker",
        "create-ticket",
        "--spec",
        "demo",
        "--title",
        `Ticket ${index + 1}`,
        "--body-file",
        bodyFile,
        ...(index === 0 ? [] : ["--blocked-by", String(index).padStart(2, "0")]),
      );
    });
    expect(frontierIds()).toEqual(["demo-01"]);

    const trunkBefore = git(repo, "rev-parse", "main");
    const trunkCommitsBefore = Number(git(repo, "rev-list", "--count", "main"));
    forgeOk("spec-branch", "ensure", "--spec", "demo");
    expect(git(repo, "rev-parse", "spec/demo")).toBe(trunkBefore);

    ticketIds.forEach((ticketId, index) => {
      const wave = index + 1;
      const waveBranch = `spec/demo-w${wave}`;
      git(repo, "checkout", "-q", "-b", waveBranch, "spec/demo");
      writeFileSync(path.join(repo, `feature-${wave}.txt`), `feature ${wave}\n`);
      git(repo, "add", `feature-${wave}.txt`);
      git(repo, "commit", "-q", "-m", `work ${wave}`);
      git(repo, "checkout", "-q", "main");
      forgeOk(
        "spec-branch",
        "integrate",
        "--spec",
        "demo",
        "--wave",
        String(wave),
        "--branch",
        waveBranch,
        "--tickets",
        ticketId,
      );
      forgeOk("tracker", "set-state", ticketId, "in-progress");
      forgeOk("tracker", "close", ticketId);
    });
    expect(frontierIds()).toEqual([]);
    expect(git(repo, "rev-parse", "main")).toBe(trunkBefore);

    const status: unknown = JSON.parse(forgeOk("spec-branch", "status", "--spec", "demo"));
    const waves = isObject(status) && Array.isArray(status.waves) ? status.waves : [];
    expect(waves).toHaveLength(3);

    forgeOk("spec-branch", "sync", "--spec", "demo");
    const specTip = git(repo, "rev-parse", "spec/demo");

    forgeOk("spec-branch", "land", "--spec", "demo");
    expect(Number(git(repo, "rev-list", "--count", "--first-parent", "main"))).toBe(
      trunkCommitsBefore + 1,
    );
    expect(git(repo, "rev-parse", "main")).not.toBe(specTip);
    expect(git(repo, "rev-list", "--parents", "-n", "1", "main").split(" ")).toHaveLength(3);
    for (const wave of [1, 2, 3]) {
      expect(git(repo, "show", "main:feature-" + wave + ".txt")).toBe(`feature ${wave}`);
    }

    forgeOk("cleanup", "--all");

    const preflight = forge("preflight");
    expect(preflight.stderr).toBe("");
    expect(preflight.exitCode).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI_ENTRY = path.resolve(import.meta.dir, "../bin/forge.ts");

let repo = "";
let emptyBin = "";
let scratchDir = "";

type CliResult = { readonly exitCode: number; readonly stdout: string; readonly stderr: string };

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function forge(...args: string[]): CliResult {
  const result = Bun.spawnSync([process.execPath, CLI_ENTRY, ...args], {
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `${emptyBin}:${path.dirname(process.execPath)}:/usr/bin:/bin` },
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
  const guidePath = path.join(repo, "docs", "agents", "forge.md");
  writeFileSync(guidePath, readFileSync(guidePath, "utf8").replaceAll("TODO(forge):", "Done:"));
}

describe("local flow", () => {
  test("init, tickets, frontier, land, cleanup and preflight with no remote and no gh", () => {
    expect(Bun.which("gh", { PATH: emptyBin })).toBeNull();
    expect(git(repo, "remote")).toBe("");

    forgeOk("init", "--tracker", "local");
    resolveInitTodoMarkers();
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore: forge init");

    const bodyFile = path.join(scratchDir, "body.md");
    writeFileSync(bodyFile, "body\n");
    forgeOk("tracker", "create-spec", "--slug", "demo", "--title", "Demo", "--body-file", bodyFile);
    forgeOk(
      "tracker",
      "create-ticket",
      "--spec",
      "demo",
      "--title",
      "One",
      "--body-file",
      bodyFile,
    );
    forgeOk(
      "tracker",
      "create-ticket",
      "--spec",
      "demo",
      "--title",
      "Two",
      "--body-file",
      bodyFile,
      "--blocked-by",
      "01",
    );
    expect(frontierIds()).toEqual(["demo-01"]);

    forgeOk("tracker", "set-state", "demo-01", "in-progress");
    forgeOk("tracker", "close", "demo-01");
    expect(frontierIds()).toEqual(["demo-02"]);

    const branch = "forge-demo-wave-1";
    git(repo, "checkout", "-q", "-b", branch);
    writeFileSync(path.join(repo, "feature.txt"), "feature\n");
    git(repo, "add", "feature.txt");
    git(repo, "commit", "-q", "-m", "work one");
    git(repo, "checkout", "-q", "main");

    const commitsBefore = Number(git(repo, "rev-list", "--count", "main"));
    forgeOk(
      "land",
      "--spec",
      "demo",
      "--branch",
      branch,
      "--tickets",
      "demo-01",
      "--summary",
      "add feature",
      "--wave",
      "1",
    );
    expect(Number(git(repo, "rev-list", "--count", "main"))).toBe(commitsBefore + 1);

    forgeOk("cleanup", "--all");
    expect(git(repo, "branch", "--list", branch)).toBe("");

    const preflight = forge("preflight");
    expect(preflight.stderr).toBe("");
    expect(preflight.exitCode).toBe(0);
  });
});

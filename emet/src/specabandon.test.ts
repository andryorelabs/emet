import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_FORGE_CONFIG } from "./config";
import { exitCodes } from "./exit-codes";
import { runAbandon } from "./specabandon";
import type { SpecBranchContext } from "./specbranch";

let repo = "";
let stateRoot = "";
let originalStateDir: string | undefined;

function git(...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function writeTicket(name: string, status: string): void {
  const directory = path.join(repo, ".scratch", "feat", "issues");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, name), `# Ticket\nStatus: ${status}\nBlocked by: None\n`);
}

function ticketStatus(name: string): string {
  const text = readFileSync(path.join(repo, ".scratch", "feat", "issues", name), "utf8");
  return /^Status: (\S+)/m.exec(text)?.[1] ?? "";
}

function contextFor(kind: "local" | "github"): SpecBranchContext {
  return {
    root: repo,
    spec: "feat",
    config: { ...DEFAULT_FORGE_CONFIG, tracker: { kind } },
    trunk: "main",
  };
}

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-abandon-")));
  stateRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-abandon-state-")));
  originalStateDir = process.env.EMET_STATE_DIR;
  process.env.EMET_STATE_DIR = stateRoot;
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  git("commit", "-q", "--allow-empty", "-m", "init");
  git("checkout", "-q", "-b", "spec/feat");
  git("commit", "-q", "--allow-empty", "-m", "merge wave\n\nEmet-Wave: 1\nEmet-Tickets: feat-01");
  git("checkout", "-q", "main");
  writeTicket("01-a.md", "in-review");
});

afterEach(() => {
  if (originalStateDir === undefined) delete process.env.EMET_STATE_DIR;
  else process.env.EMET_STATE_DIR = originalStateDir;
  rmSync(repo, { recursive: true, force: true });
  rmSync(stateRoot, { recursive: true, force: true });
});

describe("spec-branch abandon", () => {
  test("without --force it refuses and changes nothing", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runAbandon([], contextFor("local"))).toBe(exitCodes.findings);
    expect(errors.mock.calls[0]?.[0]).toContain("--force");
    errors.mockRestore();
    expect(git("branch", "--list", "spec/feat")).toContain("spec/feat");
    expect(git("tag", "--list")).toBe("");
    expect(ticketStatus("01-a.md")).toBe("in-review");
  });

  test("with --force it tags, deletes the branch, resets local tickets and journals", async () => {
    const tip = git("rev-parse", "spec/feat");
    const logs = spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runAbandon(["--force"], contextFor("local"))).toBe(exitCodes.success);
    logs.mockRestore();
    expect(git("rev-parse", "abandoned/spec-feat")).toBe(tip);
    expect(git("branch", "--list", "spec/feat")).toBe("");
    expect(ticketStatus("01-a.md")).toBe("ready-for-agent");
    const journal = Bun.spawnSync(["grep", "-rl", "spec.abandon", stateRoot]);
    expect(journal.exitCode).toBe(0);
  });

  test("a non-local tracker leaves tickets for the coordinator", async () => {
    const logs = spyOn(console, "log").mockImplementation(() => undefined);
    expect(await runAbandon(["--force"], contextFor("github"))).toBe(exitCodes.success);
    const printed = String(logs.mock.calls[0]?.[0]);
    logs.mockRestore();
    expect(printed).toContain('"forCoordinator":["feat-01"]');
    expect(ticketStatus("01-a.md")).toBe("in-review");
  });

  test("a missing branch is refused", async () => {
    git("branch", "--delete", "--force", "spec/feat");
    const errors = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runAbandon(["--force"], contextFor("local"))).toBe(exitCodes.findings);
    errors.mockRestore();
    expect(git("tag", "--list")).toBe("");
  });
});

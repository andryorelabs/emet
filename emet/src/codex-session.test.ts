import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CommandRunner } from "./agenthost";
import {
  codexPermissionArgs,
  codexSessionPaths,
  codexSkillPrompt,
  isProcessAlive,
  listCodexSessions,
  resolveSessionRoot,
  startCodexSession,
} from "./codex-session";
import { isObject } from "./narrow";

const FAKE = path.resolve(import.meta.dir, "../../tools/fixtures/fake-codex/codex");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codex-session-"));
  scratch.push(dir);
  return dir;
}

const failingRunner: CommandRunner = () =>
  Promise.resolve({ exitCode: 128, stdout: "", stderr: "x" });

const noRunner: CommandRunner = () => Promise.reject(new Error("runner must not be called"));

function writeFakeScript(dir: string): { script: string; log: string } {
  const script = path.join(dir, "script.json");
  const log = path.join(dir, "log.jsonl");
  writeFileSync(
    script,
    JSON.stringify({ lines: [{ type: "thread.started", thread_id: "th-77" }] }),
  );
  return { script, log };
}

function readArgv(line: string): string[] {
  const parsed: unknown = JSON.parse(line);
  const argv = isObject(parsed) ? parsed["argv"] : undefined;
  if (!Array.isArray(argv)) throw new Error("expected argv");
  return argv.map(String);
}

function readRecord(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isObject(parsed)) throw new Error("expected a JSON object");
  return parsed;
}

function recordSession(repo: string, name: string, pid: number, threadId: string | null): void {
  const paths = codexSessionPaths(repo, name);
  mkdirSync(path.dirname(paths.recordFile), { recursive: true });
  writeFileSync(paths.recordFile, JSON.stringify({ name }));
  writeFileSync(
    paths.stateFile,
    JSON.stringify({ pid, threadId, startedAt: "", jsonlPath: paths.jsonlPath, cwd: repo }),
  );
}

describe("startCodexSession", () => {
  test("starts the fake codex with the skill prompt and records the thread id", async () => {
    const repo = tempDir();
    const home = tempDir();
    const { script, log } = writeFakeScript(tempDir());
    const info = await startCodexSession(
      {
        name: "emet-345-w4",
        permissionMode: "bypassPermissions",
        prompt: "/emet:run --dispatch 345",
        cwd: repo,
      },
      noRunner,
      {
        executable: FAKE,
        env: { FAKE_CODEX_SCRIPT: script, FAKE_CODEX_LOG: log, HOME: home, CODEX_HOME: home },
      },
    );
    expect(info).toEqual({ id: "th-77", name: "emet-345-w4" });
    const paths = codexSessionPaths(repo, "emet-345-w4");
    expect(paths.recordFile).toBe(
      path.join(repo, ".emet/runs/emet-345-w4/sessions/emet-345-w4.json"),
    );
    const record = readRecord(paths.recordFile);
    expect(record["threadId"]).toBe("th-77");
    expect(record["name"]).toBe("emet-345-w4");
    expect(typeof record["pid"]).toBe("number");
    const logged = readFileSync(log, "utf8").trim().split("\n")[0] ?? "{}";
    const argv = readArgv(logged);
    expect(argv.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(argv.at(-1)).toBe("$emet:run --dispatch 345");
    expect(argv).toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  test("records a null thread id when the stream never names one", async () => {
    const repo = tempDir();
    const info = await startCodexSession(
      { name: "emet-1-w1", permissionMode: "auto", prompt: "/emet:run --dispatch 1", cwd: repo },
      noRunner,
      { executable: FAKE },
    );
    expect(info.id).toBeNull();
    expect(readRecord(codexSessionPaths(repo, "emet-1-w1").recordFile)["threadId"]).toBeNull();
  }, 10_000);
});

describe("listCodexSessions", () => {
  test("lists live sessions with their thread id and skips dead ones", () => {
    const repo = tempDir();
    recordSession(repo, "emet-9-w1", 111, "th-a");
    recordSession(repo, "emet-9-w2", 222, "th-b");
    expect(listCodexSessions(repo, (pid) => pid === 111)).toEqual([
      { id: "th-a", name: "emet-9-w1" },
    ]);
  });

  test("is empty without a runs directory", () => {
    expect(listCodexSessions(tempDir())).toEqual([]);
  });

  test("the host list reads the git root through the runner", async () => {
    const repo = tempDir();
    recordSession(repo, "emet-9-w1", process.pid, null);
    const runner: CommandRunner = () =>
      Promise.resolve({ exitCode: 0, stdout: `${repo}\n`, stderr: "" });
    const { codexHost } = await import("./agenthost-codex");
    expect(await codexHost.sessions.list(runner)).toEqual([{ id: null, name: "emet-9-w1" }]);
  });
});

describe("helpers", () => {
  test("rewrites a slash prompt into the skill form", () => {
    expect(codexSkillPrompt("/emet:run --dispatch 5")).toBe("$emet:run --dispatch 5");
    expect(codexSkillPrompt("plain")).toBe("plain");
  });

  test("maps permission modes", () => {
    expect(codexPermissionArgs("auto")).toEqual(["--sandbox", "workspace-write"]);
    expect(codexPermissionArgs("bypassPermissions")).toEqual([
      "--dangerously-bypass-approvals-and-sandbox",
    ]);
  });

  test("isProcessAlive sees this process and not a bogus pid", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(2 ** 22 + 12345)).toBe(false);
  });

  test("resolveSessionRoot falls back to the cwd when git fails", async () => {
    expect(await resolveSessionRoot(failingRunner)).toBe(process.cwd());
  });
});

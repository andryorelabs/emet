import { afterEach, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { isObject } from "./narrow";
import {
  codexWorkerLiveness,
  currentPidNamespace,
  parseThreadId,
  readCodexState,
  refreshThreadId,
  spawnCodex,
  type ProcessIo,
} from "./codex-process";

const FAKE = path.resolve(import.meta.dir, "../../tools/fixtures/fake-codex/codex");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "codex-process-"));
  scratch.push(dir);
  return dir;
}

type SpawnCall = Parameters<ProcessIo["spawn"]>;

function onlyCall(calls: SpawnCall[]): SpawnCall {
  const [call] = calls;
  if (call === undefined) throw new Error("spawn was not called");
  return call;
}

async function waitUntil(predicate: () => boolean, remainingMs = 5000): Promise<void> {
  if (predicate() || remainingMs <= 0) return;
  await Bun.sleep(25);
  return waitUntil(predicate, remainingMs - 25);
}

function parseRecord(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed)) throw new Error("expected a JSON object");
  return parsed;
}

function recordingIo(setsid: boolean, pid: number | null = 4242) {
  const calls: SpawnCall[] = [];
  let unrefs = 0;
  const io: ProcessIo = {
    spawn: (...call) => {
      calls.push(call);
      return {
        ...(pid === null ? {} : { pid }),
        unref: () => {
          unrefs += 1;
        },
      };
    },
    hasSetsid: () => setsid,
  };
  return { io, calls, unrefCount: () => unrefs };
}

function specIn(dir: string) {
  return {
    args: ["exec", "--json"],
    cwd: dir,
    codexHome: path.join(dir, "home"),
    jsonlPath: path.join(dir, "codex", "T1.jsonl"),
    stateFile: path.join(dir, "codex", "T1.state.json"),
  };
}

describe("spawnCodex", () => {
  test("wraps codex in setsid, detaches and records the pid", () => {
    const dir = tempDir();
    const { io, calls, unrefCount } = recordingIo(true);
    const result = spawnCodex(specIn(dir), io);
    expect(result).toEqual({ pid: 4242, stateFile: path.join(dir, "codex", "T1.state.json") });
    const [command, args, options] = onlyCall(calls);
    expect(command).toBe("setsid");
    expect(args).toEqual(["codex", "exec", "--json"]);
    expect(options.detached).toBe(false);
    expect(options.env["CODEX_HOME"]).toBe(path.join(dir, "home"));
    expect(options.env["EMET_AGENT_HOST"]).toBe("codex");
    expect(unrefCount()).toBe(1);
    expect(readCodexState(result.stateFile)?.pid).toBe(4242);
    expect(readCodexState(result.stateFile)?.threadId).toBeNull();
    expect(readCodexState(result.stateFile)?.jsonlPath).toBe(specIn(dir).jsonlPath);
    expect(readCodexState(result.stateFile)?.pidNamespace).toBe(currentPidNamespace());
  });

  test("falls back to a detached spawn without setsid", () => {
    const dir = tempDir();
    const { io, calls } = recordingIo(false);
    spawnCodex({ ...specIn(dir), executable: "/x/codex" }, io);
    const [command, args, options] = onlyCall(calls);
    expect(command).toBe("/x/codex");
    expect(args).toEqual(["exec", "--json"]);
    expect(options.detached).toBe(true);
  });

  test("throws and writes no state when no pid comes back", () => {
    const dir = tempDir();
    const { io } = recordingIo(true, null);
    expect(() => spawnCodex(specIn(dir), io)).toThrow("failed to start codex");
    expect(existsSync(specIn(dir).stateFile)).toBe(false);
  });

  test("captures the fake codex events in the JSONL file", async () => {
    const dir = tempDir();
    const scriptFile = path.join(dir, "script.json");
    const logFile = path.join(dir, "log.jsonl");
    writeFileSync(
      scriptFile,
      JSON.stringify({ lines: [{ type: "thread.started", thread_id: "th-9" }] }),
    );
    const spec = {
      ...specIn(dir),
      executable: FAKE,
      env: { FAKE_CODEX_SCRIPT: scriptFile, FAKE_CODEX_LOG: logFile },
    };
    const { pid, stateFile } = spawnCodex(spec);
    await waitUntil(() => existsSync(logFile));
    await waitUntil(() => readFileSync(spec.jsonlPath, "utf8").includes("th-9"));
    expect(pid).toBeGreaterThan(0);
    const logged = parseRecord(readFileSync(logFile, "utf8").trim().split("\n")[0] ?? "{}");
    expect(logged["argv"]).toEqual(["exec", "--json"]);
    expect(isObject(logged["env"]) ? logged["env"]["CODEX_HOME"] : undefined).toBe(spec.codexHome);
    expect(refreshThreadId(stateFile)?.threadId).toBe("th-9");
    expect(readCodexState(stateFile)?.threadId).toBe("th-9");
  });
});

describe("thread id", () => {
  test("parseThreadId reads the first thread.started event", () => {
    const jsonl = [
      "not json thread.started",
      JSON.stringify({ type: "turn.started" }),
      JSON.stringify({ type: "thread.started", thread_id: "a" }),
      JSON.stringify({ type: "thread.started", thread_id: "b" }),
    ].join("\n");
    expect(parseThreadId(jsonl)).toBe("a");
    expect(parseThreadId("")).toBeUndefined();
  });

  test("refreshThreadId tolerates a missing state file and a missing stream", () => {
    const dir = tempDir();
    expect(refreshThreadId(path.join(dir, "none.json"))).toBeUndefined();
    const { io } = recordingIo(true);
    const { stateFile } = spawnCodex(specIn(dir), io);
    expect(refreshThreadId(stateFile)?.threadId).toBeNull();
  });

  test("readCodexState rejects malformed files", () => {
    const dir = tempDir();
    const file = path.join(dir, "s.json");
    expect(readCodexState(file)).toBeUndefined();
    writeFileSync(file, "{not json");
    expect(readCodexState(file)).toBeUndefined();
    writeFileSync(file, JSON.stringify({ pid: "x" }));
    expect(readCodexState(file)).toBeUndefined();
  });
});

describe("codexWorkerLiveness", () => {
  const IDLE_MS = 60_000;
  const NOW = Date.parse("2026-11-09T12:00:00Z");

  function workerIn(dir: string, pidNamespace: string | null) {
    const jsonlPath = path.join(dir, "codex", "T1.jsonl");
    mkdirSync(path.dirname(jsonlPath), { recursive: true });
    writeFileSync(jsonlPath, `${JSON.stringify({ type: "thread.started", thread_id: "th-1" })}\n`);
    const state = {
      pid: 36,
      threadId: "th-1",
      startedAt: new Date(NOW - 5 * IDLE_MS).toISOString(),
      jsonlPath,
      cwd: dir,
      pidNamespace,
    };
    const touch = (ageMs: number) => {
      const seconds = (NOW - ageMs) / 1000;
      utimesSync(jsonlPath, seconds, seconds);
    };
    return { state, jsonlPath, touch };
  }

  test("a foreign-namespace worker whose pid looks dead is live while its jsonl grows", () => {
    const { state, jsonlPath, touch } = workerIn(tempDir(), "pid:[1]");
    const probe = { now: NOW, idleMs: IDLE_MS, pidNamespace: "pid:[2]", isPidAlive: () => false };
    appendFileSync(jsonlPath, `${JSON.stringify({ type: "item.started" })}\n`);
    touch(1000);
    expect(codexWorkerLiveness(state, probe)).toBe("live");
    appendFileSync(jsonlPath, `${JSON.stringify({ type: "turn.completed" })}\n`);
    expect(codexWorkerLiveness(state, probe)).toBe("done");
  });

  test("a foreign-namespace pid that looks alive does not keep a silent worker live", () => {
    const { state, touch } = workerIn(tempDir(), "pid:[1]");
    touch(2 * IDLE_MS);
    const probe = { now: NOW, idleMs: IDLE_MS, pidNamespace: "pid:[2]", isPidAlive: () => true };
    expect(codexWorkerLiveness(state, probe)).toBe("stalled");
  });

  test("in the same namespace a dead pid without turn.completed has exited", () => {
    const { state, touch } = workerIn(tempDir(), "pid:[1]");
    touch(0);
    const probe = { now: NOW, idleMs: IDLE_MS, pidNamespace: "pid:[1]", isPidAlive: () => false };
    expect(codexWorkerLiveness(state, probe)).toBe("exited");
    expect(codexWorkerLiveness(state, { ...probe, isPidAlive: () => true })).toBe("live");
  });

  test("turn.failed is done and a missing stream is judged from startedAt", () => {
    const dir = tempDir();
    const { state, jsonlPath } = workerIn(dir, null);
    const probe = { now: NOW, idleMs: IDLE_MS, pidNamespace: null, isPidAlive: () => true };
    appendFileSync(jsonlPath, `${JSON.stringify({ type: "turn.failed" })}\n`);
    expect(codexWorkerLiveness(state, probe)).toBe("done");
    const missing = { ...state, jsonlPath: path.join(dir, "absent.jsonl") };
    expect(codexWorkerLiveness(missing, probe)).toBe("stalled");
    expect(codexWorkerLiveness({ ...missing, startedAt: new Date(NOW).toISOString() }, probe)).toBe(
      "live",
    );
  });
});

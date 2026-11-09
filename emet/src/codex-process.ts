import { spawn as nodeSpawn } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { isObject } from "./narrow";

/** What `spawnCodex` starts: a `codex` invocation whose events are captured as JSONL. */
export type CodexSpawn = {
  /** The `codex` arguments, starting at the subcommand (`exec`, ...). */
  readonly args: readonly string[];
  readonly cwd: string;
  /** The per-run `CODEX_HOME` overlay the process runs under. */
  readonly codexHome: string;
  /** Where stdout (the `exec --json` event stream) is appended. */
  readonly jsonlPath: string;
  /** Where the identity (thread id, JSONL path) and the auxiliary pid are recorded. */
  readonly stateFile: string;
  readonly env?: NodeJS.ProcessEnv;
  /** The executable to start; `codex` when absent. */
  readonly executable?: string;
};

type SpawnedProcess = { readonly pid?: number | undefined; unref(): void };

export type ProcessIo = {
  spawn(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly env: NodeJS.ProcessEnv;
      readonly stdio: readonly ["ignore", number, number];
      readonly detached: boolean;
    },
  ): SpawnedProcess;
  /** Whether a `setsid` binary is available to start the process in its own session. */
  hasSetsid(): boolean;
};

/**
 * A Codex worker's recorded state. Its identity is `threadId` (from the
 * `thread.started` event) plus `jsonlPath`; `pid` is auxiliary and only
 * meaningful from the pid namespace recorded in `pidNamespace`.
 */
export type CodexState = {
  readonly pid: number;
  readonly threadId: string | null;
  readonly startedAt: string;
  readonly jsonlPath: string;
  readonly cwd: string;
  /** The spawner's pid namespace; `null` when unknown (no `/proc`, older state). */
  readonly pidNamespace: string | null;
};

/**
 * `done`: the stream holds `turn.completed` or `turn.failed`. `live`: the
 * stream grew within the idle window. `exited`: the pid is gone in our
 * namespace without a finished turn. `stalled`: quiet past the idle window.
 */
export type CodexWorkerLiveness = "done" | "live" | "exited" | "stalled";

/** What {@link codexWorkerLiveness} judges against; tests inject the clock and pid probe. */
export type LivenessProbe = {
  readonly idleMs: number;
  readonly now?: number;
  readonly pidNamespace?: string | null;
  readonly isPidAlive?: (pid: number) => boolean;
};

const TERMINAL_EVENTS = new Set(["turn.completed", "turn.failed"]);

const DEFAULT_IO: ProcessIo = {
  spawn: (command, args, options) => {
    const child = nodeSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: [...options.stdio],
      detached: options.detached,
    });
    child.once("error", () => undefined);
    return child;
  },
  hasSetsid: () => Bun.which("setsid") !== null,
};

/**
 * This process's pid namespace (`/proc/self/ns/pid` link text), or `null`
 * where there is none (macOS). A pid recorded from another namespace, such as
 * a nested dispatch inside a sandbox, names an unrelated process here.
 */
export function currentPidNamespace(): string | null {
  try {
    return readlinkSync("/proc/self/ns/pid");
  } catch {
    return null;
  }
}

/** Whether `pid` exists from this process's view; `EPERM` still means it exists. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function writeState(stateFile: string, state: CodexState): void {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Starts `codex` detached from the caller, in its own session through `setsid`
 * when the host has it (a plain detached spawn otherwise), with stdout
 * appended to `jsonlPath` and stderr to `<jsonlPath>.err`. Records the JSONL
 * path, the auxiliary pid and its namespace in the state file; the thread id
 * is filled in later by {@link refreshThreadId}.
 */
export function spawnCodex(
  spec: CodexSpawn,
  io: ProcessIo = DEFAULT_IO,
): { pid: number; stateFile: string } {
  mkdirSync(path.dirname(spec.jsonlPath), { recursive: true });
  const stdoutFd = openSync(spec.jsonlPath, "a");
  const stderrFd = openSync(`${spec.jsonlPath}.err`, "a");
  const executable = spec.executable ?? "codex";
  const useSetsid = io.hasSetsid();
  try {
    const child = io.spawn(
      useSetsid ? "setsid" : executable,
      useSetsid ? [executable, ...spec.args] : spec.args,
      {
        cwd: spec.cwd,
        env: {
          ...process.env,
          ...spec.env,
          CODEX_HOME: spec.codexHome,
          EMET_AGENT_HOST: "codex",
        },
        stdio: ["ignore", stdoutFd, stderrFd],
        detached: !useSetsid,
      },
    );
    const { pid } = child;
    if (pid === undefined) throw new Error(`failed to start ${executable}`);
    child.unref();
    writeState(spec.stateFile, {
      pid,
      threadId: null,
      startedAt: new Date().toISOString(),
      jsonlPath: spec.jsonlPath,
      cwd: spec.cwd,
      pidNamespace: currentPidNamespace(),
    });
    return { pid, stateFile: spec.stateFile };
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
}

/** The recorded state, or `undefined` when the file is absent or malformed. */
export function readCodexState(stateFile: string): CodexState | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(stateFile, "utf8"));
    if (!isObject(raw) || typeof raw["pid"] !== "number") return undefined;
    return {
      pid: raw["pid"],
      threadId: typeof raw["threadId"] === "string" ? raw["threadId"] : null,
      startedAt: typeof raw["startedAt"] === "string" ? raw["startedAt"] : "",
      jsonlPath: typeof raw["jsonlPath"] === "string" ? raw["jsonlPath"] : "",
      cwd: typeof raw["cwd"] === "string" ? raw["cwd"] : "",
      pidNamespace: typeof raw["pidNamespace"] === "string" ? raw["pidNamespace"] : null,
    };
  } catch {
    return undefined;
  }
}

/** The thread id of the first `thread.started` event in a captured JSONL stream. */
export function parseThreadId(jsonl: string): string | undefined {
  for (const line of jsonl.split("\n")) {
    if (!line.includes("thread.started")) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (isObject(event) && event["type"] === "thread.started") {
        const id = event["thread_id"];
        if (typeof id === "string" && id.length > 0) return id;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Reads the thread id from the captured JSONL and records it in the state
 * file. Returns the state, or `undefined` when there is no state file yet.
 */
export function refreshThreadId(stateFile: string): CodexState | undefined {
  const state = readCodexState(stateFile);
  if (state === undefined) return undefined;
  if (state.threadId !== null) return state;
  let threadId: string | undefined;
  try {
    threadId = parseThreadId(readFileSync(state.jsonlPath, "utf8"));
  } catch {
    return state;
  }
  if (threadId === undefined) return state;
  const updated = { ...state, threadId };
  writeState(stateFile, updated);
  return updated;
}

function hasTerminalEvent(jsonl: string): boolean {
  for (const line of jsonl.split("\n")) {
    if (!line.includes("turn.")) continue;
    try {
      const event: unknown = JSON.parse(line);
      const type = isObject(event) ? event["type"] : undefined;
      if (typeof type === "string" && TERMINAL_EVENTS.has(type)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function readStream(jsonlPath: string): { text: string; modifiedMs: number } | undefined {
  try {
    return { text: readFileSync(jsonlPath, "utf8"), modifiedMs: statSync(jsonlPath).mtimeMs };
  } catch {
    return undefined;
  }
}

/**
 * Judges a Codex worker from its JSONL stream, not its pid: a finished turn
 * is `done`, a stream that grew within `idleMs` is `live`, otherwise
 * `stalled`. The pid only counts when it was recorded in this pid namespace,
 * where a dead pid without a finished turn is `exited`.
 */
export function codexWorkerLiveness(state: CodexState, probe: LivenessProbe): CodexWorkerLiveness {
  const stream = readStream(state.jsonlPath);
  if (stream !== undefined && hasTerminalEvent(stream.text)) return "done";
  if (isPidTrusted(state, probe) && !(probe.isPidAlive ?? isPidAlive)(state.pid)) return "exited";
  const lastActivity = stream?.modifiedMs ?? Date.parse(state.startedAt);
  const now = probe.now ?? Date.now();
  return now - lastActivity <= probe.idleMs ? "live" : "stalled";
}

/** Whether the recorded pid was taken in the namespace the probe runs in. */
export function isPidTrusted(state: CodexState, probe: LivenessProbe): boolean {
  const ownNamespace =
    probe.pidNamespace === undefined ? currentPidNamespace() : probe.pidNamespace;
  return (
    state.pidNamespace === null || ownNamespace === null || state.pidNamespace === ownNamespace
  );
}

import { spawn as nodeSpawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
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
  /** Where the pid and thread id are recorded. */
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

export type CodexState = {
  readonly pid: number;
  readonly threadId: string | null;
  readonly startedAt: string;
  readonly jsonlPath: string;
  readonly cwd: string;
};

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

function writeState(stateFile: string, state: CodexState): void {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Starts `codex` detached from the caller, in its own session through `setsid`
 * when the host has it (a plain detached spawn otherwise), with stdout
 * appended to `jsonlPath` and stderr to `<jsonlPath>.err`. Records the pid in
 * the state file; the thread id is filled in later by {@link refreshThreadId}.
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

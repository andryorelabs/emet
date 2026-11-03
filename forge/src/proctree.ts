import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ParentInfo {
  readonly ppid: number;
  readonly comm: string;
}

/**
 * The three host touchpoints {@link readParent} needs, injectable so tests
 * can simulate Linux procfs and macOS (`ps` only) without a real process.
 */
export interface ProcessTreeReader {
  readonly hasProcfs: () => boolean;
  readonly readFile: (filePath: string) => string;
  readonly runPs: (pid: number) => string | null;
}

function runPsForPid(pid: number): string | null {
  try {
    const result = spawnSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 5000,
    });
    if (result.status !== 0 || typeof result.stdout !== "string") return null;
    return result.stdout;
  } catch {
    return null;
  }
}

export const defaultProcessTreeReader: ProcessTreeReader = {
  hasProcfs: () => existsSync("/proc/self/stat"),
  readFile: (filePath) => readFileSync(filePath, "utf8"),
  runPs: runPsForPid,
};

function toParentInfo(ppid: number, comm: string): ParentInfo | null {
  if (!Number.isSafeInteger(ppid) || ppid <= 0) return null;
  return { ppid, comm: path.basename(comm.trim()) };
}

/**
 * Parses a `/proc/<pid>/stat` line. `comm` sits between the first `(` and
 * the last `)` and may itself contain spaces or parentheses, so the fields
 * after it are located from the last `)`.
 */
function parseProcStat(raw: string): ParentInfo | null {
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open === -1 || close < open) return null;
  const fields = raw
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  return toParentInfo(Number(fields[1]), raw.slice(open + 1, close));
}

/**
 * Parses `ps -o ppid=,comm= -p <pid>` output: `<ppid> <comm>`, where macOS
 * reports `comm` as a full path (reduced here to its basename).
 */
function parsePsLine(raw: string): ParentInfo | null {
  const match = /^\s*(\d+)\s+(.+?)\s*$/m.exec(raw);
  if (match === null) return null;
  return toParentInfo(Number(match[1]), match[2] ?? "");
}

/**
 * Reads a process's parent pid and own command name: procfs when present,
 * `ps -o ppid=,comm= -p <pid>` otherwise (macOS). Returns `null` for a pid
 * that is gone or unparseable — never throws.
 */
export function readParent(
  pid: number,
  reader: ProcessTreeReader = defaultProcessTreeReader,
): ParentInfo | null {
  try {
    if (reader.hasProcfs()) return parseProcStat(reader.readFile(`/proc/${pid}/stat`));
    const output = reader.runPs(pid);
    return output === null ? null : parsePsLine(output);
  } catch {
    return null;
  }
}

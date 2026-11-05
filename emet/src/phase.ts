import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isObject } from "./narrow";
import { resolveRunDir } from "./names";

export type Phase =
  | "planning"
  | "dispatch"
  | "working"
  | "review"
  | "checking"
  | "landing"
  | "done"
  | "failed";

export type PhaseRecord = {
  phase: Phase;
  wave: number | null;
  spec: string | null;
  runId: string | null;
  updatedAt: string;
  outcome?: string;
};

const PHASES: ReadonlySet<string> = new Set([
  "planning",
  "dispatch",
  "working",
  "review",
  "checking",
  "landing",
  "done",
  "failed",
]);

const PHASE_FILE = "phase.json";

function isPhaseRecord(value: unknown): value is PhaseRecord {
  if (!isObject(value) || Array.isArray(value)) return false;
  return (
    typeof value.phase === "string" &&
    PHASES.has(value.phase) &&
    (value.wave === null || typeof value.wave === "number") &&
    (value.spec === null || typeof value.spec === "string") &&
    (value.runId === null || typeof value.runId === "string") &&
    typeof value.updatedAt === "string" &&
    (value.outcome === undefined || typeof value.outcome === "string")
  );
}

/**
 * Atomically writes `<run dir>/phase.json` (temporary file, then rename) so
 * the mascot mod can poll the current phase. Never throws: a failed write must
 * not fail the subcommand that reported the phase.
 */
export function writePhase(root: string, record: Omit<PhaseRecord, "updatedAt">): void {
  try {
    const filePath = path.join(resolveRunDir(root).path, PHASE_FILE);
    mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    const full: PhaseRecord = { ...record, updatedAt: new Date().toISOString() };
    writeFileSync(temporaryPath, `${JSON.stringify(full, null, 2)}\n`);
    renameSync(temporaryPath, filePath);
  } catch {
    return;
  }
}

/** Reads the phase file; `null` when it is missing, unreadable or malformed. */
export function readPhase(root: string): PhaseRecord | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(resolveRunDir(root).path, PHASE_FILE), "utf8"),
    );
    return isPhaseRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

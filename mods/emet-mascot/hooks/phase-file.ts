export type PhaseName =
  | "planning"
  | "dispatch"
  | "working"
  | "review"
  | "checking"
  | "landing"
  | "done"
  | "failed";

export type PhaseRecord = {
  phase: PhaseName;
  wave: number;
  spec: number;
  runId: string;
  updatedAt: string;
  outcome?: string;
};

const PHASE_NAMES: ReadonlySet<string> = new Set([
  "planning",
  "dispatch",
  "working",
  "review",
  "checking",
  "landing",
  "done",
  "failed",
]);

function isPhaseName(value: unknown): value is PhaseName {
  return typeof value === "string" && PHASE_NAMES.has(value);
}

/**
 * Parses the contents of `.emet/phase.json`. Returns `null` for invalid JSON
 * or any value that does not match the phase record shape.
 */
export function parsePhaseFile(text: string): PhaseRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const phase: unknown = Reflect.get(raw, "phase");
  const wave: unknown = Reflect.get(raw, "wave");
  const spec: unknown = Reflect.get(raw, "spec");
  const runId: unknown = Reflect.get(raw, "runId");
  const updatedAt: unknown = Reflect.get(raw, "updatedAt");
  const outcome: unknown = Reflect.get(raw, "outcome");
  if (
    !isPhaseName(phase) ||
    typeof wave !== "number" ||
    typeof spec !== "number" ||
    typeof runId !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }
  if (outcome !== undefined && typeof outcome !== "string") {
    return null;
  }
  return outcome === undefined
    ? { phase, wave, spec, runId, updatedAt }
    : { phase, wave, spec, runId, updatedAt, outcome };
}

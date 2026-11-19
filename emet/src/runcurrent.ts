/** `emet run current`: prints the active run for the repo, read from the phase file. */

import { resolveRepoRoot } from "./config";
import { exitCodes } from "./exit-codes";
import { readPhase, type Phase } from "./phase";

/** The active run as `emet run current` reports it. */
export interface CurrentRun {
  readonly runId: string | null;
  readonly spec: string | null;
  readonly wave: number | null;
  readonly phase: Phase | null;
  readonly updatedAt: string | null;
  readonly state: "active" | "none";
}

/** Collaborators of {@link describeCurrentRun}; the default reads `.emet/phase.json`. */
export interface DescribeDeps {
  readonly readPhase: typeof readPhase;
}

/** Collaborators of {@link run}. */
export interface RunCurrentDeps extends DescribeDeps {
  readonly resolveRepoRoot: typeof resolveRepoRoot;
}

const NO_RUN: CurrentRun = {
  runId: null,
  spec: null,
  wave: null,
  phase: null,
  updatedAt: null,
  state: "none",
};

const RUN_ID_PATTERN = /^[A-Za-z]+(\d+)w(\d+)$/;
const RUN_ID_TIME_DIGITS = 6;

function parseRunId(runId: string | null): { spec: string | null; wave: number | null } {
  const match = runId === null ? null : RUN_ID_PATTERN.exec(runId);
  const waveDigits = match?.[2]?.slice(0, -RUN_ID_TIME_DIGITS) ?? "";
  return { spec: match?.[1] ?? null, wave: waveDigits === "" ? null : Number(waveDigits) };
}

/** Describes the active run; a missing, malformed or finished phase record is `none`. */
export function describeCurrentRun(root: string, deps: Partial<DescribeDeps> = {}): CurrentRun {
  const record = (deps.readPhase ?? readPhase)(root);
  if (record === null || record.phase === "done" || record.phase === "failed") return NO_RUN;
  const fromRunId = parseRunId(record.runId);
  return {
    runId: record.runId,
    spec: record.spec ?? fromRunId.spec,
    wave: record.wave ?? fromRunId.wave,
    phase: record.phase,
    updatedAt: record.updatedAt,
    state: "active",
  };
}

function formatCurrentRun(current: CurrentRun): string[] {
  if (current.state === "none") return ["no active run"];
  return [
    `run ${current.runId ?? "unknown"}`,
    `spec ${current.spec ?? "none"}, wave ${current.wave ?? "none"}`,
    `phase ${current.phase ?? "unknown"}, updated ${current.updatedAt ?? "unknown"}`,
  ];
}

/** Prints the active run (`--json` for the object); `no active run` still exits 0. */
export async function run(argv: string[], overrides: Partial<RunCurrentDeps> = {}): Promise<void> {
  if (argv.find((token) => !token.startsWith("--")) !== "current") {
    console.error("usage: emet run current [--json]");
    process.exitCode = exitCodes.usage;
    return;
  }
  const root = await (overrides.resolveRepoRoot ?? resolveRepoRoot)();
  if (root === null) {
    console.error("emet run current: not inside a git repository");
    process.exitCode = exitCodes.usage;
    return;
  }
  const current = describeCurrentRun(root, overrides);
  if (argv.includes("--json")) console.log(JSON.stringify(current));
  else for (const line of formatCurrentRun(current)) console.log(line);
}

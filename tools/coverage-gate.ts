import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { COVERAGE_EXCEPTIONS } from "./coverage-exceptions";

export interface CoverageTotals {
  readonly lines: number;
  readonly functions: number;
}

export type CoverageFloors = Readonly<Record<string, CoverageTotals>>;

export interface FileCoverage {
  readonly file: string;
  readonly lines: number;
  readonly functions: number;
}

export interface CoverageException {
  readonly file: string;
  readonly reason: string;
  readonly lines: number;
  readonly functions: number;
}

export interface GateResult {
  readonly passed: boolean;
  readonly message: string;
}

/** Minimum covered line fraction for every file. */
export const FILE_LINES_FLOOR = 0.97;

/** Minimum covered function fraction for every file. */
export const FILE_FUNCTIONS_FLOOR = 0.98;

/** Repository-relative directory of each workspace whose files are gated one by one. */
const WORKSPACE_ROOTS: Readonly<Record<string, string>> = {
  emet: "emet/",
  "apps/site": "apps/site/",
  tools: "tools/",
};

const FLOORS_PATH = path.resolve(import.meta.dir, "coverage-floors.json");

function sumField(lcov: string, field: string): number {
  let total = 0;
  for (const line of lcov.split("\n")) {
    if (line.startsWith(`${field}:`)) total += Number(line.slice(field.length + 1));
  }
  return total;
}

/** Sums `LF`/`LH` and `FNF`/`FNH` over every record and returns the covered fractions. */
export function parseLcovTotals(lcov: string): CoverageTotals {
  const linesFound = sumField(lcov, "LF");
  const functionsFound = sumField(lcov, "FNF");
  return {
    lines: linesFound === 0 ? 0 : sumField(lcov, "LH") / linesFound,
    functions: functionsFound === 0 ? 0 : sumField(lcov, "FNH") / functionsFound,
  };
}

function fraction(hit: number, found: number): number {
  return found === 0 ? 1 : hit / found;
}

function recordField(record: string, field: string): number {
  const match = new RegExp(`^${field}:(\\d+)`, "m").exec(record);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}

/** Reads one covered fraction pair per `SF` record; an empty denominator counts as fully covered. */
export function parseLcovFiles(lcov: string): readonly FileCoverage[] {
  const files: FileCoverage[] = [];
  for (const record of lcov.split("end_of_record")) {
    const file = /^SF:(.+)$/m.exec(record)?.[1];
    if (file === undefined) continue;
    files.push({
      file: file.trim(),
      lines: fraction(recordField(record, "LH"), recordField(record, "LF")),
      functions: fraction(recordField(record, "FNH"), recordField(record, "FNF")),
    });
  }
  return files;
}

function belowFloor(lines: number, functions: number, floor: CoverageTotals): boolean {
  return lines < floor.lines || functions < floor.functions;
}

function describeException(
  exception: CoverageException,
  measured: FileCoverage | undefined,
): string | undefined {
  if (measured === undefined) return `${exception.file}: exception names a file with no coverage`;
  if (exception.reason.trim() === "") return `${exception.file}: exception has no reason`;
  const fileFloor = { lines: FILE_LINES_FLOOR, functions: FILE_FUNCTIONS_FLOOR };
  if (!belowFloor(measured.lines, measured.functions, fileFloor)) {
    return `${exception.file}: exception is stale, the file meets the per-file floor`;
  }
  if (belowFloor(measured.lines, measured.functions, exception)) {
    return `${exception.file}: lines ${measured.lines.toFixed(4)}, functions ${measured.functions.toFixed(4)} are under the exception floor ${exception.lines}/${exception.functions}`;
  }
  return undefined;
}

/**
 * Enforces the per-file floor (97% lines, 98% functions) with last-resort exceptions.
 * An exception fails when its file is missing, stale, has no reason, or is under its own floor.
 */
export function evaluatePerFile(
  files: readonly FileCoverage[],
  exceptions: readonly CoverageException[],
): GateResult {
  const byFile = new Map(files.map((entry) => [entry.file, entry]));
  const excepted = new Set(exceptions.map((exception) => exception.file));
  const problems: string[] = [];
  for (const entry of files) {
    if (excepted.has(entry.file)) continue;
    if (
      belowFloor(entry.lines, entry.functions, {
        lines: FILE_LINES_FLOOR,
        functions: FILE_FUNCTIONS_FLOOR,
      })
    ) {
      problems.push(
        `${entry.file}: lines ${entry.lines.toFixed(4)}, functions ${entry.functions.toFixed(4)} are below the per-file floor ${FILE_LINES_FLOOR}/${FILE_FUNCTIONS_FLOOR}`,
      );
    }
  }
  for (const exception of exceptions) {
    const problem = describeException(exception, byFile.get(exception.file));
    if (problem !== undefined) problems.push(problem);
  }
  if (problems.length === 0) {
    return { passed: true, message: `per-file floor met by ${files.length} files` };
  }
  return { passed: false, message: problems.join("\n") };
}

/** Keeps only the records of the root-level `tools/` workspace, which also loads other workspaces' sources. */
function scopeLcov(workspace: string, lcov: string): string {
  if (workspace !== "tools") return lcov;
  return lcov
    .split("end_of_record")
    .filter((record) => /^SF:tools\//m.test(record))
    .map((record) => `${record}end_of_record`)
    .join("\n");
}

function workspaceFiles(workspace: string, lcov: string): readonly FileCoverage[] {
  const root = WORKSPACE_ROOTS[workspace];
  if (root === undefined) return [];
  return parseLcovFiles(lcov)
    .map((entry) => {
      const file = entry.file.startsWith(root) ? entry.file : `${root}${entry.file}`;
      return { file, lines: entry.lines, functions: entry.functions };
    })
    .filter((entry) => entry.file.startsWith(root));
}

/** Compares measured totals with a workspace floor; a missing floor fails. */
export function evaluateCoverage(
  workspace: string,
  totals: CoverageTotals,
  floors: CoverageFloors,
): GateResult {
  const floor = floors[workspace];
  if (!floor) return { passed: false, message: `no coverage floor for workspace "${workspace}"` };
  const measured = `lines ${totals.lines.toFixed(4)} (floor ${floor.lines}), functions ${totals.functions.toFixed(4)} (floor ${floor.functions})`;
  const passed = totals.lines >= floor.lines && totals.functions >= floor.functions;
  return { passed, message: `${workspace}: ${measured}${passed ? "" : " is below the floor"}` };
}

/** Parses the floors file, keeping only entries with numeric `lines` and `functions`. */
export function parseFloors(json: string): CoverageFloors {
  const raw: unknown = JSON.parse(json);
  const floors: Record<string, CoverageTotals> = {};
  if (typeof raw !== "object" || raw === null) return floors;
  for (const [workspace, value] of Object.entries<unknown>(
    Object.fromEntries(Object.entries(raw)),
  )) {
    if (typeof value !== "object" || value === null) continue;
    const lines: unknown = Reflect.get(value, "lines");
    const functions: unknown = Reflect.get(value, "functions");
    if (typeof lines === "number" && typeof functions === "number") {
      floors[workspace] = { lines, functions };
    }
  }
  return floors;
}

/**
 * Runs the gate for a workspace against an lcov file.
 * @param argv - The workspace name and the lcov path.
 * @param floorsPath - The floors file; defaults to `tools/coverage-floors.json`.
 * @param exceptions - Per-file exceptions; defaults to `tools/coverage-exceptions.ts`.
 * @returns 0 when coverage meets the totals floor and the per-file floor, otherwise 1.
 */
export function runCoverageGate(
  argv: readonly string[],
  floorsPath: string = FLOORS_PATH,
  exceptions: readonly CoverageException[] = COVERAGE_EXCEPTIONS,
): number {
  const [workspace, lcovPath] = argv;
  if (!workspace || !lcovPath) {
    console.error("usage: bun tools/coverage-gate.ts <workspace> <lcov path>");
    return 1;
  }
  if (!existsSync(lcovPath)) {
    console.error(`lcov file not found: ${lcovPath}`);
    return 1;
  }
  const floors = parseFloors(readFileSync(floorsPath, "utf8"));
  const lcov = scopeLcov(workspace, readFileSync(lcovPath, "utf8"));
  const totals = evaluateCoverage(workspace, parseLcovTotals(lcov), floors);
  (totals.passed ? console.log : console.error)(totals.message);
  const root = WORKSPACE_ROOTS[workspace];
  if (root === undefined) return totals.passed ? 0 : 1;
  const scoped = exceptions.filter((exception) => exception.file.startsWith(root));
  const perFile = evaluatePerFile(workspaceFiles(workspace, lcov), scoped);
  (perFile.passed ? console.log : console.error)(perFile.message);
  return totals.passed && perFile.passed ? 0 : 1;
}

if (import.meta.main) process.exit(runCoverageGate(process.argv.slice(2)));

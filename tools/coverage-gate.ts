import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface CoverageTotals {
  readonly lines: number;
  readonly functions: number;
}

export type CoverageFloors = Readonly<Record<string, CoverageTotals>>;

export interface GateResult {
  readonly passed: boolean;
  readonly message: string;
}

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

function main(argv: readonly string[]): number {
  const [workspace, lcovPath] = argv;
  if (!workspace || !lcovPath) {
    console.error("usage: bun tools/coverage-gate.ts <workspace> <lcov path>");
    return 1;
  }
  if (!existsSync(lcovPath)) {
    console.error(`lcov file not found: ${lcovPath}`);
    return 1;
  }
  const floors = parseFloors(readFileSync(FLOORS_PATH, "utf8"));
  const result = evaluateCoverage(
    workspace,
    parseLcovTotals(readFileSync(lcovPath, "utf8")),
    floors,
  );
  (result.passed ? console.log : console.error)(result.message);
  return result.passed ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));

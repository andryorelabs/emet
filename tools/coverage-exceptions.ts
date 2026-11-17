import type { CoverageException } from "./coverage-gate";

/**
 * Files exempt from the per-file floor, each with a reason and its measured floor.
 * A last resort for code a test cannot reach.
 */
export const COVERAGE_EXCEPTIONS: readonly CoverageException[] = [
  {
    file: "emet/src/doctor.ts",
    reason:
      "The missing-MemAvailable branch exists only on non-Linux hosts and the process-argv entrypoint runs only when the file is the main module; Bun reports no per-function data, so three function gaps cannot be located.",
    lines: 0.99,
    functions: 0.96,
  },
];

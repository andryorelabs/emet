import type { CoverageException } from "./coverage-gate";

/**
 * Files exempt from the per-file floor, each with a reason and its measured floor.
 * A last resort for code a test cannot reach.
 */
export const COVERAGE_EXCEPTIONS: readonly CoverageException[] = [
  {
    file: "emet/src/doctor.ts",
    reason:
      "The config-read catch blocks run only after the config validated, so they need a read race; the helpText spawn-failure catch and the missing-MemAvailable branch depend on the host; and the process-argv entrypoint runs only when the file is the main module.",
    lines: 0.98,
    functions: 0.96,
  },
];

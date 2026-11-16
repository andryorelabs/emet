import type { CoverageException } from "./coverage-gate";

/**
 * Files exempt from the per-file floor, each with a reason and its measured floor.
 * A last resort for code a test cannot reach.
 */
export const COVERAGE_EXCEPTIONS: readonly CoverageException[] = [
  {
    file: "emet/src/doctor.ts",
    reason:
      "Unreachable defensive catch blocks around host probes and the process-argv entrypoint that runs only when the file is the main module.",
    lines: 0.98,
    functions: 0.96,
  },
  {
    file: "emet/src/update-notice.ts",
    reason:
      "The default release fetcher calls the live GitHub API and the cache read and write catch blocks need filesystem faults; tests inject a fetcher instead.",
    lines: 0.81,
    functions: 0.88,
  },
];

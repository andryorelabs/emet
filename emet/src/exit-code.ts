/**
 * Reads the process exit code, treating an unset code as success.
 * Reading through a function keeps callers free of the narrowing TypeScript applies after an assignment.
 * @returns The current `process.exitCode`, or 0 when unset.
 */
export function currentExitCode(): number {
  return Number(process.exitCode ?? 0);
}

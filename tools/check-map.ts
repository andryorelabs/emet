const UNKNOWN_STAMP_MARKER = "not in history";

/**
 * Decides the exit code of the map freshness gate from the `emet map --stale`
 * result. A stamp that is missing from history is tolerated, because a squash
 * merge rewrites the stamped branch commit, so trunk can never contain it.
 */
export function mapGateExitCode(exitCode: number, output: string): number {
  if (exitCode === 0) {
    return 0;
  }
  return output.includes(UNKNOWN_STAMP_MARKER) ? 0 : 1;
}

/** The argv of the freshness check the gate wraps. */
export const MAP_STALE_COMMAND: readonly string[] = ["bun", "emet/bin/emet.ts", "map", "--stale"];

/** Where the gate echoes the check's output. */
export interface OutputStream {
  write(text: string): unknown;
}

/**
 * Runs the freshness check, echoes its combined output and returns the gate's exit code.
 * @param command - The argv to run; defaults to `emet map --stale`.
 * @param stream - Where the output is echoed; defaults to stdout.
 * @returns The exit code the process should end with.
 */
export function runMapGate(
  command: readonly string[] = MAP_STALE_COMMAND,
  stream: OutputStream = process.stdout,
): number {
  const result = Bun.spawnSync([...command], { stdout: "pipe", stderr: "pipe" });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  stream.write(output);
  return mapGateExitCode(result.exitCode, output);
}

if (import.meta.main) process.exit(runMapGate());

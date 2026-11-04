const UNKNOWN_STAMP_MARKER = "not in history";

/**
 * Decides the exit code of the map freshness gate from the `forge map --stale`
 * result. A stamp that is missing from history is tolerated, because a squash
 * merge rewrites the stamped branch commit, so trunk can never contain it.
 */
export function mapGateExitCode(exitCode: number, output: string): number {
  if (exitCode === 0) {
    return 0;
  }
  return output.includes(UNKNOWN_STAMP_MARKER) ? 0 : 1;
}

if (import.meta.main) {
  const result = Bun.spawnSync(["bun", "forge/bin/forge.ts", "map", "--stale"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  process.stdout.write(output);
  process.exit(mapGateExitCode(result.exitCode, output));
}

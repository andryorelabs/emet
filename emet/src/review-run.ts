const USAGE = "usage: emet review-run --package <dir> --tier <passive|medium|high>";

/** Stub: the Codex review run is filled in by #356; prints usage and exits 2. */
export function run(_argv: string[]): Promise<number> {
  console.error(USAGE);
  return Promise.resolve(2);
}

const USAGE =
  "usage: emet dispatch --role worker --run <id> --ticket <id> --prompt-file <f> [--wait]";

/** Stub: the Codex worker dispatch is filled in by #355; prints usage and exits 2. */
export function run(_argv: string[]): Promise<number> {
  console.error(USAGE);
  return Promise.resolve(2);
}

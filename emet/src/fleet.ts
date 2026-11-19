/** `emet fleet`: list, set and launch across repos (skeleton). */

import { exitCodes } from "./exit-codes";

/** Skeleton entry point: reports that the command is not implemented yet and exits 2. */
// oxlint-disable-next-line require-await -- the registry types every command as async
export async function run(_argv: string[]): Promise<void> {
  console.error("emet fleet: not implemented");
  process.exitCode = exitCodes.usage;
}

/** `emet run current`: prints the active run for the repo. Skeleton; a later ticket fills it in. */

import { exitCodes } from "./exit-codes";

/** Exits 2 until the command is implemented. */
export function run(_argv: string[]): Promise<void> {
  console.error("emet run current: not implemented");
  process.exit(exitCodes.usage);
}

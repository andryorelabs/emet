/** `emet insights`: reads the journal and reports on it. Skeleton; a later ticket fills it in. */

import { exitCodes } from "./exit-codes";

/** Reports the usage exit code until the command is implemented. */
export function run(_argv: string[]): Promise<void> {
  console.error("emet insights: not implemented");
  process.exitCode = exitCodes.usage;
  return Promise.resolve();
}

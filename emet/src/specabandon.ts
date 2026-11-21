/** `emet spec-branch abandon`: a stub until the abandon ticket fills it. */

import { exitCodes } from "./exit-codes";
import type { SpecBranchContext } from "./specbranch";

/** `emet spec-branch abandon`: not implemented yet. */
export function runAbandon(_argv: string[], _context: SpecBranchContext): Promise<number> {
  console.error("emet spec-branch abandon: not implemented");
  return Promise.resolve(exitCodes.findings);
}

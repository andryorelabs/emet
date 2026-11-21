/** `emet spec-branch sync|land`: stubs until the landing ticket fills them. */

import { exitCodes } from "./exit-codes";
import type { SpecBranchContext } from "./specbranch";

/** `emet spec-branch sync`: not implemented yet. */
export function runSync(_argv: string[], _context: SpecBranchContext): Promise<number> {
  console.error("emet spec-branch sync: not implemented");
  return Promise.resolve(exitCodes.findings);
}

/** `emet spec-branch land`: not implemented yet. */
export function runLand(_argv: string[], _context: SpecBranchContext): Promise<number> {
  console.error("emet spec-branch land: not implemented");
  return Promise.resolve(exitCodes.findings);
}

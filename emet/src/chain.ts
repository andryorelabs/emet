/** Skeleton for `emet chain`; the behavior lands in a later ticket. */

import { BINARY } from "./names";

export function run(_argv: string[]): Promise<void> {
  console.error(`${BINARY} chain: not implemented`);
  process.exitCode = 2;
  return Promise.resolve();
}

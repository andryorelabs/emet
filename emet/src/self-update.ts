import { exitCodes } from "./exit-codes";
import type { SelfDeps } from "./self-install";

/**
 * Runs `emet self update [latest|X.Y.Z] [--auto]`. A stub until the updater lands: it changes
 * nothing and fails with a message.
 */
export function runSelfUpdate(argv: readonly string[], deps: SelfDeps): Promise<number> {
  const shown = argv.length > 0 ? ` ${argv.join(" ")}` : "";
  deps.error(`emet self update${shown}: not available yet; nothing was changed`);
  return Promise.resolve(exitCodes.findings);
}

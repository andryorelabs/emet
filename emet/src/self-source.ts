import { exitCodes } from "./exit-codes";
import type { SelfDeps, SelfInstallOptions } from "./self-install";

/**
 * Installs emet from the checkout at `options.from` as a Bun source install. A stub until the
 * source install lands: it writes nothing and fails with a message.
 */
export function sourceInstall(options: SelfInstallOptions, deps: SelfDeps): Promise<number> {
  deps.error(
    `emet self install --from ${options.from ?? ""}: the source install is not available yet; nothing was written`,
  );
  return Promise.resolve(exitCodes.findings);
}

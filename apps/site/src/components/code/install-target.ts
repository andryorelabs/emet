/** The localStorage key holding the chosen install target. */
export const INSTALL_TARGET_KEY = "emet:install-target";

/** The slice of `Storage` the install target helpers use. */
export interface InstallTargetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Reads the remembered install target.
 * @param storage - The storage to read, or `null` when unavailable.
 * @returns The stored target, or `null` when none is stored or storage throws.
 */
export function readInstallTarget(storage: InstallTargetStorage | null): string | null {
  try {
    return storage?.getItem(INSTALL_TARGET_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remembers the chosen install target, swallowing any storage error.
 * @param storage - The storage to write, or `null` when unavailable.
 * @param value - The tab label to remember.
 */
export function writeInstallTarget(storage: InstallTargetStorage | null, value: string): void {
  try {
    storage?.setItem(INSTALL_TARGET_KEY, value);
  } catch {
    return;
  }
}

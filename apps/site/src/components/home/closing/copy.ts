/** The one-line install command shown in the Closing panel and written by its copy button. */
export const INSTALL_COMMAND = "curl -fsSL https://emet.andryore.dev/install.sh | sh";

/**
 * Writes a command to the clipboard.
 * @param text - The exact command to copy.
 * @param clipboard - The clipboard to write to.
 * @returns `true` when the write succeeded, `false` when the clipboard refused it.
 */
export async function copyCommand(
  text: string,
  clipboard: Pick<Clipboard, "writeText">,
): Promise<boolean> {
  try {
    await clipboard.writeText(text);
    if (typeof globalThis.dispatchEvent === "function") {
      globalThis.dispatchEvent(new CustomEvent("emet:copy"));
    }
    return true;
  } catch {
    return false;
  }
}

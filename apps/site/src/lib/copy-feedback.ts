/** How long the copied or failed state stays visible, in milliseconds. */
export const FEEDBACK_MS = 2000;

/** The outcome of a copy attempt. */
export type CopyResult = "copied" | "failed";

/**
 * Writes text to the clipboard.
 * @param text - The plain text to copy, never markup.
 * @returns `copied` when the write succeeded, `failed` when the clipboard is unavailable or refused it.
 */
export async function copyWithFeedback(text: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

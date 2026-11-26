import { FEEDBACK_MS } from "../../../lib/copy-feedback";
import { copyCommand } from "./copy";

const STATUS_LABELS = { idle: "", copied: "Copied", failed: "Copy failed" } as const;

type CopyState = keyof typeof STATUS_LABELS;

/**
 * Shows a copy state on the button and on its live status node.
 * @param button - The copy button.
 * @param status - The polite live region next to it, if any.
 * @param state - The state to show.
 */
function showState(button: HTMLElement, status: HTMLElement | null, state: CopyState): void {
  button.dataset.state = state;
  if (status) status.textContent = STATUS_LABELS[state];
}

/**
 * Wires every Closing copy button under a root: a click copies the button's
 * `data-command`, shows the result and reverts after the feedback delay.
 * @param root - The node to search for `[data-closing-copy]` buttons.
 * @param clipboard - The clipboard to write to.
 */
export function initClosingCopy(root: ParentNode, clipboard: Pick<Clipboard, "writeText">): void {
  for (const button of root.querySelectorAll<HTMLElement>("[data-closing-copy]")) {
    const status =
      button.parentElement?.querySelector<HTMLElement>("[data-closing-status]") ?? null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const copy = async (): Promise<void> => {
      const copied = await copyCommand(button.dataset.command ?? "", clipboard);
      showState(button, status, copied ? "copied" : "failed");
      clearTimeout(timer);
      timer = setTimeout(() => {
        showState(button, status, "idle");
      }, FEEDBACK_MS);
    };
    button.addEventListener("click", () => {
      void copy();
    });
  }
}

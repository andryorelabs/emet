/**
 * Review gate: the button on the Review scene lanes shows its tooltip on
 * hover and focus, a press pins it open for touch, and Escape dismisses it.
 */

/**
 * Wires the gate button of the Review scene.
 */
export function initReviewGate(scene: HTMLElement): void {
  const gate = scene.querySelector<HTMLButtonElement>(".review-gate");
  if (gate === null) return;
  let hovering = false;
  let focused = false;
  let pinned = false;

  const sync = (): void => {
    if (hovering || focused || pinned) gate.dataset.open = "";
    else delete gate.dataset.open;
  };

  const dismiss = (): void => {
    hovering = false;
    focused = false;
    pinned = false;
    sync();
  };

  gate.inert = false;
  gate.addEventListener("pointerenter", () => {
    hovering = true;
    sync();
  });
  gate.addEventListener("pointerleave", () => {
    hovering = false;
    sync();
  });
  gate.addEventListener("focus", () => {
    focused = true;
    sync();
  });
  gate.addEventListener("blur", () => {
    focused = false;
    pinned = false;
    sync();
  });
  gate.addEventListener("click", () => {
    pinned = !pinned;
    sync();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && "open" in gate.dataset) dismiss();
  });
}

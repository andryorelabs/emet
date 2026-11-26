/**
 * Flag toggle: the button on the Flags scene holds the whole wave while it
 * is pressed, showing the held caption, and releases it when pressed again.
 */

/**
 * Wires the toggle of the Flags scene.
 */
export function initFlagToggle(scene: HTMLElement): void {
  const toggle = scene.querySelector<HTMLButtonElement>(".flags-toggle");
  const caption = scene.querySelector<HTMLElement>(".flags-caption");
  if (toggle === null || caption === null) return;
  const heldText = scene.dataset.heldText ?? "";

  toggle.inert = false;
  toggle.addEventListener("click", () => {
    const held = !("held" in scene.dataset);
    toggle.setAttribute("aria-pressed", String(held));
    if (held) scene.dataset.held = "";
    else delete scene.dataset.held;
    caption.textContent = held ? heldText : "";
  });
}

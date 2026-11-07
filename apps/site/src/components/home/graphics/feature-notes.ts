/**
 * Features plate: hovering or focusing a note dims the plate blocks it does
 * not describe, and on wide screens each note is re-levelled to the measured
 * top of its block so the pairs stay level when the copy changes.
 */
const WIDE = "(min-width: 1101px)";

/** Sets each note's `top` from its block's measured offset, or clears it when stacked. */
function levelNotes(section: Element): void {
  const plate = section.querySelector<HTMLElement>("[data-plate]");
  if (!plate) return;
  const wide = matchMedia(WIDE).matches;
  for (const note of section.querySelectorAll<HTMLElement>(".note")) {
    const block = plate.querySelector<HTMLElement>(`.block[data-block="${note.dataset["block"]}"]`);
    note.style.top = wide && block ? `${plate.offsetTop + block.offsetTop}px` : "";
  }
}

function bindFocus(section: Element): void {
  const plate = section.querySelector<HTMLElement>("[data-plate]");
  if (!plate) return;
  for (const note of section.querySelectorAll<HTMLElement>(".note")) {
    const focus = (): void => {
      plate.dataset["focus"] = note.dataset["block"] ?? "";
    };
    const clear = (): void => {
      delete plate.dataset["focus"];
    };
    note.addEventListener("pointerenter", focus);
    note.addEventListener("pointerleave", clear);
    note.addEventListener("focus", focus);
    note.addEventListener("blur", clear);
  }
}

/** Wires every `[data-features]` section under `root`. */
export function initFeatureNotes(root: ParentNode): void {
  for (const section of root.querySelectorAll("[data-features]")) {
    bindFocus(section);
    levelNotes(section);
    addEventListener("resize", () => levelNotes(section));
    void document.fonts?.ready.then(() => levelNotes(section));
  }
}

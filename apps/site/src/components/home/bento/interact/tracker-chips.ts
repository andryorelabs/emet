/**
 * Tracker chips: the three buttons of the Tracker scene swap the ticket id
 * and its closed state to what that tracker shows, hold the loop while one
 * is chosen, and hand the scene back to the loop after 9 s without a click.
 */

export type TrackerKind = "linear" | "github" | "local";

export const TRACKER_IDLE_MS = 9000;
export const TRACKER_SWAP_MS = 140;
const TICKET_NUMBER = 254;
const KINDS: readonly TrackerKind[] = ["linear", "github", "local"];

/**
 * Returns the id and the closed state of ticket `n` as `kind` writes them.
 */
export function trackerRow(kind: TrackerKind, n: number): { id: string; state: string } {
  if (kind === "linear") return { id: `CLA-${n}`, state: "Done" };
  if (kind === "github") return { id: `#${n}`, state: "closed" };
  return { id: `tickets/${n}.md`, state: "status: done" };
}

function isKind(value: string | undefined): value is TrackerKind {
  return KINDS.some((kind) => kind === value);
}

function restartLoop(scene: HTMLElement): void {
  scene.dataset.restart = "";
  void scene.offsetWidth;
  delete scene.dataset.restart;
}

/**
 * Wires the chip buttons of the Tracker scene.
 */
export function initTrackerChips(scene: HTMLElement): void {
  const chips = [...scene.querySelectorAll<HTMLButtonElement>(".tracker-chip")];
  const id = scene.querySelector<HTMLElement>(".tracker-id");
  const closed = scene.querySelector<HTMLElement>(".tracker-status.is-closed");
  if (chips.length === 0 || id === null || closed === null) return;
  const restingId = id.textContent;
  const restingState = closed.textContent;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let swapTimer: ReturnType<typeof setTimeout> | undefined;

  const show = (idText: string, stateText: string): void => {
    clearTimeout(swapTimer);
    id.dataset.swap = "";
    swapTimer = setTimeout(() => {
      id.textContent = idText;
      closed.textContent = stateText;
      delete id.dataset.swap;
    }, TRACKER_SWAP_MS);
  };

  const returnToAuto = (): void => {
    delete scene.dataset.manual;
    for (const chip of chips) chip.setAttribute("aria-pressed", "false");
    show(restingId, restingState);
    restartLoop(scene);
  };

  chips.forEach((chip, index) => {
    chip.inert = false;
    chip.addEventListener("click", () => {
      const kind = chip.dataset.kind;
      if (!isKind(kind)) return;
      clearTimeout(idleTimer);
      scene.dataset.manual = "";
      scene.style.setProperty("--tracker-selected", String(index));
      for (const other of chips) other.setAttribute("aria-pressed", String(other === chip));
      const row = trackerRow(kind, TICKET_NUMBER);
      show(row.id, row.state);
      idleTimer = setTimeout(returnToAuto, TRACKER_IDLE_MS);
    });
  });
}

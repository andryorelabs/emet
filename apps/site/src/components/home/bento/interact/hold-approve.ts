/**
 * Hold-to-approve: a press that must last `holdMs` before it counts, as a
 * small timer controller plus the wiring of the Approval scene button, which
 * takes over the looping picture while it is hovered, focused or held.
 */

const HOLD_MS = 900;
const SETTLE_AFTER_DONE_MS = 1800;
const SETTLE_AFTER_CANCEL_MS = 300;

export interface HoldOptions {
  holdMs: number;
  onComplete(): void;
  onCancel(): void;
}

export interface HoldController {
  readonly holding: boolean;
  start(): void;
  cancel(): void;
  dispose(): void;
}

/**
 * Creates a hold timer: `start` arms it, `onComplete` fires after `holdMs`
 * unless `cancel` runs first, which fires `onCancel` instead.
 */
export function createHoldController(options: HoldOptions): HoldController {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };

  return {
    get holding(): boolean {
      return timer !== undefined;
    },
    start(): void {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        options.onComplete();
      }, options.holdMs);
    },
    cancel(): void {
      if (timer === undefined) return;
      clear();
      options.onCancel();
    },
    dispose: clear,
  };
}

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === " " || event.key === "Enter";
}

/**
 * Wires the Approval scene: the button fills while held, the stamp lands on
 * completion and the status line announces it. The scene returns to its loop
 * shortly after the pointer and focus leave.
 */
export function initApproval(scene: HTMLElement): void {
  const button = scene.querySelector<HTMLButtonElement>(".approval-button");
  const stamp = scene.querySelector<HTMLElement>(".approval-stamp");
  const status = scene.querySelector<HTMLElement>(".approval-status");
  if (button === null || stamp === null || status === null) return;
  const doneText = scene.dataset.doneText ?? "";
  let hovering = false;
  let focused = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = (): void => {
    clearTimeout(settleTimer);
    const delay = "done" in scene.dataset ? SETTLE_AFTER_DONE_MS : SETTLE_AFTER_CANCEL_MS;
    settleTimer = setTimeout(() => {
      if (controller.holding || hovering || focused) return;
      delete scene.dataset.manual;
      delete scene.dataset.done;
      delete stamp.dataset.pop;
      status.textContent = "";
    }, delay);
  };

  const controller = createHoldController({
    holdMs: HOLD_MS,
    onComplete: () => {
      delete button.dataset.holding;
      scene.dataset.done = "";
      delete stamp.dataset.pop;
      stamp.getBoundingClientRect();
      stamp.dataset.pop = "";
      status.textContent = doneText;
      if (!hovering && !focused) settle();
    },
    onCancel: () => {
      delete button.dataset.holding;
    },
  });

  const engage = (): void => {
    clearTimeout(settleTimer);
    scene.dataset.manual = "";
  };

  const begin = (): void => {
    if (controller.holding) return;
    engage();
    delete scene.dataset.done;
    delete stamp.dataset.pop;
    status.textContent = "";
    button.dataset.holding = "";
    controller.start();
  };

  const release = (): void => {
    controller.cancel();
  };

  button.inert = false;
  button.addEventListener("pointerenter", () => {
    hovering = true;
    engage();
  });
  button.addEventListener("pointerleave", () => {
    hovering = false;
    release();
    settle();
  });
  button.addEventListener("focus", () => {
    focused = true;
    engage();
  });
  button.addEventListener("blur", () => {
    focused = false;
    release();
    settle();
  });
  button.addEventListener("pointerdown", (event) => {
    if (event.button === 0) begin();
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  button.addEventListener("keydown", (event) => {
    if (!isActivationKey(event)) return;
    event.preventDefault();
    if (!event.repeat) begin();
  });
  button.addEventListener("keyup", (event) => {
    if (isActivationKey(event)) release();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
  });
}

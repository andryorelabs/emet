/**
 * Worker diff: hovering or focusing a worktree box types a mini diff into it
 * one character at a time, and clears it when both hover and focus end.
 * With reduced motion the whole line appears at once.
 */

export const TYPE_DURATION_MS = 700;
export const TYPE_STEPS = 16;
export const TYPE_INTERVAL_MS = TYPE_DURATION_MS / TYPE_STEPS;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Returns the first `count` characters of `text`, bounded to its length.
 */
export function typedPrefix(text: string, count: number): string {
  return text.slice(0, Math.max(0, Math.min(count, text.length)));
}

/**
 * Types `text` through `render` on a timer, or all at once when `instant`.
 */
export function createTyper(options: {
  text: string;
  instant: boolean;
  render: (visible: string) => void;
}): { start: () => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = (): void => {
    clearInterval(timer);
    timer = undefined;
    options.render("");
  };
  const start = (): void => {
    clearInterval(timer);
    if (options.instant) {
      options.render(options.text);
      return;
    }
    let count = 0;
    options.render("");
    timer = setInterval(() => {
      count += 1;
      options.render(typedPrefix(options.text, count));
      if (count >= options.text.length) {
        clearInterval(timer);
        timer = undefined;
      }
    }, TYPE_INTERVAL_MS);
  };
  return { start, stop };
}

function wireBox(box: HTMLElement): void {
  const mini = box.querySelector<HTMLElement>(".trees-mini");
  const text = box.dataset.diff;
  if (mini === null || text === undefined) return;
  let hovering = false;
  let focused = false;
  const typer = createTyper({
    text,
    instant: matchMedia(REDUCED_MOTION_QUERY).matches,
    render: (visible) => {
      mini.textContent = visible;
    },
  });
  const sync = (): void => {
    if (hovering || focused) {
      if (!("typing" in box.dataset)) typer.start();
      box.dataset.typing = "";
    } else {
      delete box.dataset.typing;
      typer.stop();
    }
  };
  box.addEventListener("pointerenter", () => {
    hovering = true;
    sync();
  });
  box.addEventListener("pointerleave", () => {
    hovering = false;
    sync();
  });
  box.addEventListener("focus", () => {
    focused = true;
    sync();
  });
  box.addEventListener("blur", () => {
    focused = false;
    sync();
  });
}

/**
 * Wires every worktree box of the Workers scene.
 */
export function initWorkerDiff(scene: HTMLElement): void {
  for (const box of scene.querySelectorAll<HTMLButtonElement>(".trees-box")) {
    box.inert = false;
    wireBox(box);
  }
}

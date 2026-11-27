/**
 * Headline letters that warm up toward amber as the pointer comes close. Each
 * letter gets a `--k` between 0 and 1 (its closeness to the pointer) and the
 * stylesheet turns that into a tint and a glow, so no layout moves. The
 * letters are plain inline spans inside the existing text, which keeps the
 * heading text and its kerning unchanged. Nothing runs under reduced motion,
 * on a coarse pointer or at 900px and below, and the loop stops while the tab
 * is hidden or once every letter has settled.
 */

const REACH_PX = 100;
const FOLLOW = 0.2;
const SETTLED = 0.01;
const MAX_WIDTH = 900;

/** Facts that decide whether the letters react. */
export interface LettersEnv {
  readonly reducedMotion: boolean;
  readonly coarsePointer: boolean;
  readonly viewportWidth: number;
}

/** True for motion-tolerant, fine-pointer viewers wider than 900px. */
export function lettersEnabled(env: LettersEnv): boolean {
  return !env.reducedMotion && !env.coarsePointer && env.viewportWidth > MAX_WIDTH;
}

/** Closeness of a letter to the pointer, 1 on top of it and 0 from 100px away, eased with a square. */
export function letterReach(distance: number): number {
  const near = Math.max(0, 1 - distance / REACH_PX);
  return near * near;
}

/** Moves `current` a fifth of the way to `target`, snapping to it once they are within 0.005. */
export function followReach(current: number, target: number): number {
  const next = current + (target - current) * FOLLOW;
  return Math.abs(target - next) <= SETTLED / 2 ? target : next;
}

/** Wraps each non-space character of `line` in a `.hero-letter` span and returns the spans. */
export function splitLetters(line: HTMLElement): HTMLElement[] {
  const text = line.textContent;
  const letters: HTMLElement[] = [];
  const fragment = document.createDocumentFragment();
  for (const character of text) {
    if (character.trim() === "") {
      fragment.append(character);
      continue;
    }
    const letter = document.createElement("span");
    letter.className = "hero-letter";
    letter.textContent = character;
    letters.push(letter);
    fragment.append(letter);
  }
  line.replaceChildren(fragment);
  return letters;
}

function readEnv(): LettersEnv {
  return {
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: matchMedia("(pointer: coarse)").matches,
    viewportWidth: innerWidth,
  };
}

interface Letter {
  readonly element: HTMLElement;
  reach: number;
}

/**
 * Starts the letter reaction on every `[data-letters]` line under `host` and
 * returns the function that stops it and gives the text back unsplit.
 */
export function initLetters(host: HTMLElement): () => void {
  const lines = [...host.querySelectorAll<HTMLElement>("[data-letters]")];
  const originals = lines.map((line) => line.textContent);
  let letters: Letter[] = [];
  let pointer: readonly [number, number] | null = null;
  let frame = 0;

  function ensureSplit(): void {
    if (letters.length > 0) return;
    letters = lines.flatMap((line) => splitLetters(line).map((element) => ({ element, reach: 0 })));
  }

  function targets(active: readonly [number, number] | null): number[] {
    return letters.map((letter) => {
      if (!active) return 0;
      const box = letter.element.getBoundingClientRect();
      return letterReach(
        Math.hypot(box.left + box.width / 2 - active[0], box.top + box.height / 2 - active[1]),
      );
    });
  }

  function tick(): void {
    frame = 0;
    const active = lettersEnabled(readEnv()) && !document.hidden ? pointer : null;
    const goals = targets(active);
    let moving = false;
    for (const [index, letter] of letters.entries()) {
      const next = followReach(letter.reach, goals[index] ?? 0);
      if (next === letter.reach) continue;
      letter.reach = next;
      letter.element.style.setProperty("--k", next.toFixed(3));
      moving = true;
    }
    if (moving) frame = requestAnimationFrame(tick);
  }

  function schedule(): void {
    if (frame === 0 && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerType === "touch" || !lettersEnabled(readEnv())) return;
    ensureSplit();
    pointer = [event.clientX, event.clientY];
    schedule();
  }

  function onLeave(): void {
    pointer = null;
    schedule();
  }

  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  document.addEventListener("visibilitychange", schedule);

  return () => {
    host.removeEventListener("pointermove", onMove);
    host.removeEventListener("pointerleave", onLeave);
    document.removeEventListener("visibilitychange", schedule);
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    for (const [index, line] of lines.entries()) {
      if (letters.length > 0) line.textContent = originals[index] ?? "";
    }
    letters = [];
  };
}

/**
 * Pure timing of the typed terminal: how many characters of a command and
 * how many lines of each output block are visible after a given time.
 */

/** Milliseconds per typed character on step 0. */
export const FIRST_STEP_CHAR_MS = 18;
/** Milliseconds per typed character on every later step. */
export const STEP_CHAR_MS = 22;
const OUTPUT_PAUSE_MS = 240;
const BLOCK_GAP_MS = 120;
const LINE_MS = 90;

export interface TypingSchedule {
  commandChars: number;
  charMs: number;
  commandMs: number;
  lineMs: number;
  lineCounts: number[];
  lineStartsMs: number[];
  totalMs: number;
}

export interface TypingProgress {
  chars: number;
  lines: number[];
  done: boolean;
}

/** Splits `revealed` characters over text nodes of the given lengths, in order. */
export function revealCounts(lengths: number[], revealed: number): number[] {
  let left = Math.max(0, revealed);
  return lengths.map((length) => {
    const shown = Math.min(length, left);
    left -= shown;
    return shown;
  });
}

/** Typing speed of the exchange at `index`: 18 ms per character on step 0, 22 ms on the others. */
export function charMsForStep(index: number): number {
  return index === 0 ? FIRST_STEP_CHAR_MS : STEP_CHAR_MS;
}

/** Builds the timeline: the command types first at `charMs` per character, then each output block reveals its lines. */
export function createSchedule(
  commandChars: number,
  lineCounts: number[],
  charMs: number = STEP_CHAR_MS,
): TypingSchedule {
  const commandMs = commandChars * charMs;
  const lineStartsMs: number[] = [];
  let cursor = commandMs + (lineCounts.length > 0 ? OUTPUT_PAUSE_MS : 0);
  for (const count of lineCounts) {
    lineStartsMs.push(cursor);
    cursor += count * LINE_MS + BLOCK_GAP_MS;
  }
  const totalMs = lineCounts.length > 0 ? cursor - BLOCK_GAP_MS : commandMs;
  return { commandChars, charMs, commandMs, lineMs: LINE_MS, lineCounts, lineStartsMs, totalMs };
}

/** What is visible `elapsedMs` after the exchange entered the viewport. */
export function progressAt(schedule: TypingSchedule, elapsedMs: number): TypingProgress {
  const chars = Math.min(schedule.commandChars, Math.floor(elapsedMs / schedule.charMs));
  const lines = schedule.lineCounts.map((count, index) => {
    const start = schedule.lineStartsMs[index] ?? 0;
    if (elapsedMs < start) return 0;
    return Math.min(count, Math.floor((elapsedMs - start) / schedule.lineMs) + 1);
  });
  return { chars, lines, done: elapsedMs >= schedule.totalMs };
}

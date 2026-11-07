/**
 * Pure timing of the typed terminal: how many characters of a command and
 * how many lines of each output block are visible after a given time.
 */

const COMMAND_BUDGET_MS = 1400;
const MIN_CHAR_MS = 14;
const MAX_CHAR_MS = 40;
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

/** Builds the timeline: the command types first, then each output block reveals its lines. */
export function createSchedule(commandChars: number, lineCounts: number[]): TypingSchedule {
  const charMs = Math.min(
    MAX_CHAR_MS,
    Math.max(MIN_CHAR_MS, COMMAND_BUDGET_MS / Math.max(1, commandChars)),
  );
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

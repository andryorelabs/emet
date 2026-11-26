import { describe, expect, test } from "bun:test";

import {
  charMsForStep,
  createSchedule,
  FIRST_STEP_CHAR_MS,
  progressAt,
  revealCounts,
  STEP_CHAR_MS,
} from "./typing-schedule";

describe("revealCounts", () => {
  test("fills text nodes in order", () => {
    expect(revealCounts([3, 4, 2], 5)).toEqual([3, 2, 0]);
  });

  test("clamps to the total and to zero", () => {
    expect(revealCounts([3, 4], 99)).toEqual([3, 4]);
    expect(revealCounts([3, 4], -2)).toEqual([0, 0]);
  });
});

describe("typing schedule", () => {
  const schedule = createSchedule(40, [3, 5]);

  test("types the command first at a bounded rate", () => {
    expect(progressAt(schedule, 0)).toEqual({ chars: 0, lines: [0, 0], done: false });
    const midway = progressAt(schedule, schedule.commandMs / 2);
    expect(midway.chars).toBeGreaterThan(0);
    expect(midway.chars).toBeLessThan(40);
    expect(midway.lines).toEqual([0, 0]);
  });

  test("reveals output blocks line by line after the command", () => {
    const start = schedule.lineStartsMs[0] ?? 0;
    expect(progressAt(schedule, start).lines[0]).toBe(1);
    expect(progressAt(schedule, start + schedule.lineMs * 2).lines[0]).toBe(3);
    expect(progressAt(schedule, start - 1).lines[0]).toBe(0);
  });

  test("finishes with everything visible", () => {
    expect(progressAt(schedule, schedule.totalMs)).toEqual({
      chars: 40,
      lines: [3, 5],
      done: true,
    });
  });

  test("an exchange without a command or output is done at once", () => {
    expect(progressAt(createSchedule(0, []), 0).done).toBe(true);
  });

  test("types step 0 at 18 ms per character and the others at 22 ms", () => {
    expect(FIRST_STEP_CHAR_MS).toBe(18);
    expect(STEP_CHAR_MS).toBe(22);
    expect(charMsForStep(0)).toBe(18);
    expect(charMsForStep(1)).toBe(22);
    expect(charMsForStep(2)).toBe(22);
  });

  test("the rate does not depend on the command length", () => {
    expect(createSchedule(300, []).charMs).toBe(22);
    expect(createSchedule(300, [], 18).commandMs).toBe(300 * 18);
    expect(progressAt(createSchedule(40, [], 18), 18 * 10).chars).toBe(10);
  });
});

import { describe, expect, test } from "bun:test";
import type { PhaseRecord } from "./phase-file.ts";
import {
  initialMachineState,
  nextState,
  type MachineState,
  type SessionEvent,
} from "./state-machine.ts";

function run(events: SessionEvent[], phase: PhaseRecord | null = null): MachineState[] {
  const states: MachineState[] = [];
  let machine = initialMachineState;
  for (const event of events) {
    machine = nextState(machine, event, phase, event.at);
    states.push(machine);
  }
  return states;
}

function only(states: MachineState[]): MachineState {
  const [first] = states;
  if (first === undefined) throw new Error("no states");
  return first;
}

function phaseAt(updatedAtMs: number, phase: PhaseRecord["phase"]): PhaseRecord {
  return {
    phase,
    wave: 1,
    spec: "1",
    runId: "r",
    updatedAt: new Date(updatedAtMs).toISOString(),
  };
}

function tick(machine: MachineState, at: number, phase: PhaseRecord | null = null) {
  return nextState(machine, { kind: "tick", at }, phase, at);
}

describe("nextState", () => {
  test("working, waiting, working across a permission prompt", () => {
    const states = run([
      { kind: "turn-start", at: 0 },
      { kind: "notification", at: 1000 },
      { kind: "prompt", at: 2000 },
    ]).map((machine) => machine.state);
    expect(states).toEqual(["work", "waiting", "work"]);
  });

  test("turn-complete shows done then decays to sleep", () => {
    const done = only(run([{ kind: "turn-complete", at: 0 }]));
    expect(done.state).toBe("done");
    expect(tick(done, 20_000).state).toBe("sleep");
  });

  test("error decays to sleep after 20 seconds", () => {
    const error = only(run([{ kind: "agent-failed", at: 0 }]));
    expect(error.state).toBe("error");
    expect(tick(error, 19_999).state).toBe("error");
    expect(tick(error, 20_000).state).toBe("sleep");
  });

  test("prompt clears error early", () => {
    const [, afterPrompt] = run([
      { kind: "agent-failed", at: 0 },
      { kind: "prompt", at: 1000 },
    ]);
    expect(afterPrompt?.state).toBe("sleep");
  });

  test("waiting outranks error", () => {
    const [, machine] = run([
      { kind: "agent-failed", at: 0 },
      { kind: "question", at: 100 },
    ]);
    expect(machine?.state).toBe("waiting");
  });

  test("question-done clears waiting", () => {
    const [, machine] = run([
      { kind: "question", at: 0 },
      { kind: "question-done", at: 10 },
    ]);
    expect(machine?.state).toBe("sleep");
  });

  test("fresh emet phase shows work, stale phase is ignored", () => {
    const now = 100 * 60_000;
    expect(tick(initialMachineState, now, phaseAt(now - 60_000, "review")).state).toBe("work");
    expect(tick(initialMachineState, now, phaseAt(now - 16 * 60_000, "review")).state).toBe(
      "sleep",
    );
  });

  test("failed phase maps to error briefly and error outranks phase work", () => {
    const now = 100 * 60_000;
    expect(tick(initialMachineState, now, phaseAt(now - 1000, "failed")).state).toBe("error");
    const [machine] = run([{ kind: "agent-failed", at: now }], phaseAt(now, "working"));
    expect(machine?.state).toBe("error");
  });
});

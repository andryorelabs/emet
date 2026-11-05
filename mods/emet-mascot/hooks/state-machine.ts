import type { PhaseRecord } from "./phase-file.ts";

export type MascotState = "sleep" | "work" | "waiting" | "done" | "error";

export type SessionEvent = {
  kind:
    | "turn-start"
    | "turn-complete"
    | "notification"
    | "question"
    | "question-done"
    | "prompt"
    | "agent-failed"
    | "tick";
  at: number;
};

export type MachineState = {
  state: MascotState;
  working: boolean;
  waiting: boolean;
  transient: "done" | "error" | null;
  transientSince: number;
};

export const TRANSIENT_DECAY_MS = 20_000;
export const PHASE_FRESH_MS = 15 * 60_000;

export const initialMachineState: MachineState = {
  state: "sleep",
  working: false,
  waiting: false,
  transient: null,
  transientSince: 0,
};

function phaseState(phase: PhaseRecord | null, nowMs: number): MascotState | null {
  if (phase === null) return null;
  const updated = Date.parse(phase.updatedAt);
  if (Number.isNaN(updated) || nowMs - updated > PHASE_FRESH_MS) return null;
  if (phase.phase === "done") {
    return nowMs - updated < TRANSIENT_DECAY_MS ? "done" : null;
  }
  if (phase.phase === "failed") {
    return nowMs - updated < TRANSIENT_DECAY_MS ? "error" : null;
  }
  return "work";
}

function applyEvent(machine: MachineState, event: SessionEvent): MachineState {
  const { kind, at } = event;
  if (kind === "turn-start") {
    return { ...machine, working: true, waiting: false, transient: null };
  }
  if (kind === "turn-complete") {
    return { ...machine, working: false, waiting: false, transient: "done", transientSince: at };
  }
  if (kind === "notification" || kind === "question") {
    return { ...machine, waiting: true };
  }
  if (kind === "question-done") return { ...machine, waiting: false };
  if (kind === "prompt") return { ...machine, waiting: false, transient: null };
  if (kind === "agent-failed") {
    return { ...machine, transient: "error", transientSince: at };
  }
  return machine;
}

function derive(machine: MachineState, phase: PhaseRecord | null, nowMs: number): MachineState {
  const transient =
    machine.transient !== null && nowMs - machine.transientSince >= TRANSIENT_DECAY_MS
      ? null
      : machine.transient;
  const settled = { ...machine, transient };
  let state: MascotState;
  if (settled.waiting) {
    state = "waiting";
  } else if (transient === "error") {
    state = "error";
  } else {
    const fromPhase = phaseState(phase, nowMs);
    if (fromPhase !== null) state = fromPhase;
    else if (settled.working) state = "work";
    else if (transient === "done") state = "done";
    else state = "sleep";
  }
  return { ...settled, state };
}

/**
 * Pure transition: applies a session event, then derives the displayed state
 * with priority waiting > error > fresh emet phase > working > done > sleep.
 */
export function nextState(
  machine: MachineState,
  event: SessionEvent,
  phase: PhaseRecord | null,
  nowMs: number,
): MachineState {
  return derive(applyEvent(machine, event), phase, nowMs);
}

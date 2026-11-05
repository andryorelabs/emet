import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { FRAMES } from "./frames.generated.ts";
import { parsePhaseFile } from "./phase-file.ts";
import type { PhaseRecord } from "./phase-file.ts";
import {
  PHASE_FRESH_MS,
  TRANSIENT_DECAY_MS,
  initialMachineState,
  nextState,
} from "./state-machine.ts";
import type { MachineState, SessionEvent } from "./state-machine.ts";

const TICK_MS = 100;
const PHASE_POLL_MS = 2000;
const PANE_ID = "emet-mascot";
const PHASE_PATH = ".emet/phase.json";
const MASCOT_KEY = "mascot";
const LABEL_RESERVE_COLUMNS = 24;
const UNASKED_PANE_MIN_COLUMNS = 144;

const machineAtom = atom({ plugin: "emet-mascot", key: "machine" } as const, initialMachineState);
const phaseAtom = atom(
  { plugin: "emet-mascot", key: "phase" } as const,
  null as PhaseRecord | null,
);

const reportedAtom = atom({ plugin: "emet-mascot", key: "reported" } as const, [] as string[]);

type Engine = Pick<EngineInterface, "clock" | "state" | "fs" | "agent" | "session" | "ui">;

/** Index of the frame showing `elapsedMs` into a looping animation. */
function frameIndexAt(frames: readonly { ms: number }[], elapsedMs: number): number {
  const total = frames.reduce((sum, frame) => sum + frame.ms, 0);
  if (total <= 0 || frames.length <= 1) return 0;
  let remaining = elapsedMs % total;
  for (const [index, frame] of frames.entries()) {
    if (remaining < frame.ms) return index;
    remaining -= frame.ms;
  }
  return 0;
}

/** Whether the state machine draws its state from this phase record at `nowMs`. */
function isPhaseInUse(machine: MachineState, phase: PhaseRecord | null, nowMs: number): boolean {
  if (phase === null || machine.state === "sleep" || machine.state === "waiting") return false;
  if (machine.state === "error" && machine.transient === "error") return false;
  const age = nowMs - Date.parse(phase.updatedAt);
  if (Number.isNaN(age) || age > PHASE_FRESH_MS) return false;
  if (phase.phase === "done" || phase.phase === "failed") return age < TRANSIENT_DECAY_MS;
  return true;
}

function labelFor(machine: MachineState, phase: PhaseRecord | null, nowMs: number): string {
  if (phase !== null && isPhaseInUse(machine, phase, nowMs)) {
    const wave = phase.wave === null ? "" : ` · wave ${String(phase.wave)}`;
    return `emet${wave} · ${phase.phase}`;
  }
  return `emet · ${machine.state}`;
}

function isSameMachine(left: MachineState, right: MachineState): boolean {
  return (
    left.state === right.state &&
    left.working === right.working &&
    left.waiting === right.waiting &&
    left.transient === right.transient &&
    left.transientSince === right.transientSince
  );
}

async function dispatch($: Engine, kind: SessionEvent["kind"]): Promise<void> {
  const at = await $.clock.now();
  const phase = await read($, phaseAtom);
  const current = await read($, machineAtom);
  const next = nextState(current, { kind, at }, phase, at);
  if (!isSameMachine(current, next)) await update($, machineAtom, () => next);
}

async function readPhaseFile($: Engine): Promise<PhaseRecord | null> {
  const path = `${await $.session.cwd()}/${PHASE_PATH}`;
  if (!(await $.fs.exists(path))) return null;
  try {
    return parsePhaseFile(await $.fs.read(path));
  } catch {
    return null;
  }
}

async function reportNewFailures($: Engine): Promise<void> {
  const agents = await $.agent.list();
  const failed = agents.filter((agent) => agent.status === "failed").map((agent) => agent.id);
  const reported = await read($, reportedAtom);
  if (!failed.some((id) => !reported.includes(id))) return;
  await update($, reportedAtom, () => failed);
  await dispatch($, "agent-failed");
}

type Position = "pane" | "band" | "status";

const paint = {
  requestId: null as string | null,
  startedAt: 0,
  lastPoll: 0,
  last: "",
  isDocked: false,
  wasDocked: false,
  isPaneOpened: false,
  bandColumns: 0,
  blockedColumns: null as number | null,
  lastStatus: undefined as string | undefined,
};
let timer: { cancel: () => void } | null = null;

function positionFrom(value: unknown): Position {
  return value === "band" || value === "status" ? value : "pane";
}

async function syncStatus($: Engine, position: Position, now: number): Promise<void> {
  const text =
    position === "status"
      ? labelFor(await read($, machineAtom), await read($, phaseAtom), now)
      : undefined;
  if (text === paint.lastStatus) return;
  paint.lastStatus = text;
  $.ui.status(text);
}

async function isPaneDocked($: Engine): Promise<boolean> {
  if (!paint.isDocked) return false;
  const panes = await $.ui.panes();
  return panes.some((pane) => pane.id === PANE_ID && pane.isPlaced);
}

async function redrawWhenDockFlips($: Engine, position: Position): Promise<void> {
  if (position !== "pane") return;
  const isDocked = await isPaneDocked($);
  if (isDocked === paint.wasDocked) return;
  paint.wasDocked = isDocked;
  $.ui.invalidate("ui.render");
}

async function tick($: Engine, size: "small" | "medium", position: Position): Promise<void> {
  const now = await $.clock.now();
  if (now - paint.lastPoll >= PHASE_POLL_MS) {
    paint.lastPoll = now;
    const phase = await readPhaseFile($);
    await update($, phaseAtom, () => phase);
    await reportNewFailures($);
  }
  await dispatch($, "tick");
  await syncStatus($, position, now);
  await redrawWhenDockFlips($, position);
  if (position === "status" || paint.requestId === null) return;
  const machine = await read($, machineAtom);
  const sheet = FRAMES[machine.state][size];
  const index = frameIndexAt(sheet.frames, now - paint.startedAt);
  const key = `${machine.state}:${String(index)}`;
  const frame = sheet.frames[index];
  if (frame === undefined || key === paint.last) return;
  paint.last = key;
  await $.ui.blit({ requestId: paint.requestId, key: MASCOT_KEY, cells: frame.cells });
}

export const register: Register = (on, options) => {
  const size = options["size"] === "medium" ? "medium" : "small";
  const position = positionFrom(options["position"]);
  const showLabel = options["showLabel"] !== false;
  on("session.start", async ($, e, next) => {
    paint.startedAt = await $.clock.now();
    timer?.cancel();
    timer = $.clock.every(TICK_MS, () => {
      tick($, size, position).catch((error: unknown) => {
        $.ui.log(`emet-mascot tick failed: ${String(error)}`, { to: "debug" });
      });
    });
    paint.isDocked = false;
    paint.wasDocked = false;
    paint.isPaneOpened = false;
    paint.blockedColumns = null;
    return next(e);
  });

  on("session.end", (_$, e, next) => {
    timer?.cancel();
    timer = null;
    return next(e);
  });

  on("turn.start", async ($, e, next) => {
    await dispatch($, "turn-start");
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    await dispatch($, "turn-complete");
    await reportNewFailures($);
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    await dispatch($, "prompt");
    return next(e);
  });

  on("classic.Notification", async ($, e, next) => {
    await dispatch($, "notification");
    return next(e);
  });

  on("tool.call", { tool: "AskUserQuestion" }, async ($, e, next) => {
    await dispatch($, "question");
    const result = await next(e);
    await dispatch($, "question-done");
    return result;
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, async ($, e, next) => {
    if (e.surface !== "terminal" || position !== "pane") return next(e);
    paint.isDocked = e.props.placement === "dock";
    if (!paint.isDocked) {
      if (paint.isPaneOpened) {
        paint.isPaneOpened = false;
        paint.blockedColumns = paint.bandColumns;
        void $.ui.close({ id: PANE_ID });
      }
      return next(e);
    }
    const machine = await read($, machineAtom);
    const phase = await read($, phaseAtom);
    const sheet = FRAMES[machine.state][size];
    const nowMs = await $.clock.now();
    const index = frameIndexAt(sheet.frames, nowMs - paint.startedAt);
    const frame = sheet.frames[index];
    if (frame === undefined) return next(e);
    paint.requestId = e.requestId;
    paint.last = `${machine.state}:${String(index)}`;
    const { Box, Raster, Text } = $.ui.resolve(e);
    return (
      <Box flexDirection="column">
        <Raster key={MASCOT_KEY} columns={sheet.columns} rows={sheet.rows} cells={frame.cells} />
        {showLabel ? <Text dimColor>{labelFor(machine, phase, nowMs)}</Text> : null}
      </Box>
    );
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.hasSurvey || position === "status") return next(e);
    paint.bandColumns = e.props.bodyColumns;
    if (paint.blockedColumns !== null && paint.blockedColumns !== e.props.bodyColumns) {
      paint.blockedColumns = null;
    }
    if (
      position === "pane" &&
      e.viewport?.isFullscreen === true &&
      !paint.isPaneOpened &&
      paint.blockedColumns === null &&
      e.props.bodyColumns >= UNASKED_PANE_MIN_COLUMNS
    ) {
      paint.isPaneOpened = true;
      void $.ui.open({ id: PANE_ID, title: "emet" });
    }
    if (position === "pane" && (await isPaneDocked($))) return next(e);
    const machine = await read($, machineAtom);
    const phase = await read($, phaseAtom);
    const sheet = FRAMES[machine.state][size];
    if (e.props.bodyColumns < sheet.columns) return next(e);
    const nowMs = await $.clock.now();
    const index = frameIndexAt(sheet.frames, nowMs - paint.startedAt);
    const frame = sheet.frames[index];
    if (frame === undefined) return next(e);
    paint.requestId = e.requestId;
    paint.last = `${machine.state}:${String(index)}`;
    const { Box, Raster, Text } = $.ui.resolve(e);
    const hasRoomForLabel = e.props.bodyColumns >= sheet.columns + LABEL_RESERVE_COLUMNS;
    return (
      <Box flexDirection="row">
        <Raster key={MASCOT_KEY} columns={sheet.columns} rows={sheet.rows} cells={frame.cells} />
        {showLabel && hasRoomForLabel ? (
          <Text dimColor> {labelFor(machine, phase, nowMs)}</Text>
        ) : null}
      </Box>
    );
  });
};

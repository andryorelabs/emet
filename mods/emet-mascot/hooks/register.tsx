import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { FRAMES } from "./frames.generated.ts";
import { parsePhaseFile } from "./phase-file.ts";
import type { PhaseRecord } from "./phase-file.ts";
import { initialMachineState, nextState } from "./state-machine.ts";
import type { SessionEvent } from "./state-machine.ts";

const TICK_MS = 100;
const PHASE_POLL_MS = 2000;
const PHASE_PATH = ".emet/phase.json";
const MASCOT_KEY = "mascot";
const LABEL_RESERVE_COLUMNS = 24;

const machineAtom = atom({ plugin: "emet-mascot", key: "machine" } as const, initialMachineState);
const phaseAtom = atom(
  { plugin: "emet-mascot", key: "phase" } as const,
  null as PhaseRecord | null,
);

type Engine = Pick<EngineInterface, "clock" | "state" | "fs" | "agent" | "session">;

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

function labelFor(state: string, phase: PhaseRecord | null): string {
  if (phase !== null && state !== "sleep") {
    const wave = phase.wave === null ? "" : ` · wave ${String(phase.wave)}`;
    return `emet${wave} · ${phase.phase}`;
  }
  return `emet · ${state}`;
}

async function dispatch($: Engine, kind: SessionEvent["kind"]): Promise<void> {
  const at = await $.clock.now();
  const phase = await read($, phaseAtom);
  await update($, machineAtom, (machine) => nextState(machine, { kind, at }, phase, at));
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

async function hasFailedAgent($: Engine): Promise<boolean> {
  const agents = await $.agent.list();
  return agents.some((agent) => agent.status === "failed");
}

const paint = { requestId: null as string | null, startedAt: 0, lastPoll: 0, last: "" };
let timer: { cancel: () => void } | null = null;

async function tick($: Engine, size: "small" | "medium"): Promise<void> {
  const now = await $.clock.now();
  if (now - paint.lastPoll >= PHASE_POLL_MS) {
    paint.lastPoll = now;
    const phase = await readPhaseFile($);
    await update($, phaseAtom, () => phase);
    if (await hasFailedAgent($)) await dispatch($, "agent-failed");
  }
  await dispatch($, "tick");
  if (paint.requestId === null) return;
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
  const size = options["size"] === "small" ? "small" : "medium";
  const showLabel = options["showLabel"] !== false;
  on("session.start", async ($, e, next) => {
    paint.startedAt = await $.clock.now();
    timer?.cancel();
    timer = $.clock.every(TICK_MS, () => void tick($, size));
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
    if (await hasFailedAgent($)) await dispatch($, "agent-failed");
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
    const result = await next(e);
    await dispatch($, "question-done");
    return result;
  });

  on("ui.render", { component: "AskUserQuestion" }, async ($, e, next) => {
    const machine = await read($, machineAtom);
    if (!machine.waiting) await dispatch($, "question");
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.hasSurvey) return next(e);
    const machine = await read($, machineAtom);
    const phase = await read($, phaseAtom);
    const sheet = FRAMES[machine.state][size];
    if (e.props.bodyColumns < sheet.columns) return next(e);
    const index = frameIndexAt(sheet.frames, (await $.clock.now()) - paint.startedAt);
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
          <Text dimColor> {labelFor(machine.state, phase)}</Text>
        ) : null}
      </Box>
    );
  });
};

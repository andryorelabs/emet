/**
 * Codex usage and liveness: reads the JSONL a detached `codex exec --json`
 * run captures (`thread.started`, `item.started`, `item.completed`,
 * `turn.completed` events) into the shared transcript metrics, the last-step
 * summary the stall check uses, and the Codex price table.
 */

import { isObject } from "./narrow";
import type { TokenTotals, TranscriptMetrics } from "./metrics";
import type { LastTranscriptStep } from "./usage";

type CodexRates = { readonly input: number; readonly output: number; readonly cachedInput: number };

/**
 * USD per million tokens by model-name marker, matched in order. Every price
 * here is `unverified`: the viability report names the models but states no
 * prices, so these are placeholders to re-measure against the first real run.
 */
const CODEX_RATES_BY_MODEL_MARKER: readonly (readonly [string, CodexRates])[] = [
  ["astra", { input: 5, output: 30, cachedInput: 0.5 }],
  ["sol", { input: 2, output: 12, cachedInput: 0.2 }],
  ["terra", { input: 1, output: 6, cachedInput: 0.1 }],
  ["luna", { input: 0.25, output: 2, cachedInput: 0.025 }],
];

/** Rates for a model that matches no marker; `unverified`, set to the `sol` tier. */
const FALLBACK_CODEX_RATES: CodexRates = { input: 2, output: 12, cachedInput: 0.2 };

function codexRatesForModel(model: string): CodexRates {
  const lowered = model.toLowerCase();
  return (
    CODEX_RATES_BY_MODEL_MARKER.find(([marker]) => lowered.includes(marker))?.[1] ??
    FALLBACK_CODEX_RATES
  );
}

/**
 * API-equivalent dollars for Codex token counts. `inputTokens` is the
 * uncached share and `cacheReadTokens` the cached share, so the two are
 * priced separately; Codex reports no cache-creation charge.
 */
export function codexCostUsd(model: string, tokens: TokenTotals): number {
  const rates = codexRatesForModel(model);
  return (
    (tokens.inputTokens * rates.input +
      tokens.cacheReadTokens * rates.cachedInput +
      tokens.outputTokens * rates.output) /
    1e6
  );
}

function numberOr0(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseLines(text: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isObject(parsed)) events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}

function eventStampMs(event: Record<string, unknown>): number {
  return typeof event.timestamp === "string" ? Date.parse(event.timestamp) : Number.NaN;
}

function eventModel(event: Record<string, unknown>): string {
  if (typeof event.model === "string") return event.model;
  const item = event.item;
  return isObject(item) && typeof item.model === "string" ? item.model : "";
}

/**
 * Sums every `turn.completed` event's `usage` (input, cached input, output)
 * and spans the `timestamp` fields (`unverified`: absent stamps give a zero
 * wall time). `inputTokens` is `input_tokens - cached_input_tokens`.
 */
export function parseCodexJsonl(text: string): TranscriptMetrics {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let turns = 0;
  let peakContext = 0;
  let firstMs = Number.POSITIVE_INFINITY;
  let lastMs = Number.NEGATIVE_INFINITY;
  const models = new Set<string>();
  const turnUsages: { model: string; tokens: TokenTotals }[] = [];
  let currentModel = "";

  for (const event of parseLines(text)) {
    const stamp = eventStampMs(event);
    if (Number.isFinite(stamp)) {
      firstMs = Math.min(firstMs, stamp);
      lastMs = Math.max(lastMs, stamp);
    }
    const named = eventModel(event);
    if (named) {
      currentModel = named;
      models.add(named);
    }
    if (event.type !== "turn.completed" || !isObject(event.usage)) continue;
    const usage = event.usage;
    const totalInput = numberOr0(usage.input_tokens);
    const cached = Math.min(numberOr0(usage.cached_input_tokens), totalInput);
    const tokens: TokenTotals = {
      inputTokens: totalInput - cached,
      outputTokens: numberOr0(usage.output_tokens),
      cacheReadTokens: cached,
      cacheCreationTokens: 0,
    };
    turns += 1;
    inputTokens += tokens.inputTokens;
    outputTokens += tokens.outputTokens;
    cacheReadTokens += tokens.cacheReadTokens;
    peakContext = Math.max(peakContext, totalInput);
    turnUsages.push({ model: currentModel, tokens });
  }

  const costUsd = turnUsages.reduce((sum, turn) => sum + codexCostUsd(turn.model, turn.tokens), 0);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens: 0,
    turns,
    peakContext,
    costUsd,
    wallMs: Number.isFinite(firstMs) ? lastMs - firstMs : 0,
    models: [...models].toSorted(),
  };
}

const UNKNOWN_STEP: LastTranscriptStep = { step: "unknown", pendingTool: null };

function itemOf(event: Record<string, unknown>): Record<string, unknown> | null {
  return isObject(event.item) ? event.item : null;
}

function toolLabel(item: Record<string, unknown>): string {
  const kind = typeof item.type === "string" ? item.type : "unknown";
  return kind === "command_execution" ? "shell" : kind;
}

const ANONYMOUS_PREFIX = "anonymous-";

/**
 * Describes the last `item.*` or `turn.*` event of a captured run. An
 * `item.started` whose item has no later `item.completed` (and no later
 * `turn.completed`) is a pending tool call: a long test run is not a hang.
 */
export function describeCodexLastStep(text: string): LastTranscriptStep {
  const open = new Map<string, string>();
  let anonymousCount = 0;
  let last: LastTranscriptStep = UNKNOWN_STEP;
  for (const event of parseLines(text)) {
    const item = itemOf(event);
    if (event.type === "item.started" && item !== null && item.type !== "agent_message") {
      const id = typeof item.id === "string" ? item.id : `${ANONYMOUS_PREFIX}${anonymousCount++}`;
      open.set(id, toolLabel(item));
      last = { step: `tool_use ${toolLabel(item)}`, pendingTool: toolLabel(item) };
    } else if (event.type === "item.completed" && item !== null) {
      const closedKey =
        typeof item.id === "string"
          ? item.id
          : [...open.keys()].find((key) => key.startsWith(ANONYMOUS_PREFIX));
      if (closedKey !== undefined) open.delete(closedKey);
      last = {
        step: item.type === "agent_message" ? "agent message" : "tool_result",
        pendingTool: null,
      };
    } else if (event.type === "turn.completed") {
      open.clear();
      last = { step: "turn completed", pendingTool: null };
    }
  }
  if (open.size > 0) {
    const pendingTool = [...open.values()].join(", ");
    return { step: `tool_use ${pendingTool}`, pendingTool };
  }
  return last;
}

export type CodexLiveness = "alive" | "stalled" | "exited";

/**
 * Classifies a Codex run: `exited` when no `codex` anchor process is alive,
 * `stalled` when its JSONL has been silent past `idleMinutes` (or
 * `pendingToolMinutes` while a tool call is pending), else `alive`.
 */
export function classifyCodexLiveness(input: {
  readonly anchorAlive: boolean;
  readonly mtimeMs: number;
  readonly nowMs: number;
  readonly idleMinutes: number;
  readonly pendingToolMinutes: number;
  readonly lastStep: LastTranscriptStep;
}): CodexLiveness {
  if (!input.anchorAlive) return "exited";
  const limit = input.lastStep.pendingTool
    ? Math.max(input.pendingToolMinutes, input.idleMinutes)
    : input.idleMinutes;
  return input.nowMs - input.mtimeMs > limit * 60_000 ? "stalled" : "alive";
}

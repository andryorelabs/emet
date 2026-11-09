import { describe, expect, test } from "bun:test";

import { parseTranscriptMetrics } from "./metrics";
import {
  classifyCodexLiveness,
  codexCostUsd,
  describeCodexLastStep,
  parseCodexJsonl,
} from "./codex-usage";
import { findStalledTranscripts, transcriptParsers } from "./usage";

const lines = (...events: object[]): string =>
  events.map((event) => JSON.stringify(event)).join("\n");

const TWO_TURNS = lines(
  { type: "thread.started", thread_id: "t1", timestamp: "2026-11-09T10:00:00Z" },
  {
    type: "turn.completed",
    usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 50 },
    timestamp: "2026-11-09T10:00:10Z",
  },
  {
    type: "turn.completed",
    usage: { input_tokens: 2000, cached_input_tokens: 1500, output_tokens: 70 },
    timestamp: "2026-11-09T10:01:00Z",
  },
);

describe("parseCodexJsonl", () => {
  test("sums input, cached input and output across turn.completed events", () => {
    const metrics = parseCodexJsonl(TWO_TURNS);
    expect(metrics.turns).toBe(2);
    expect(metrics.cacheReadTokens).toBe(2100);
    expect(metrics.inputTokens).toBe(900);
    expect(metrics.outputTokens).toBe(120);
    expect(metrics.peakContext).toBe(2000);
    expect(metrics.wallMs).toBe(60_000);
  });

  test("skips malformed lines and events without usage", () => {
    const metrics = parseCodexJsonl(`not json\n${lines({ type: "turn.completed" })}\n`);
    expect(metrics.turns).toBe(0);
    expect(metrics.wallMs).toBe(0);
  });

  test("prices turns by the model named in the stream", () => {
    const text = lines(
      { type: "thread.started", model: "gpt-6-luna" },
      { type: "turn.completed", usage: { input_tokens: 1_000_000, output_tokens: 0 } },
    );
    const metrics = parseCodexJsonl(text);
    expect(metrics.models).toEqual(["gpt-6-luna"]);
    expect(metrics.costUsd).toBeCloseTo(0.25);
  });

  test("is registered for the codex-jsonl format", () => {
    expect(parseTranscriptMetrics(TWO_TURNS, "codex-jsonl").turns).toBe(2);
    const pending = lines({ type: "item.started", item: { id: "i1", type: "command_execution" } });
    expect(transcriptParsers["codex-jsonl"].describeLastStep(pending).pendingTool).toBe("shell");
  });
});

describe("codexCostUsd", () => {
  const tokens = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheCreationTokens: 0,
  };

  test("orders tiers and falls back for an unknown model", () => {
    expect(codexCostUsd("gpt-6.1-sol", tokens)).toBeCloseTo(14.2);
    expect(codexCostUsd("gpt-6-luna", tokens)).toBeLessThan(codexCostUsd("gpt-6.1-terra", tokens));
    expect(codexCostUsd("mystery", tokens)).toBe(codexCostUsd("gpt-6.1-sol", tokens));
  });
});

describe("describeCodexLastStep", () => {
  test("an unanswered item.started is a pending tool call", () => {
    const text = lines({ type: "item.started", item: { id: "i1", type: "command_execution" } });
    expect(describeCodexLastStep(text)).toEqual({ step: "tool_use shell", pendingTool: "shell" });
  });

  test("a completed item and a finished turn are not pending", () => {
    const started = { type: "item.started", item: { id: "i1", type: "command_execution" } };
    const done = { type: "item.completed", item: { id: "i1", type: "command_execution" } };
    expect(describeCodexLastStep(lines(started, done)).pendingTool).toBeNull();
    expect(describeCodexLastStep(lines(started, { type: "turn.completed" })).step).toBe(
      "turn completed",
    );
  });

  test("an empty transcript is unknown", () => {
    expect(describeCodexLastStep("")).toEqual({ step: "unknown", pendingTool: null });
  });
});

describe("liveness", () => {
  const nowMs = 10_000_000;
  const thresholds = { idleMinutes: 10, pendingToolMinutes: 30 };

  test("findStalledTranscripts reports an old JSONL ending in a pending tool call", async () => {
    const path = "/runs/spec1/codex/CLA-1.jsonl";
    const text = lines({ type: "item.started", item: { id: "i1", type: "command_execution" } });
    const stalled = await findStalledTranscripts(
      [path],
      nowMs,
      thresholds,
      () => Promise.resolve(nowMs - 31 * 60_000),
      () => Promise.resolve(describeCodexLastStep(text)),
    );
    expect(stalled).toHaveLength(1);
  });

  test("classifyCodexLiveness separates exited, stalled and alive", () => {
    const idle = { step: "agent message", pendingTool: null };
    const pending = { step: "tool_use shell", pendingTool: "shell" };
    const base = { nowMs, ...thresholds, mtimeMs: nowMs - 15 * 60_000 };
    expect(classifyCodexLiveness({ ...base, anchorAlive: false, lastStep: idle })).toBe("exited");
    expect(classifyCodexLiveness({ ...base, anchorAlive: true, lastStep: idle })).toBe("stalled");
    expect(classifyCodexLiveness({ ...base, anchorAlive: true, lastStep: pending })).toBe("alive");
    expect(
      classifyCodexLiveness({
        ...base,
        mtimeMs: nowMs - 31 * 60_000,
        anchorAlive: true,
        lastStep: pending,
      }),
    ).toBe("stalled");
  });
});

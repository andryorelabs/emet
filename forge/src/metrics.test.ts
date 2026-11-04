import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  aggregateRun,
  costUsd,
  formatMetricsSummary,
  parseTranscriptMetrics,
  run,
  type TicketMetrics,
} from "./metrics";

function turn(timestamp: string, model: string, usage: Record<string, number>): string {
  return JSON.stringify({ type: "assistant", timestamp, message: { model, usage } });
}

describe("parseTranscriptMetrics", () => {
  const text = [
    turn("2026-01-01T00:00:00Z", "claude-sonnet-5", {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 200,
    }),
    "not json",
    JSON.stringify({ type: "user", timestamp: "2026-01-01T00:01:00Z", message: { content: [] } }),
    turn("2026-01-01T00:02:00Z", "claude-sonnet-5", {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 2000,
    }),
  ].join("\n");

  test("sums tokens, finds peak context and wall time", () => {
    const metrics = parseTranscriptMetrics(text);
    expect(metrics.turns).toBe(2);
    expect(metrics.inputTokens).toBe(110);
    expect(metrics.outputTokens).toBe(55);
    expect(metrics.cacheReadTokens).toBe(3000);
    expect(metrics.cacheCreationTokens).toBe(200);
    expect(metrics.peakContext).toBe(2010);
    expect(metrics.wallMs).toBe(120_000);
    expect(metrics.models).toEqual(["claude-sonnet-5"]);
  });

  test("prices per model family with cache multipliers", () => {
    const tokens = {
      inputTokens: 1e6,
      outputTokens: 1e6,
      cacheReadTokens: 1e6,
      cacheCreationTokens: 1e6,
    };
    expect(costUsd("claude-opus-4", tokens)).toBeCloseTo(5 + 25 + 0.5 + 6.25);
    expect(costUsd("claude-haiku-4", tokens)).toBeCloseTo(1 + 5 + 0.1 + 1.25);
    expect(costUsd("mystery", tokens)).toBeCloseTo(3 + 15 + 0.3 + 3.75);
    expect(parseTranscriptMetrics(text).costUsd).toBeGreaterThan(0);
  });

  test("an empty transcript yields zeros", () => {
    const metrics = parseTranscriptMetrics("");
    expect(metrics.turns).toBe(0);
    expect(metrics.wallMs).toBe(0);
  });
});

function ticket(
  id: string,
  wave: number,
  wallMs: number,
  peak: number,
  estimate: number | null,
): TicketMetrics {
  return {
    ticket: id,
    wave,
    estimatedPeakTokens: estimate,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 100,
    cacheCreationTokens: 0,
    turns: 3,
    peakContext: peak,
    costUsd: 1.5,
    wallMs,
    models: [],
  };
}

describe("aggregateRun", () => {
  const tickets = [
    ticket("A", 1, 60_000, 30_000, 40_000),
    ticket("B", 1, 90_000, 50_000, 40_000),
    ticket("C", 2, 30_000, 20_000, null),
  ];

  test("sums tokens and cost; wave wall is the slowest ticket, run wall the sum of waves", () => {
    const metrics = aggregateRun("r1", tickets);
    expect(metrics.run.costUsd).toBeCloseTo(4.5);
    expect(metrics.run.cacheReadTokens).toBe(300);
    expect(metrics.waves.get(1)!.wallMs).toBe(90_000);
    expect(metrics.waves.get(1)!.costUsd).toBeCloseTo(3);
    expect(metrics.run.wallMs).toBe(120_000);
  });

  test("summary flags over-budget tickets and missing estimates", () => {
    const summary = formatMetricsSummary(aggregateRun("r1", tickets));
    expect(summary).toContain("## Metrics — run r1");
    expect(summary).toContain("Wave 2:");
    expect(summary).toMatch(/\| B \| 1 .*\(OVER\)/);
    expect(summary).toMatch(/\| A \| 1 .*\(within\)/);
    expect(summary).toMatch(/\| C \| 2 .*\(no estimate\)/);
  });
});

describe("claude 5 pricing", () => {
  const million = {
    inputTokens: 1e6,
    outputTokens: 1e6,
    cacheReadTokens: 1e6,
    cacheCreationTokens: 1e6,
  };

  test("uses the Claude 5 rates and falls back to the family rates", () => {
    expect(costUsd("claude-opus-5-5", million)).toBeCloseTo(4 + 20 + 0.2 + 5);
    expect(costUsd("claude-sonnet-5-5", million)).toBeCloseTo(2 + 10 + 0.2 + 2.5);
    expect(costUsd("claude-haiku-5-5", million)).toBeCloseTo(0.1 + 0.5 + 0.01 + 0.125);
    expect(costUsd("claude-opus-5", million)).toBeCloseTo(5 + 25 + 0.5 + 6.25);
  });
});

describe("run", () => {
  test("reads events from the git common dir and the subagent transcript from the event", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "forge-metrics-"));
    try {
      expect(Bun.spawnSync(["git", "init", "-q", root]).exitCode).toBe(0);
      const runDirectory = path.join(root, ".git", ".forge", "runs", "r1");
      mkdirSync(path.join(runDirectory, "events"), { recursive: true });
      writeFileSync(
        path.join(runDirectory, "tickets.json"),
        JSON.stringify([{ id: "CLA-1", wave: 1, estimatedPeakTokens: 1_000 }]),
      );
      const transcript = path.join(root, "agent-a1.jsonl");
      writeFileSync(
        transcript,
        [
          turn("2026-01-01T00:00:00Z", "claude-opus-5-5", {
            input_tokens: 1_000_000,
            output_tokens: 0,
          }),
          turn("2026-01-01T00:01:00Z", "claude-opus-5-5", {
            input_tokens: 0,
            output_tokens: 1_000_000,
          }),
        ].join("\n"),
      );
      writeFileSync(
        path.join(runDirectory, "events", "CLA-1.json"),
        JSON.stringify({
          runId: "r1",
          ticket: "CLA-1",
          event: "SubagentStop",
          outcome: "allowed",
          at: "2026-01-01T00:02:00Z",
          sessionId: "coordinator",
          branch: null,
          commits: 1,
          agentTranscriptPath: transcript,
        }),
      );
      const lines: string[] = [];
      const originalLog = console.log;
      console.log = (line: string) => void lines.push(line);
      try {
        await run(["--run", "r1", "--root", root, "--json"]);
      } finally {
        console.log = originalLog;
      }
      const parsed: unknown = JSON.parse(lines.join("\n"));
      expect(parsed).toMatchObject({ missing: [] });
      expect(parsed).toHaveProperty("run.costUsd", expect.closeTo(24));
      expect(parsed).toHaveProperty("tickets.0.ticket", "CLA-1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

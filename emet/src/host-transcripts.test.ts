import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentHost } from "./agenthost";
import { claudeHost } from "./agenthost-claude";
import { costUsd, metricsParsers, parseTranscriptMetrics } from "./metrics";
import { findStalledTranscripts, readLastStepFor, transcriptParsers } from "./usage";

const CLAUDE_LINE = JSON.stringify({
  timestamp: "2026-01-01T00:00:00Z",
  message: { model: "claude-sonnet-4", usage: { input_tokens: 10, output_tokens: 5 } },
});

const TOKENS = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheCreationTokens: 0 };

function stubHost(root: string): AgentHost {
  return {
    ...claudeHost,
    workerTranscriptRoot: () => root,
    workerTranscriptGlob: "*.log",
  };
}

describe("transcript parser table", () => {
  test("claude-jsonl entry matches the exported functions", () => {
    const entry = transcriptParsers["claude-jsonl"];
    expect(entry.parse(CLAUDE_LINE)).toEqual(parseTranscriptMetrics(CLAUDE_LINE));
    expect(entry.costUsd("claude-sonnet-4", TOKENS)).toBe(costUsd("claude-sonnet-4", TOKENS));
    expect(metricsParsers["claude-jsonl"].parse(CLAUDE_LINE)).toEqual(entry.parse(CLAUDE_LINE));
    expect(entry.describeLastStep("")).toEqual({ step: "unknown", pendingTool: null });
  });

  test("codex-jsonl is registered", () => {
    expect(parseTranscriptMetrics("", "codex-jsonl")).toBeDefined();
  });
});

describe("host stub with another layout", () => {
  test("stall detection reads the stub's transcript through its format", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "emet-host-"));
    try {
      const file = path.join(root, "worker.log");
      writeFileSync(
        file,
        `${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash" }] } })}\n`,
      );
      const old = new Date(Date.now() - 60 * 60_000);
      utimesSync(file, old, old);
      const host = stubHost(root);
      const files = [...new Bun.Glob(host.workerTranscriptGlob).scanSync({ cwd: root })];
      expect(files).toEqual(["worker.log"]);
      const stalled = await findStalledTranscripts(
        [file],
        Date.now(),
        { idleMinutes: 10, pendingToolMinutes: 30 },
        undefined,
        readLastStepFor(host),
      );
      expect(stalled).toHaveLength(1);
      expect(stalled[0]?.pendingTool).toBe("Bash");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

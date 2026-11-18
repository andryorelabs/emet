import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { PhaseRecord } from "./phase";
import { describeCurrentRun, run } from "./runcurrent";

const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode ?? 0;
});

const reviewRecord: PhaseRecord = {
  phase: "review",
  wave: 1,
  spec: "609",
  runId: "emet609w1192829",
  updatedAt: "2026-11-18T19:30:00.000Z",
};

function capture(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    lines.push(parts.join(" "));
  });
  return {
    lines,
    restore: () => {
      spy.mockRestore();
    },
  };
}

describe("describeCurrentRun", () => {
  test("reports the run named by the phase file", () => {
    expect(describeCurrentRun("/repo", { readPhase: () => reviewRecord })).toEqual({
      runId: "emet609w1192829",
      spec: "609",
      wave: 1,
      phase: "review",
      updatedAt: "2026-11-18T19:30:00.000Z",
      state: "active",
    });
  });

  test("reports none when there is no phase file", () => {
    expect(describeCurrentRun("/repo", { readPhase: () => null })).toEqual({
      runId: null,
      spec: null,
      wave: null,
      phase: null,
      updatedAt: null,
      state: "none",
    });
  });

  test("fills spec and wave from the run id when the phase record has none", () => {
    const partial: PhaseRecord = {
      ...reviewRecord,
      runId: "emet621w2233041",
      spec: null,
      wave: null,
    };
    const current = describeCurrentRun("/repo", { readPhase: () => partial });
    expect(current.spec).toBe("621");
    expect(current.wave).toBe(2);
  });

  test("leaves spec and wave empty when the run id is not parseable", () => {
    const partial: PhaseRecord = { ...reviewRecord, runId: null, spec: null, wave: null };
    const current = describeCurrentRun("/repo", { readPhase: () => partial });
    expect(current.spec).toBeNull();
    expect(current.wave).toBeNull();
  });

  test("reports none for a finished run", () => {
    const finished: PhaseRecord = { ...reviewRecord, phase: "done" };
    expect(describeCurrentRun("/repo", { readPhase: () => finished }).state).toBe("none");
  });
});

describe("run", () => {
  test("prints the run id and phase", async () => {
    const out = capture();
    await run(["current"], {
      resolveRepoRoot: () => Promise.resolve("/repo"),
      readPhase: () => reviewRecord,
    });
    out.restore();
    expect(out.lines.join("\n")).toContain("emet609w1192829");
    expect(out.lines.join("\n")).toContain("review");
    expect(process.exitCode ?? 0).toBe(0);
  });

  test("prints no active run and exits 0 without a phase file", async () => {
    const out = capture();
    await run(["current"], {
      resolveRepoRoot: () => Promise.resolve("/repo"),
      readPhase: () => null,
    });
    out.restore();
    expect(out.lines).toEqual(["no active run"]);
    expect(process.exitCode ?? 0).toBe(0);
  });

  test("prints the description as JSON", async () => {
    const out = capture();
    await run(["current", "--json"], {
      resolveRepoRoot: () => Promise.resolve("/repo"),
      readPhase: () => reviewRecord,
    });
    out.restore();
    expect(JSON.parse(out.lines.join("\n"))).toMatchObject({
      runId: "emet609w1192829",
      state: "active",
    });
  });

  test("rejects a missing or unknown subcommand with exit 2", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    await run([]);
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    await run(["bogus"]);
    expect(process.exitCode).toBe(2);
    errorSpy.mockRestore();
  });

  test("exits 2 outside a git repository", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    await run(["current"], { resolveRepoRoot: () => Promise.resolve(null) });
    expect(process.exitCode).toBe(2);
    errorSpy.mockRestore();
  });
});

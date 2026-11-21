import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { formatReport, parseSince, run, summarizeJournal } from "./insights";
import type { JournalEvent, JournalKind } from "./journal";
import { isObject } from "./narrow";

const originalExitCode = process.exitCode;
let directory = "";

beforeEach(() => {
  directory = mkdtempSync(path.join(os.tmpdir(), "emet-insights-"));
});

afterEach(() => {
  process.exitCode = originalExitCode ?? 0;
  rmSync(directory, { recursive: true, force: true });
});

function event(
  kind: JournalKind,
  data: Record<string, unknown> = {},
  extra: Partial<JournalEvent> = {},
): JournalEvent {
  return {
    v: 1,
    ts: "2026-11-10T00:00:00.000Z",
    id: "x",
    kind,
    repo: "/r",
    host: "h",
    origin: "human",
    pid: 1,
    data,
    ...extra,
  };
}

function lines(...events: JournalEvent[]): string {
  return events.map((entry) => `${JSON.stringify(entry)}\n`).join("");
}

async function capture(argv: string[]): Promise<string> {
  const spy = spyOn(console, "log").mockImplementation(() => undefined);
  await run(argv, { directory });
  const output = String(spy.mock.calls[0]?.[0] ?? "");
  spy.mockRestore();
  return output;
}

function parseData(output: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(output);
  return isObject(parsed) ? parsed : {};
}

describe("summarizeJournal", () => {
  test("counts spec.integrate, spec.land and spec.abandon events", () => {
    const report = summarizeJournal(
      [
        event("spec.integrate", { spec: "a", wave: 1 }),
        event("spec.integrate", { spec: "a", wave: 2 }),
        event("spec.land", { spec: "a" }),
        event("spec.abandon", { spec: "b" }),
      ],
      { all: false },
    );
    expect(report.specEvents).toEqual({ integrate: 2, land: 1, abandon: 1 });
    expect(formatReport(report)).toContain("spec branch: integrated=2 landed=1 abandoned=1");
  });

  test("counts runs, decisions, reasons, launches, interventions and closes", () => {
    const report = summarizeJournal(
      [
        event("run.start", { spec: 1, wave: 1 }),
        event("run.start", { spec: 2, wave: 1 }),
        event("launch.result", { spec: 2, wave: 1, outcome: "ok" }, { origin: "auto" }),
        event("launch.result", { spec: 3, wave: 1, outcome: "failed" }, { origin: "auto" }),
        event("gate.decision", { decision: "proceed", reason: "clean" }),
        event("gate.decision", { decision: "fix", reason: "clean" }),
        event("gate.decision", {}),
        event("intervention"),
        event("ticket.close"),
      ],
      { all: false },
    );
    expect(report.runsByOrigin).toEqual({ human: 1, auto: 1 });
    expect(report.gateByDecision).toEqual({ proceed: 1, fix: 1, unknown: 1 });
    expect(report.topReasons).toEqual([{ reason: "clean", count: 2 }]);
    expect(report.launches).toEqual({ ok: 1, failed: 1 });
    expect(report.interventionsPerRun).toBe(0.5);
    expect(report.ticketsClosed).toBe(1);
  });

  test("top reasons sort by count then name", () => {
    const report = summarizeJournal(
      [
        event("gate.decision", { decision: "fix", reason: "b" }),
        event("gate.decision", { decision: "fix", reason: "a" }),
        event("gate.decision", { decision: "fix", reason: "c" }),
        event("gate.decision", { decision: "fix", reason: "c" }),
      ],
      { all: true },
    );
    expect(report.topReasons.map((entry) => entry.reason)).toEqual(["c", "a", "b"]);
  });

  test("an auto-origin run.start counts as auto", () => {
    const report = summarizeJournal([event("run.start", {}, { origin: "auto" })], { all: false });
    expect(report.runsByOrigin.auto).toBe(1);
  });

  test("events before the latest baseline are excluded unless all", () => {
    const events = [event("ticket.close"), event("baseline"), event("ticket.close")];
    expect(summarizeJournal(events, { all: false }).ticketsClosed).toBe(1);
    expect(summarizeJournal(events, { all: true }).ticketsClosed).toBe(2);
  });

  test("since and repo filter events", () => {
    const events = [
      event("ticket.close", {}, { ts: "2026-01-01T00:00:00.000Z" }),
      event("ticket.close", {}, { repo: "/other" }),
      event("ticket.close"),
    ];
    const since = Date.parse("2026-06-01T00:00:00.000Z");
    expect(summarizeJournal(events, { all: true, since }).ticketsClosed).toBe(2);
    expect(summarizeJournal(events, { all: true, repo: "/r" }).ticketsClosed).toBe(2);
  });

  test("an empty list yields a zero report", () => {
    const report = summarizeJournal([], { all: false });
    expect(report.interventionsPerRun).toBe(0);
    expect(formatReport(report)).toContain("gate decisions: none");
  });
});

describe("parseSince", () => {
  test("parses day shorthands and ISO dates, rejects garbage", () => {
    expect(parseSince("7d", 8 * 86_400_000)).toBe(86_400_000);
    expect(parseSince("2026-01-01", 0)).toBe(Date.parse("2026-01-01"));
    expect(parseSince("soon", 0)).toBeUndefined();
  });
});

describe("emet insights", () => {
  test("a missing journal prints a zero report and exits 0", async () => {
    const data = parseData(await capture(["--json"]));
    expect(data.skippedLines).toBe(0);
    expect(data.ticketsClosed).toBe(0);
    expect(process.exitCode ?? 0).toBe(0);
  });

  test("reads rotated segments in order and counts a truncated last line", async () => {
    writeFileSync(path.join(directory, "events.1.jsonl"), lines(event("ticket.close")));
    writeFileSync(path.join(directory, "events.jsonl"), lines(event("ticket.close")));
    appendFileSync(path.join(directory, "events.jsonl"), '{"v":1,"kind":"tick');
    const data = parseData(await capture(["--json", "--all"]));
    expect(data.ticketsClosed).toBe(2);
    expect(data.skippedLines).toBe(1);
  });

  test("a baseline in an older segment excludes only events before it", async () => {
    writeFileSync(
      path.join(directory, "events.2.jsonl"),
      lines(event("ticket.close"), event("baseline")),
    );
    writeFileSync(path.join(directory, "events.1.jsonl"), lines(event("ticket.close")));
    const data = parseData(await capture(["--json"]));
    expect(data.ticketsClosed).toBe(1);
  });

  test("a failed launch or one from another repo does not make a run auto", () => {
    const report = summarizeJournal(
      [
        event("launch.result", { spec: "5", wave: 1, outcome: "failed" }, { origin: "auto" }),
        event("launch.result", { spec: "6", wave: 1, outcome: "started" }, { repo: "/other" }),
        event("run.start", { spec: "5", wave: 1 }),
        event("run.start", { spec: "6", wave: 1 }),
      ],
      { all: true },
    );
    expect(report.runsByOrigin).toEqual({ human: 2, auto: 0 });
  });

  test("unverified launches count as failed", () => {
    const report = summarizeJournal(
      [
        event("launch.result", { outcome: "started" }, { origin: "auto" }),
        event("launch.result", { outcome: "unverified" }, { origin: "auto" }),
      ],
      { all: true },
    );
    expect(report.launches).toEqual({ ok: 1, failed: 1 });
  });

  test("pretty output is the default", async () => {
    expect(await capture([])).toContain("tickets closed: 0");
  });

  test("pretty output lists decisions and reasons", async () => {
    writeFileSync(
      path.join(directory, "events.jsonl"),
      lines(event("gate.decision", { decision: "fix", reason: "lint" })),
    );
    const output = await capture([]);
    expect(output).toContain("gate decisions: fix=1");
    expect(output).toContain("reason (1): lint");
  });

  test("--mark-baseline appends a baseline event that later runs respect", async () => {
    writeFileSync(path.join(directory, "events.jsonl"), lines(event("ticket.close")));
    expect(await capture(["--mark-baseline"])).toBe("baseline recorded");
    expect(parseData(await capture(["--json"])).ticketsClosed).toBe(0);
    expect(parseData(await capture(["--json", "--all"])).ticketsClosed).toBe(1);
    expect(parseData(await capture(["--mark-baseline", "--json"])).baseline).toBe(true);
  });

  test.each([[["--bogus"]], [["--since"]], [["--since", "soon"]]])(
    "usage error for %j exits 2",
    async (argv) => {
      const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
      await run(argv, { directory });
      expect(process.exitCode).toBe(2);
      errorSpy.mockRestore();
    },
  );

  test("--since and --repo are accepted", async () => {
    writeFileSync(path.join(directory, "events.jsonl"), lines(event("ticket.close")));
    const argv = ["--json", "--all", "--since", "7d", "--repo", "/r"];
    expect(parseData(await capture(argv)).ticketsClosed).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isObject } from "./narrow";

import {
  type Ledger,
  addRuling,
  emptyLedger,
  formatRulings,
  nextEscalationModel,
  parseFindings,
  recordRound,
  triageOrder,
} from "./review";

const finding = (over: Record<string, unknown> = {}) => ({
  id: "F1",
  file: "a.ts",
  line: 3,
  severity: "blocker",
  kind: "patch",
  claim: "bad",
  ...over,
});

const parseItems = (items: Record<string, unknown>[]) => parseFindings(JSON.stringify(items));

function readRound(stdout: string): unknown {
  const parsed: unknown = JSON.parse(stdout);
  return isObject(parsed) ? parsed.round : undefined;
}

describe("parseFindings", () => {
  test("accepts a valid array and rejects bad kind/severity/shape", () => {
    expect(parseFindings(JSON.stringify([finding()]))).toHaveLength(1);
    expect(() => parseFindings("nope")).toThrow();
    expect(() => parseFindings(JSON.stringify({}))).toThrow();
    expect(() => parseFindings(JSON.stringify([finding({ kind: "x" })]))).toThrow(/kind/);
    expect(() => parseFindings(JSON.stringify([finding({ severity: "x" })]))).toThrow(/severity/);
    expect(() => parseFindings(JSON.stringify([finding({ line: "a" })]))).toThrow(/line/);
  });
});

describe("triageOrder", () => {
  test("orders intent_gap, bad_plan, patch, defer", () => {
    const list = parseFindings(
      JSON.stringify([
        finding({ id: "d", kind: "defer" }),
        finding({ id: "p", kind: "patch" }),
        finding({ id: "i", kind: "intent_gap" }),
        finding({ id: "b", kind: "bad_plan" }),
      ]),
    );
    expect(triageOrder(list).map((f) => f.id)).toEqual(["i", "b", "p", "d"]);
  });
});

describe("recordRound", () => {
  const cap = 2;

  test("round one keeps findings open", () => {
    const result = recordRound(emptyLedger("T"), parseFindings(JSON.stringify([finding()])), {
      changedFiles: [],
      reviewRounds: cap,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ledger.findings[0]?.status).toBe("open");
  });

  test("recheck defers a new blocker that cites nothing and touches no changed file", () => {
    const first = recordRound(emptyLedger("T"), parseFindings(JSON.stringify([finding()])), {
      changedFiles: [],
      reviewRounds: cap,
    });
    if (!first.ok) throw new Error("unreachable");
    const second = recordRound(
      first.ledger,
      parseFindings(
        JSON.stringify([
          finding({ id: "N1", file: "z.ts" }),
          finding({ id: "N2", file: "z.ts", claim: "follow-up to F1" }),
          finding({ id: "N3", file: "a.ts" }),
          finding({ id: "N4", file: "z.ts", severity: "minor" }),
        ]),
      ),
      { changedFiles: ["a.ts"], reviewRounds: cap },
    );
    if (!second.ok) throw new Error("unreachable");
    const status = Object.fromEntries(second.ledger.findings.map((f) => [f.id, f.status]));
    expect(status).toMatchObject({
      F1: "resolved",
      N1: "deferred",
      N2: "open",
      N3: "open",
      N4: "open",
    });
  });

  test("refuses a round past the cap", () => {
    let ledger: Ledger = emptyLedger("T");
    for (let i = 0; i < cap; i++) {
      const r = recordRound(ledger, [], { changedFiles: [], reviewRounds: cap });
      if (!r.ok) throw new Error("unreachable");
      ledger = r.ledger;
    }
    const over = recordRound(ledger, [], { changedFiles: [], reviewRounds: cap });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toMatch(/cap/);
  });
});

describe("recordRound resolution", () => {
  test("resolves findings the next round no longer reports and does not duplicate repeats", () => {
    const options = { changedFiles: [], reviewRounds: 3 };
    const first = recordRound(
      emptyLedger("T"),
      parseItems([finding({ id: "F1" }), finding({ id: "F2" })]),
      options,
    );
    if (!first.ok) throw new Error("round 1 failed");
    const second = recordRound(first.ledger, parseItems([finding({ id: "F2" })]), options);
    if (!second.ok) throw new Error("round 2 failed");
    expect(second.ledger.findings.filter((entry) => entry.id === "F2")).toHaveLength(1);
    expect(second.ledger.findings.find((entry) => entry.id === "F1")?.status).toBe("resolved");
    const third = recordRound(second.ledger, [], options);
    if (!third.ok) throw new Error("round 3 failed");
    expect(third.ledger.findings.some((entry) => entry.status === "open")).toBe(false);
  });
});

describe("recordRound repeats", () => {
  test("a repeated blocker stays open even when its file did not change", () => {
    const first = recordRound(emptyLedger("T"), parseItems([finding()]), {
      changedFiles: [],
      reviewRounds: 3,
    });
    if (!first.ok) throw new Error("round 1 failed");
    const second = recordRound(first.ledger, parseItems([finding()]), {
      changedFiles: ["b.ts"],
      reviewRounds: 3,
    });
    if (!second.ok) throw new Error("round 2 failed");
    expect(second.ledger.findings.map((entry) => entry.status)).toEqual(["open"]);
  });
});

describe("recordRound deferred repeats", () => {
  test("a deferred blocker reported again stays deferred", () => {
    const options = { changedFiles: ["a.ts"], reviewRounds: 4 };
    const first = recordRound(emptyLedger("T"), parseItems([finding()]), options);
    if (!first.ok) throw new Error("round 1 failed");
    const second = recordRound(
      first.ledger,
      parseItems([finding(), finding({ id: "F9", file: "c.ts" })]),
      options,
    );
    if (!second.ok) throw new Error("round 2 failed");
    const third = recordRound(
      second.ledger,
      parseItems([finding(), finding({ id: "F9", file: "c.ts" })]),
      options,
    );
    if (!third.ok) throw new Error("round 3 failed");
    const status = Object.fromEntries(
      third.ledger.findings.map((entry) => [entry.id, entry.status]),
    );
    expect(status).toEqual({ F1: "open", F9: "deferred" });
  });
});

describe("escalation and rulings", () => {
  test("nextEscalationModel follows the map", () => {
    expect(nextEscalationModel({ sonnet: "opus" }, "sonnet")).toBe("opus");
    expect(nextEscalationModel({ sonnet: "opus" }, "opus")).toBeUndefined();
  });

  test("rulings are recorded and formatted", () => {
    const ledger = addRuling(emptyLedger("T"), { what: "ship", why: "low risk", cost: "rework" });
    expect(formatRulings(ledger)).toBe("Ruling: ship — low risk — rework if wrong");
    expect(formatRulings(emptyLedger("T"))).toBe("");
  });
});

describe("review ledger round trip through the CLI", () => {
  let repo = "";

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-")));
    Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  function runReview(findings: readonly Record<string, unknown>[]) {
    const findingsPath = path.join(repo, "findings.json");
    writeFileSync(findingsPath, JSON.stringify(findings));
    const result = Bun.spawnSync(
      [
        "bun",
        path.join(import.meta.dir, "review.ts"),
        "--ticket",
        "T-1",
        "--findings",
        findingsPath,
      ],
      { cwd: repo, stdout: "pipe", stderr: "pipe" },
    );
    return { exitCode: result.exitCode, stdout: result.stdout.toString() };
  }

  test("a saved ledger with a deferred entry loads again in round two", () => {
    const first = runReview([finding({ id: "F1", severity: "minor" })]);
    expect(first.exitCode).toBe(1);
    expect(readRound(first.stdout)).toBe(1);
    const second = runReview([
      finding({ id: "F1", severity: "minor" }),
      finding({ id: "F2", file: "b.ts", claim: "unrelated new blocker" }),
    ]);
    expect(readRound(second.stdout)).toBe(2);
    const ledger: unknown = JSON.parse(
      readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8"),
    );
    const findings = isObject(ledger) && Array.isArray(ledger.findings) ? ledger.findings : [];
    expect(findings.some((entry) => isObject(entry) && entry.status === "deferred")).toBe(true);
  });

  test("a corrupted ledger exits 2", () => {
    mkdirSync(path.join(repo, ".emet", "review"), { recursive: true });
    writeFileSync(
      path.join(repo, ".emet", "review", "T-1.json"),
      JSON.stringify({
        ticket: "T-1",
        rounds: 1,
        rulings: [],
        findings: [{ ...finding(), status: "bogus", round: 1 }],
      }),
    );
    expect(runReview([finding()]).exitCode).toBe(2);
  });
});

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
  parseVerdicts,
  recordRecheck,
  recordRound,
  run,
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

const base = (): Ledger => {
  const seeded = recordRound(emptyLedger("T-1"), parseItems([finding(), finding({ id: "F2" })]), {
    changedFiles: [],
    reviewRounds: 3,
  });
  if (!seeded.ok) throw new Error(seeded.reason);
  return seeded.ledger;
};

describe("recordRecheck", () => {
  test("resolves a verdict-resolved finding and charges a fix round, not a review round", () => {
    const result = recordRecheck(base(), [{ id: "F1", resolved: true }], { fixRounds: 2 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.ledger.fixRounds).toBe(1);
    expect(result.ledger.rounds).toBe(1);
    expect(result.ledger.findings.map((entry) => entry.status)).toEqual(["resolved", "open"]);
  });

  test("a finding without a resolved verdict stays open", () => {
    const result = recordRecheck(base(), [{ id: "F1", resolved: false }], { fixRounds: 2 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.ledger.findings.map((entry) => entry.status)).toEqual(["open", "open"]);
  });

  test("refuses at the cap and names it", () => {
    const result = recordRecheck({ ...base(), fixRounds: 2 }, [], { fixRounds: 2 });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toContain("(2/2)");
  });

  test("refuses a verdict for a finding that is not open", () => {
    const result = recordRecheck(base(), [{ id: "F9", resolved: true }], { fixRounds: 2 });
    expect(result.ok).toBe(false);
  });

  test("parseVerdicts validates shape", () => {
    expect(parseVerdicts('[{"id":"F1","resolved":true}]')).toEqual([{ id: "F1", resolved: true }]);
    expect(() => parseVerdicts("nope")).toThrow("not valid JSON");
    expect(() => parseVerdicts("{}")).toThrow("JSON array");
    expect(() => parseVerdicts("[1]")).toThrow("must be an object");
    expect(() => parseVerdicts('[{"id":"F1"}]')).toThrow("resolved a boolean");
  });

  test("a ledger from an older emet reads with fixRounds 0", () => {
    expect(emptyLedger("T-1").fixRounds).toBe(0);
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

  test("a recorded round writes the review phase", () => {
    runReview([finding({ id: "F1", severity: "minor" })]);
    const phase: unknown = JSON.parse(readFileSync(path.join(repo, ".emet", "phase.json"), "utf8"));
    expect(isObject(phase) && phase.phase).toBe("review");
  });

  test("an unwritable phase file does not change the exit code or output", () => {
    mkdirSync(path.join(repo, ".emet", "phase.json"), { recursive: true });
    const result = runReview([finding({ id: "F1", severity: "minor" })]);
    expect(result.exitCode).toBe(1);
    expect(readRound(result.stdout)).toBe(1);
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

describe("review run in process", () => {
  const originalDirectory = process.cwd();
  const originalExitCode = process.exitCode;
  let repo = "";
  let logs: string[] = [];
  let errors: string[] = [];
  let originalLog: typeof console.log;
  let originalError: typeof console.error;

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-run-")));
    Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
    process.chdir(repo);
    process.exitCode = 0;
    logs = [];
    errors = [];
    originalLog = console.log;
    originalError = console.error;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.chdir(originalDirectory);
    process.exitCode = originalExitCode ?? 0;
    rmSync(repo, { recursive: true, force: true });
  });

  function writeLedger(content: unknown): void {
    mkdirSync(path.join(repo, ".emet", "review"), { recursive: true });
    writeFileSync(path.join(repo, ".emet", "review", "T-1.json"), JSON.stringify(content));
  }

  function writeFindingsFile(items: readonly Record<string, unknown>[]): string {
    const file = path.join(repo, "findings.json");
    writeFileSync(file, JSON.stringify(items));
    return file;
  }

  test("a missing ticket prints usage and exits 2", async () => {
    await run([]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("--ticket");
  });

  test("a ticket id with path characters is refused", async () => {
    await run(["--ticket", "../x"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("invalid ticket id");
  });

  test("outside a git repository it exits 2", async () => {
    const plain = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-plain-")));
    process.chdir(plain);
    try {
      await run(["--ticket", "T-1", "--rulings"]);
    } finally {
      process.chdir(repo);
      rmSync(plain, { recursive: true, force: true });
    }
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("not inside a git repository");
  });

  test("a rule is saved and then printed by --rulings", async () => {
    await run(["--ticket", "T-1", "--rule", "ship", "--why", "low risk", "--cost", "rework"]);
    expect(process.exitCode).toBe(0);
    await run(["--ticket", "T-1", "--rulings"]);
    expect(logs).toEqual(["Ruling: ship — low risk — rework if wrong"]);
  });

  test("a rule without --why and --cost exits 2", async () => {
    await run(["--ticket", "T-1", "--rule", "ship"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("--rule needs --why and --cost");
  });

  test("--escalate prints the next tier, and fails without a model or a tier", async () => {
    await run(["--ticket", "T-1", "--escalate", "--model", "sonnet"]);
    expect(logs).toEqual(["opus"]);
    await run(["--ticket", "T-1", "--escalate"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("--escalate needs --model");
    process.exitCode = 0;
    await run(["--ticket", "T-1", "--escalate", "--model", "opus"]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain('no escalation tier above "opus"');
  });

  test("a findings run without --findings prints usage and exits 2", async () => {
    await run(["--ticket", "T-1"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("--ticket");
  });

  test("a round with open findings prints them and exits 1, a clean round exits 0", async () => {
    const file = writeFindingsFile([finding({ id: "F1" })]);
    await run(["--ticket", "T-1", "--findings", file, "--changed", "a.ts"]);
    expect(process.exitCode).toBe(1);
    expect(readRound(logs.join("\n"))).toBe(1);
    const clean = writeFindingsFile([]);
    process.exitCode = 0;
    logs = [];
    await run(["--ticket", "T-1", "--findings", clean]);
    expect(process.exitCode).toBe(0);
    expect(readRound(logs.join("\n"))).toBe(2);
  });

  test("recheck resolves a finding through the CLI and refuses at the cap", async () => {
    const entry = { ...finding(), status: "open", round: 1 };
    writeLedger({ ticket: "T-1", rounds: 1, findings: [entry], rulings: [] });
    const verdicts = path.join(repo, "verdicts.json");
    writeFileSync(verdicts, JSON.stringify([{ id: "F1", resolved: true }]));
    await run(["--ticket", "T-1", "--recheck", "--verdicts", verdicts]);
    expect(process.exitCode).toBe(0);
    const saved: unknown = JSON.parse(
      readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8"),
    );
    expect(saved).toMatchObject({ rounds: 1, fixRounds: 1, findings: [{ status: "resolved" }] });
    writeLedger({ ticket: "T-1", rounds: 1, fixRounds: 2, findings: [], rulings: [] });
    await run(["--ticket", "T-1", "--recheck", "--verdicts", verdicts]);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("(2/2)");
  });

  test("recheck without verdicts exits 2; findings still open exit 1", async () => {
    await run(["--ticket", "T-1", "--recheck"]);
    expect(process.exitCode).toBe(2);
    const entry = { ...finding(), status: "open", round: 1 };
    writeLedger({ ticket: "T-1", rounds: 1, findings: [entry], rulings: [] });
    const verdicts = path.join(repo, "verdicts.json");
    writeFileSync(verdicts, "[]");
    await run(["--ticket", "T-1", "--recheck", "--verdicts", verdicts]);
    expect(process.exitCode).toBe(1);
  });

  test("a round past the cap exits 1 with the reason", async () => {
    writeLedger({ ticket: "T-1", rounds: 99, findings: [], rulings: [] });
    await run(["--ticket", "T-1", "--findings", writeFindingsFile([])]);
    expect(process.exitCode).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("an unreadable findings file is an unexpected error and exits 3", async () => {
    await run(["--ticket", "T-1", "--findings", path.join(repo, "absent.json")]);
    expect(process.exitCode).toBe(3);
  });

  test("malformed findings exit 2", async () => {
    const file = path.join(repo, "findings.json");
    writeFileSync(file, "not json");
    await run(["--ticket", "T-1", "--findings", file]);
    expect(process.exitCode).toBe(2);
  });

  test("ledgers with a bad shape exit 2 with a specific message", async () => {
    const cases: [unknown, string][] = [
      [[], "ledger must be a JSON object"],
      [{ ticket: 1, rounds: 0, findings: [], rulings: [] }, "string ticket and a numeric rounds"],
      [{ ticket: "T-1", rounds: 0, findings: {}, rulings: [] }, "must be arrays"],
      [
        { ticket: "T-1", rounds: 0, findings: [], rulings: [1] },
        "ledger ruling 0 must be an object",
      ],
      [
        { ticket: "T-1", rounds: 0, findings: [], rulings: [{ what: "a", why: 2, cost: "c" }] },
        "what, why and cost must be strings",
      ],
      [{ ticket: "T-1", rounds: 0, findings: [1], rulings: [] }, "finding 0 must be an object"],
    ];
    for (const [ledger, message] of cases) {
      writeLedger(ledger);
      errors = [];
      process.exitCode = 0;
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each case shares the process exit code and the ledger file
      await run(["--ticket", "T-1", "--rulings"]);
      expect(process.exitCode).toBe(2);
      expect(errors.join("\n")).toContain(message);
    }
  });

  test("a ledger finding carries its defer reason through a reload", async () => {
    writeLedger({
      ticket: "T-1",
      rounds: 1,
      findings: [{ ...finding(), status: "deferred", round: 1, deferReason: "later" }],
      rulings: [],
    });
    await run(["--ticket", "T-1", "--rule", "x", "--why", "y", "--cost", "z"]);
    const saved = readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8");
    expect(saved).toContain('"deferReason": "later"');
  });
});

describe("parseFindings shapes", () => {
  test("rejects a non-object finding, a missing id, a non-string file and a non-string claim", () => {
    expect(() => parseFindings(JSON.stringify([1]))).toThrow(/finding 0 must be an object/);
    expect(() => parseFindings(JSON.stringify([finding({ id: "" })]))).toThrow(/id must be/);
    expect(() => parseFindings(JSON.stringify([finding({ file: 3 })]))).toThrow(/file must be/);
    expect(() => parseFindings(JSON.stringify([finding({ claim: 3 })]))).toThrow(/claim must be/);
  });
});

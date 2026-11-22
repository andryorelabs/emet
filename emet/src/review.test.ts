import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import {
  type Ledger,
  addRuling,
  emptyLedger,
  formatRulings,
  mergeFindings,
  nextEscalationModel,
  parseAddedLines,
  parseCoverage,
  parseFindings,
  parseVerdicts,
  recordCoverage,
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

const evidence = (known: Record<string, string>) => (file: string, text: string) =>
  (known[file] ?? "").includes(text);

const met = (s: string, proof?: { file: string; name: string }) => ({
  s,
  verdict: "met" as const,
  ...(proof ? { test: proof } : {}),
});

function emptyEvidence(evidenceValue: unknown): string {
  return JSON.stringify([{ s: "S1", verdict: "met", test: evidenceValue }]);
}

describe("coverage verdicts", () => {
  test("parseCoverage accepts verdicts and rejects bad shapes", () => {
    expect(parseCoverage(JSON.stringify([{ s: "S1", verdict: "partial" }]))).toEqual([
      { s: "S1", verdict: "partial" },
    ]);
    expect(() => parseCoverage("nope")).toThrow(/not valid JSON/);
    expect(() => parseCoverage("{}")).toThrow(/JSON array/);
    expect(() => parseCoverage(JSON.stringify([{ s: "S1", verdict: "x" }]))).toThrow(/verdict/);
    expect(() => parseCoverage(JSON.stringify([{ s: "S1", verdict: "met", test: {} }]))).toThrow(
      /test/,
    );
  });

  test("a met whose test file lacks the test name opens VG-S1", () => {
    const result = recordCoverage(
      emptyLedger("T"),
      [met("S1", { file: "emet/src/a.test.ts", name: "parses x" })],
      { expect: [], fileContains: evidence({ "emet/src/a.test.ts": "other" }) },
    );
    expect(result.ok && result.ledger.findings).toMatchObject([
      {
        id: "VG-S1",
        file: "emet/src/a.test.ts",
        line: 0,
        severity: "major",
        kind: "patch",
        status: "open",
        claim: "verification-gap: S1 met without evidence",
      },
    ]);
  });

  test("parseCoverage rejects an empty test file or name", () => {
    expect(() => parseCoverage(emptyEvidence({ file: "a.ts", name: "" }))).toThrow(/non-empty/);
    expect(() => parseCoverage(emptyEvidence({ file: "", name: "x" }))).toThrow(/non-empty/);
  });

  test("a met with no test opens VG-S1 with an empty file", () => {
    const result = recordCoverage(emptyLedger("T"), [met("S1")], {
      expect: [],
      fileContains: evidence({}),
    });
    expect(result.ok && result.ledger.findings[0]).toMatchObject({ id: "VG-S1", file: "" });
  });

  test("expect lists a missing S as VG and valid evidence adds nothing", () => {
    const result = recordCoverage(
      emptyLedger("T"),
      [met("S1", { file: "a.test.ts", name: "parses x" })],
      { expect: ["S1", "S2"], fileContains: evidence({ "a.test.ts": "parses x" }) },
    );
    expect(result.ok && result.ledger.findings).toMatchObject([
      { id: "VG-S2", claim: "verification-gap: S2 has no coverage verdict" },
    ]);
    expect(result.ok && result.ledger.coverage).toHaveLength(1);
  });

  test("a later findings round omitting VG-S2 leaves it open", () => {
    const covered = recordCoverage(emptyLedger("T"), [], {
      expect: ["S2"],
      fileContains: evidence({}),
    });
    if (!covered.ok) throw new Error("coverage failed");
    const round = recordRound(covered.ledger, [], { changedFiles: [], reviewRounds: 3 });
    expect(round.ok && round.ledger.findings).toMatchObject([{ id: "VG-S2", status: "open" }]);
  });

  test("a later coverage call that no longer produces the gap resolves it", () => {
    const first = recordCoverage(emptyLedger("T"), [], {
      expect: ["S2"],
      fileContains: () => true,
    });
    if (!first.ok) throw new Error("coverage failed");
    const second = recordCoverage(first.ledger, [met("S2", { file: "f", name: "n" })], {
      expect: ["S2"],
      fileContains: () => true,
    });
    expect(second.ok && second.ledger.findings).toMatchObject([
      { id: "VG-S2", status: "resolved" },
    ]);
  });

  test("a VG finding is never marked pre-existing", () => {
    const round = recordRound(
      emptyLedger("T"),
      parseItems([finding({ id: "VG-S9", file: "", line: 0, severity: "major" })]),
      { changedFiles: [], reviewRounds: 3, addedLines: new Map() },
    );
    expect(round.ok && round.ledger.findings[0]?.preexisting).toBeUndefined();
  });
});

describe("pre-existing detection", () => {
  test("parseAddedLines reads hunks and renames and ignores deletions", () => {
    const diff = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 80%",
      "rename from old.ts",
      "rename to new.ts",
      "--- a/old.ts",
      "+++ b/new.ts",
      "@@ -5 +5,2 @@",
      "+x",
      "+y",
      "@@ -9,2 +10,0 @@",
      "-gone",
      "-gone2",
      "diff --git a/dead.ts b/dead.ts",
      "--- a/dead.ts",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
    ].join("\n");
    const added = parseAddedLines(diff);
    expect(added.get("new.ts")).toEqual([[5, 6]]);
    expect(added.has("dead.ts")).toBe(false);
  });

  test("findings off the added lines are marked and findings on them are not", () => {
    const round = recordRound(
      emptyLedger("T"),
      parseItems([
        finding({ id: "on", file: "new.ts", line: 6 }),
        finding({ id: "off", file: "new.ts", line: 10 }),
        finding({ id: "other", file: "untouched.ts", line: 1 }),
      ]),
      { changedFiles: [], reviewRounds: 3, addedLines: new Map([["new.ts", [[5, 6]]]]) },
    );
    const byId = Object.fromEntries(
      round.ok ? round.ledger.findings.map((entry) => [entry.id, entry.preexisting]) : [],
    );
    expect(byId).toEqual({ on: undefined, off: true, other: true });
  });

  test("without addedLines nothing is marked", () => {
    const round = recordRound(emptyLedger("T"), parseItems([finding()]), {
      changedFiles: [],
      reviewRounds: 3,
    });
    expect(round.ok && round.ledger.findings[0]?.preexisting).toBeUndefined();
  });
});

describe("finding fields", () => {
  test("s, userOption, preexisting and agreement round trip", () => {
    const [parsed] = parseItems([
      finding({ s: "S1", userOption: "S2", preexisting: true, agreement: "both" }),
    ]);
    expect(parsed).toMatchObject({
      s: "S1",
      userOption: "S2",
      preexisting: true,
      agreement: "both",
    });
  });

  test("a bad optional field is rejected naming the field", () => {
    expect(() => parseItems([finding({ userOption: 3 })])).toThrow(/userOption/);
    expect(() => parseItems([finding({ s: 3 })])).toThrow(/ s must/);
    expect(() => parseItems([finding({ agreement: "x" })])).toThrow(/agreement/);
    expect(() => parseItems([finding({ preexisting: "y" })])).toThrow(/preexisting/);
  });

  test("a null s or userOption never reaches the finding", () => {
    const [parsed] = parseItems([finding({ s: null, userOption: null })]);
    expect(parsed).toBeDefined();
    expect(parsed && "s" in parsed).toBe(false);
    expect(parsed && "userOption" in parsed).toBe(false);
  });
});

interface SavedLedger {
  base?: string;
  findings: { id: string; status: string; preexisting?: boolean }[];
}

function parseLedgerFile(text: string): SavedLedger {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || !Array.isArray(parsed.findings)) throw new Error("bad ledger");
  return {
    ...(typeof parsed.base === "string" ? { base: parsed.base } : {}),
    findings: parsed.findings.flatMap((entry: unknown) =>
      isObject(entry) && typeof entry.id === "string" && typeof entry.status === "string"
        ? [
            {
              id: entry.id,
              status: entry.status,
              ...(entry.preexisting === true ? { preexisting: true } : {}),
            },
          ]
        : [],
    ),
  };
}

describe("review CLI with a base and coverage", () => {
  let repo = "";
  const vcs = (...args: string[]) => {
    const result = Bun.spawnSync(
      ["git", "-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args],
      { stdout: "pipe", stderr: "pipe" },
    );
    return result.stdout.toString().trim();
  };
  const review = (args: string[], input: unknown) => {
    const file = path.join(repo, "input.json");
    writeFileSync(file, JSON.stringify(input));
    const flag = args.includes("--coverage") ? "--coverage" : "--findings";
    const rest = args.filter((arg) => arg !== flag);
    const result = Bun.spawnSync(
      ["bun", path.join(import.meta.dir, "review.ts"), "--ticket", "T-1", flag, file, ...rest],
      { cwd: repo, stdout: "pipe", stderr: "pipe" },
    );
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };
  const ledger = () =>
    parseLedgerFile(readFileSync(path.join(repo, ".emet", "review", "T-1.json"), "utf8"));

  beforeEach(() => {
    repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-review-base-")));
    vcs("init", "-q", "-b", "main");
    writeFileSync(path.join(repo, "old.ts"), "a\nb\nc\nd\ne\n");
    writeFileSync(path.join(repo, "gone.ts"), "1\n2\n3\n");
    vcs("add", ".");
    vcs("commit", "-q", "-m", "init");
    vcs("mv", "old.ts", "new.ts");
    writeFileSync(path.join(repo, "new.ts"), "a\nb\nCHANGED\nd\ne\n");
    writeFileSync(path.join(repo, "gone.ts"), "1\n3\n");
    vcs("add", ".");
    vcs("commit", "-q", "-m", "wave");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("a finding on a renamed file's changed line is not pre-existing, others are", () => {
    const result = review(
      ["--base", "HEAD~1"],
      [
        finding({ id: "on", file: "new.ts", line: 3 }),
        finding({ id: "off", file: "new.ts", line: 5 }),
        finding({ id: "deleted", file: "gone.ts", line: 2 }),
      ],
    );
    expect(result.exitCode).toBe(1);
    const saved = ledger();
    expect(saved.base).toBe(vcs("rev-parse", "HEAD~1"));
    const marked = Object.fromEntries(saved.findings.map((entry) => [entry.id, entry.preexisting]));
    expect(marked).toEqual({ on: undefined, off: true, deleted: true });
  });

  test("a later round with a different base exits 2 naming the stored one", () => {
    review(["--base", "HEAD~1"], [finding({ id: "F1", severity: "minor" })]);
    const stored = vcs("rev-parse", "HEAD~1");
    const second = review(["--base", "HEAD"], [finding({ id: "F1", severity: "minor" })]);
    expect(second.exitCode).toBe(2);
    expect(second.stderr).toContain(stored);
  });

  test("an unresolvable base exits 2", () => {
    expect(review(["--base", "nope"], [finding()]).exitCode).toBe(2);
  });

  test("a finding path written with ./ or absolute is matched against the diff", () => {
    review(
      ["--base", "HEAD~1"],
      [
        finding({ id: "dot", file: "./new.ts", line: 3 }),
        finding({ id: "abs", file: path.join(repo, "new.ts"), line: 3 }),
      ],
    );
    const marked = Object.fromEntries(
      ledger().findings.map((entry) => [entry.id, entry.preexisting]),
    );
    expect(marked).toEqual({ dot: undefined, abs: undefined });
  });

  test("a reported preexisting flag is dropped from --findings input", () => {
    review([], [finding({ id: "F1", severity: "blocker", preexisting: true })]);
    expect(ledger().findings[0]?.preexisting).toBeUndefined();
  });

  test("a coverage test file outside the working tree opens VG-S1", () => {
    writeFileSync(path.join(path.dirname(repo), "outside.test.ts"), "parses x");
    const result = review(
      ["--coverage"],
      [{ s: "S1", verdict: "met", test: { file: "../outside.test.ts", name: "parses x" } }],
    );
    rmSync(path.join(path.dirname(repo), "outside.test.ts"), { force: true });
    expect(result.exitCode).toBe(1);
    expect(ledger().findings[0]?.id).toBe("VG-S1");
  });

  test("without --base nothing is marked and no base is stored", () => {
    review([], [finding({ id: "F1", file: "new.ts", line: 5 })]);
    const saved = ledger();
    expect(saved.base).toBeUndefined();
    expect(saved.findings[0]?.preexisting).toBeUndefined();
  });

  test("--coverage stores verdicts, exits 1 on a gap and keeps it through a findings round", () => {
    const result = review(
      ["--coverage", "--expect", "S1,S2"],
      [{ s: "S1", verdict: "met", test: { file: "new.ts", name: "CHANGED" } }],
    );
    expect(result.exitCode).toBe(1);
    const printed: unknown = JSON.parse(result.stdout);
    expect(isObject(printed) && printed.coverage).toHaveLength(1);
    const open = isObject(printed) && Array.isArray(printed.open) ? printed.open : [];
    expect(open.map((entry: unknown) => isObject(entry) && entry.id)).toEqual(["VG-S2"]);
    review([], [finding({ id: "F1", severity: "minor" })]);
    expect(ledger().findings.find((entry) => entry.id === "VG-S2")?.status).toBe("open");
  });

  test("--coverage with every S proven exits 0", () => {
    const result = review(
      ["--coverage", "--expect", "S1"],
      [{ s: "S1", verdict: "met", test: { file: "new.ts", name: "CHANGED" } }],
    );
    expect(result.exitCode).toBe(0);
  });

  test("a findings file with a numeric userOption exits 2 naming the field", () => {
    const result = review([], [finding({ userOption: 3 })]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("userOption");
  });
});

const merge = (a: Record<string, unknown>[], b: Record<string, unknown>[]) =>
  mergeFindings(parseItems(a), parseItems(b));

describe("mergeFindings", () => {
  test("pairs findings on the same file within 3 lines into one agreeing finding", () => {
    const merged = merge(
      [finding({ id: "F-001", file: "x.ts", line: 10, severity: "minor" })],
      [finding({ id: "F-001", file: "x.ts", line: 12, severity: "major" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "F-001", severity: "major", agreement: "both" });
  });

  test("pairs findings sharing s and keeps unpaired ones as single", () => {
    const merged = merge(
      [finding({ id: "A", file: "x.ts", line: 1, s: "S1" })],
      [
        finding({ id: "B", file: "z.ts", line: 90, s: "S1" }),
        finding({ id: "A", file: "y.ts", line: 50 }),
      ],
    );
    expect(merged.map((entry) => [entry.id, entry.agreement])).toEqual([
      ["A", "both"],
      ["X-A", "single"],
    ]);
  });

  test("a line gap over 3 does not pair, and each finding pairs once", () => {
    const merged = merge(
      [finding({ id: "A", line: 10 }), finding({ id: "B", line: 11 })],
      [finding({ id: "C", line: 10 }), finding({ id: "D", line: 30 })],
    );
    expect(merged.map((entry) => entry.agreement)).toEqual(["both", "single", "single"]);
  });

  test("keeps userOption from either side of a pair", () => {
    const merged = merge([finding({ id: "A" })], [finding({ id: "B", userOption: "S2" })]);
    expect(merged[0]?.userOption).toBe("S2");
  });
});

describe("review --merge CLI", () => {
  test("prints the merged array without a ticket", async () => {
    const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-merge-")));
    const first = path.join(dir, "a.json");
    const second = path.join(dir, "b.json");
    writeFileSync(first, JSON.stringify([finding({ id: "F-001", file: "x.ts", line: 10 })]));
    writeFileSync(second, JSON.stringify([finding({ id: "F-009", file: "y.ts", line: 50 })]));
    const lines: string[] = [];
    const spy = spyOn(console, "log").mockImplementation(
      (...args) => void lines.push(args.join(" ")),
    );
    await run(["--merge", first, second]);
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    const merged: unknown = JSON.parse(lines.join("\n"));
    expect(merged).toMatchObject([{ agreement: "single" }, { id: "F-009", agreement: "single" }]);
  });
});

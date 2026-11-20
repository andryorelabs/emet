import { describe, expect, test } from "bun:test";

import {
  closeCompletedSpecs,
  closeGithubTickets,
  parseIssueNumber,
  runGh,
  type GhRunner,
} from "./ticketclose";

interface FakeOptions {
  readonly closed?: ReadonlySet<number>;
  readonly failClose?: ReadonlySet<number>;
  readonly failView?: ReadonlySet<number>;
  readonly stayOpen?: ReadonlySet<number>;
}

function fakeGh(options: FakeOptions = {}): { gh: GhRunner; calls: string[][] } {
  const closed = new Set(options.closed ?? []);
  const calls: string[][] = [];
  const gh: GhRunner = (args) => {
    calls.push([...args]);
    const issue = Number(args[2]);
    if (args[1] === "view") {
      if (options.failView?.has(issue)) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
      }
      const stdout = closed.has(issue) ? "CLOSED\n" : "OPEN\n";
      return Promise.resolve({ exitCode: 0, stdout, stderr: "" });
    }
    if (options.failClose?.has(issue)) {
      return Promise.resolve({ exitCode: 1, stdout: "", stderr: "boom\n" });
    }
    if (!options.stayOpen?.has(issue)) closed.add(issue);
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  };
  return { gh, calls };
}

const throwingGh: GhRunner = () => Promise.reject(new Error("spawn failed"));

describe("parseIssueNumber", () => {
  test("accepts CLA-n, #n and bare n", () => {
    expect(parseIssueNumber("CLA-12")).toBe(12);
    expect(parseIssueNumber("#12")).toBe(12);
    expect(parseIssueNumber("12")).toBe(12);
  });

  test("rejects anything else", () => {
    for (const bad of ["", "abc", "CLA-", "0", "1.5", "-3", "CLA-x"]) {
      expect(parseIssueNumber(bad)).toBeNull();
    }
  });
});

describe("closeGithubTickets", () => {
  test("closes once and reports already-closed for a duplicate", async () => {
    const { gh, calls } = fakeGh();
    const results = await closeGithubTickets(["CLA-12", "12"], { reason: "completed" }, gh);
    expect(results.map((result) => result.outcome)).toEqual(["closed", "already-closed"]);
    expect(calls.filter((call) => call[1] === "close")).toEqual([
      ["issue", "close", "12", "--reason", "completed"],
    ]);
  });

  test("adds the landed comment with --pr and maps not_planned", async () => {
    const { gh, calls } = fakeGh();
    await closeGithubTickets(["#5"], { pr: 9, reason: "not_planned" }, gh);
    expect(calls.find((call) => call[1] === "close")).toEqual([
      "issue",
      "close",
      "5",
      "--reason",
      "not planned",
      "--comment",
      "Landed in #9",
    ]);
  });

  test("a failing close does not stop the others", async () => {
    const { gh } = fakeGh({ failClose: new Set([1]) });
    const results = await closeGithubTickets(["1", "2"], { reason: "completed" }, gh);
    expect(results[0]).toMatchObject({ outcome: "failed", detail: "boom" });
    expect(results[1]?.outcome).toBe("closed");
  });

  test("an unparsable ticket and a failed view are failures", async () => {
    const { gh } = fakeGh({ failView: new Set([3]) });
    const results = await closeGithubTickets(["nope", "3"], { reason: "completed" }, gh);
    expect(results[0]).toMatchObject({ issue: null, outcome: "failed" });
    expect(results[1]).toMatchObject({ issue: 3, outcome: "failed", detail: "gh exited 1" });
  });

  test("an issue still open after close fails verification", async () => {
    const { gh } = fakeGh({ stayOpen: new Set([4]) });
    const results = await closeGithubTickets(["4"], { reason: "completed" }, gh);
    expect(results[0]).toMatchObject({ outcome: "failed", detail: "issue is OPEN after close" });
  });

  test("a thrown runner error becomes a failure", async () => {
    const results = await closeGithubTickets(["7"], { reason: "completed" }, throwingGh);
    expect(results[0]).toMatchObject({ outcome: "failed", detail: "spawn failed" });
  });
});

describe("runGh", () => {
  test("captures output and exit code", async () => {
    const result = await runGh(["--version"]);
    expect(typeof result.exitCode).toBe("number");
    expect(typeof result.stdout).toBe("string");
  });
});

interface SpecFixture {
  readonly parents: Readonly<Record<number, string>>;
  readonly specs: Readonly<Record<number, { state: string; total: number; completed: number }>>;
  readonly failClose?: ReadonlySet<number>;
  readonly failParent?: ReadonlySet<number>;
}

function ok(stdout: string) {
  return Promise.resolve({ exitCode: 0, stdout, stderr: "" });
}

function specGh(fixture: SpecFixture): { gh: GhRunner; calls: string[][] } {
  const calls: string[][] = [];
  const closedSpecs = new Set<number>();
  const gh: GhRunner = (args) => {
    calls.push([...args]);
    const issue = Number(args[2]);
    if (args[1] === "close") {
      if (fixture.failClose?.has(issue)) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "nope\n" });
      }
      closedSpecs.add(issue);
      return ok("");
    }
    if (args[4] === "parent") {
      if (fixture.failParent?.has(issue)) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "denied\n" });
      }
      return ok(fixture.parents[issue] ?? "");
    }
    if (args[4] === "state") return ok(closedSpecs.has(issue) ? "CLOSED\n" : "OPEN\n");
    const spec = fixture.specs[issue];
    return ok(
      JSON.stringify({
        state: spec?.state,
        subIssuesSummary: { total: spec?.total, completed: spec?.completed },
      }),
    );
  };
  return { gh, calls };
}

function closedResult(issue: number, outcome: "closed" | "already-closed" | "failed" = "closed") {
  return { ticket: `CLA-${issue}`, issue, outcome } as const;
}

describe("closeCompletedSpecs", () => {
  test("closes a completed spec once for two tickets, with the comment", async () => {
    const { gh, calls } = specGh({
      parents: { 1: "9\n", 2: "9\n" },
      specs: { 9: { state: "OPEN", total: 5, completed: 5 } },
    });
    const specs = await closeCompletedSpecs([closedResult(1), closedResult(2)], gh);
    expect(specs).toEqual([{ spec: 9, outcome: "closed" }]);
    expect(calls.filter((call) => call[1] === "close")).toEqual([
      ["issue", "close", "9", "--reason", "completed", "--comment", "All 5 tickets landed."],
    ]);
  });

  test("keeps a spec with open sub-issues open", async () => {
    const { gh, calls } = specGh({
      parents: { 1: "9" },
      specs: { 9: { state: "OPEN", total: 3, completed: 2 } },
    });
    expect(await closeCompletedSpecs([closedResult(1)], gh)).toEqual([
      { spec: 9, outcome: "open" },
    ]);
    expect(calls.some((call) => call[1] === "close")).toBe(false);
  });

  test("never closes a spec with total 0 or one already closed", async () => {
    const { gh, calls } = specGh({
      parents: { 1: "9", 2: "8" },
      specs: {
        9: { state: "OPEN", total: 0, completed: 0 },
        8: { state: "CLOSED", total: 2, completed: 2 },
      },
    });
    const specs = await closeCompletedSpecs([closedResult(1), closedResult(2)], gh);
    expect(specs).toEqual([
      { spec: 9, outcome: "open" },
      { spec: 8, outcome: "already-closed" },
    ]);
    expect(calls.some((call) => call[1] === "close")).toBe(false);
  });

  test("a null or empty parent adds no entry; a failed ticket is not read", async () => {
    const { gh, calls } = specGh({ parents: { 1: "null" }, specs: {} });
    const specs = await closeCompletedSpecs(
      [closedResult(1), closedResult(2, "already-closed"), closedResult(3, "failed")],
      gh,
    );
    expect(specs).toEqual([]);
    expect(calls.map((call) => call[2])).toEqual(["1", "2"]);
  });

  test("reports failed when the spec close fails", async () => {
    const { gh } = specGh({
      parents: { 1: "9" },
      specs: { 9: { state: "OPEN", total: 1, completed: 1 } },
      failClose: new Set([9]),
    });
    expect(await closeCompletedSpecs([closedResult(1)], gh)).toEqual([
      { spec: 9, outcome: "failed", detail: "nope" },
    ]);
  });

  test("reports failed when the parent read fails", async () => {
    const { gh } = specGh({ parents: {}, specs: {}, failParent: new Set([1]) });
    const specs = await closeCompletedSpecs([closedResult(1)], gh);
    expect(specs).toEqual([
      { spec: null, ticket: 1, outcome: "failed", detail: "parent read failed: denied" },
    ]);
  });
});

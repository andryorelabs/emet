import { describe, expect, test } from "bun:test";

import { closeGithubTickets, parseIssueNumber, runGh, type GhRunner } from "./ticketclose";

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

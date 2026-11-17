import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { runGates, runPrePush } from "./pre-push";

const PASS = ["true"];
const FAIL_WITH_THREE = ["sh", "-c", "exit 3"];

describe("runGates", () => {
  test("passes when every gate passes", () => {
    expect(runGates([PASS, PASS])).toBe(0);
  });

  test("returns the first failing gate's code and skips the rest", () => {
    expect(runGates([PASS, FAIL_WITH_THREE, ["sh", "-c", "exit 4"]])).toBe(3);
  });

  test("passes with no gates", () => {
    expect(runGates([])).toBe(0);
  });
});

describe("runPrePush", () => {
  const errors = spyOn(console, "error").mockImplementation(() => undefined);

  afterAll(() => {
    errors.mockRestore();
  });

  test("blocks a push to a protected ref and names it", () => {
    const code = runPrePush("refs/heads/cla-1-a abc refs/heads/main def\n", [FAIL_WITH_THREE]);
    expect(code).toBe(1);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("refs/heads/main"));
  });

  test("blocks a branch with a bad name", () => {
    expect(runPrePush("refs/heads/wip abc refs/heads/wip def\n", [PASS])).toBe(1);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining('branch "wip"'));
  });

  test("checks the remote branch name of a deletion", () => {
    expect(runPrePush("(delete) 000 refs/heads/main def\n", [PASS])).toBe(1);
    expect(runPrePush("(delete) 000 refs/heads/feat/old def\n", [FAIL_WITH_THREE])).toBe(0);
  });

  test("runs the gates for a valid branch push and returns their code", () => {
    const input = "refs/heads/cla-1-a abc refs/heads/cla-1-a def\n";
    expect(runPrePush(input, [PASS])).toBe(0);
    expect(runPrePush(input, [FAIL_WITH_THREE])).toBe(3);
  });

  test("skips the gates for a tag-only push and empty input", () => {
    expect(runPrePush("refs/tags/v1 abc refs/tags/v1 def\n", [FAIL_WITH_THREE])).toBe(0);
    expect(runPrePush("", [FAIL_WITH_THREE])).toBe(0);
  });
});

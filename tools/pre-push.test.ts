import { describe, expect, test } from "bun:test";

import { checkPush, gateFailureCode, parsePushLines, pushNeedsGates } from "./pre-push";

describe("checkPush", () => {
  test.each(["refs/heads/main", "refs/heads/develop"])("blocks pushes to %s", (remoteRef) => {
    const verdict = checkPush(remoteRef, "cla-12-foo");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(remoteRef);
  });

  test("blocks a local main pushed to a protected ref", () => {
    expect(checkPush("refs/heads/main", "main").ok).toBe(false);
  });

  test("allows tag refs regardless of local name", () => {
    expect(checkPush("refs/tags/v1.2.3", "v1.2.3")).toEqual({ ok: true });
  });

  test.each([
    "cla-12-foo",
    "cla-134-coverage-gates-pre-push",
    "feat/some-thing",
    "fix/a/b",
    "chore/wave-2",
    "revert/x",
    "renovate/bun-1.x",
    "worktree-agent-ab0423e696e0f08a8",
    "spec/810",
  ])("allows branch %s", (branch) => {
    expect(checkPush(`refs/heads/${branch}`, branch)).toEqual({ ok: true });
  });

  test.each([
    "wip",
    "cla-foo",
    "cla-12-",
    "feature/x",
    "feat/",
    "my-branch",
    "Worktree-x",
    "feat/Foo Bar",
    "cla-1-Foo",
    "worktree-A",
    "spec/",
    "spec/abc",
    "spec/12/x",
  ])("rejects branch %s", (branch) => {
    const verdict = checkPush(`refs/heads/${branch}`, branch);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain(branch);
  });
});

describe("parsePushLines", () => {
  test("extracts local and remote refs", () => {
    const input =
      "refs/heads/cla-1-a abc refs/heads/cla-1-a def\nrefs/heads/x 111 refs/heads/y 222\n";
    expect(parsePushLines(input)).toEqual([
      { localRef: "refs/heads/cla-1-a", remoteRef: "refs/heads/cla-1-a" },
      { localRef: "refs/heads/x", remoteRef: "refs/heads/y" },
    ]);
  });

  test("ignores blank input", () => {
    expect(parsePushLines("")).toEqual([]);
  });
});

describe("gateFailureCode", () => {
  test("passes a successful gate", () => {
    expect(gateFailureCode({ success: true, exitCode: 0 })).toBe(0);
  });

  test("keeps the gate's own failing code", () => {
    expect(gateFailureCode({ success: false, exitCode: 2 })).toBe(2);
  });

  test("blocks a signal-killed gate whose exit code is null at runtime", () => {
    const killed = Bun.spawnSync(["sh", "-c", "kill -TERM $$"]);
    expect(gateFailureCode(killed)).toBe(1);
  });
});

describe("pushNeedsGates", () => {
  test("is true for a branch update", () => {
    expect(
      pushNeedsGates([{ localRef: "refs/heads/cla-1-a", remoteRef: "refs/heads/cla-1-a" }]),
    ).toBe(true);
  });

  test("is false for a delete-only push", () => {
    expect(pushNeedsGates([{ localRef: "(delete)", remoteRef: "refs/heads/feat/old" }])).toBe(
      false,
    );
  });

  test("is false for a tag-only push and for no lines", () => {
    expect(pushNeedsGates([{ localRef: "refs/tags/v1", remoteRef: "refs/tags/v1" }])).toBe(false);
    expect(pushNeedsGates([])).toBe(false);
  });

  test("is true when a deletion rides with a branch update", () => {
    expect(
      pushNeedsGates([
        { localRef: "(delete)", remoteRef: "refs/heads/feat/old" },
        { localRef: "refs/heads/feat/x", remoteRef: "refs/heads/feat/x" },
      ]),
    ).toBe(true);
  });
});

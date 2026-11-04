import { describe, expect, test } from "bun:test";
import { checkPush, parsePushLines } from "./pre-push";

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
  ])("allows branch %s", (branch) => {
    expect(checkPush(`refs/heads/${branch}`, branch)).toEqual({ ok: true });
  });

  test.each(["wip", "cla-foo", "cla-12-", "feature/x", "feat/", "my-branch", "Worktree-x"])(
    "rejects branch %s",
    (branch) => {
      const verdict = checkPush(`refs/heads/${branch}`, branch);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain(branch);
    },
  );
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

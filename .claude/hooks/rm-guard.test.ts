import { describe, expect, test } from "bun:test";
import { decideRemovalGuard, isAllowedRemoval } from "./rm-guard.ts";

const repo = "/home/dev/emet";

describe("isAllowedRemoval", () => {
  test("denies a recursive force-delete of the repo root", () => {
    expect(isAllowedRemoval("rm -rf .", repo)).toBe(false);
    expect(isAllowedRemoval(`rm -rf ${repo}`, repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf /", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf *", repo)).toBe(false);
  });

  test("denies every recursive+force spelling outside scratch", () => {
    for (const command of [
      "rm -fr src",
      "rm -Rf src",
      "rm -r -f src",
      "rm --recursive --force src",
      "rm -rf -- src",
      "sudo rm -rf src",
      "command rm -rf src",
      "/bin/rm -rf src",
    ]) {
      expect(isAllowedRemoval(command, repo)).toBe(false);
    }
  });

  test("denies unresolvable targets", () => {
    expect(isAllowedRemoval("rm -rf $HOME", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf ~/code", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf $(pwd)", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf `pwd`", repo)).toBe(false);
  });

  test("denies escapes out of the scratch area", () => {
    expect(isAllowedRemoval("rm -rf /tmp/../etc", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf /tmp/x/../../src", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf /tmp", repo)).toBe(false);
  });

  test("denies recursive force-deletes inside the repo, run directory included", () => {
    expect(isAllowedRemoval("rm -rf .emet", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf .emet/runs/x", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf .emet/tickets", repo)).toBe(false);
    expect(isAllowedRemoval(`rm -rf ${repo}/.emet/tmp`, repo)).toBe(false);
  });

  test("denies when one segment of a chain is unsafe", () => {
    expect(isAllowedRemoval("ls && rm -rf src", repo)).toBe(false);
    expect(isAllowedRemoval("rm -rf /tmp/x; rm -rf src", repo)).toBe(false);
    expect(isAllowedRemoval("echo hi | xargs rm -rf src", repo)).toBe(false);
  });

  test("allows recursive force-deletes inside scratch", () => {
    expect(isAllowedRemoval("rm -rf /tmp/emet-e2e", repo)).toBe(true);
    expect(isAllowedRemoval("rm -rf /tmp/a /tmp/b/c", repo)).toBe(true);
    expect(isAllowedRemoval('rm -rf "/tmp/with space"', repo)).toBe(true);
  });

  test("allows removals that are not recursive and forced", () => {
    expect(isAllowedRemoval("rm file.txt", repo)).toBe(true);
    expect(isAllowedRemoval("rm -f file.txt", repo)).toBe(true);
    expect(isAllowedRemoval("rm -r build", repo)).toBe(true);
  });

  test("blocks recursive force-deletes hidden behind shell constructs and wrappers", () => {
    const hidden = [
      "(rm -rf src)",
      "{ rm -rf src; }",
      "\\rm -rf src",
      "echo $(rm -rf src)",
      "echo `rm -rf src`",
      "if true; then rm -rf src; fi",
      "for d in a; do rm -rf src; done",
      "sudo -u root rm -rf src",
      "timeout 5 rm -rf src",
      "nice rm -rf src",
      "find . -exec rm -rf {} +",
      "ls | xargs rm -rf",
    ];
    for (const command of hidden) {
      expect(isAllowedRemoval(command, repo)).toBe(false);
    }
  });

  test("still allows scratch removals behind wrappers", () => {
    expect(isAllowedRemoval("timeout 5 rm -rf /tmp/x", repo)).toBe(true);
    expect(isAllowedRemoval("(rm -rf /tmp/x)", repo)).toBe(true);
  });

  test("allows commands that do not remove anything", () => {
    expect(isAllowedRemoval("bun run check", repo)).toBe(true);
    expect(isAllowedRemoval("git rm -rf src", repo)).toBe(true);
    expect(isAllowedRemoval("echo rm -rf /", repo)).toBe(true);
    expect(isAllowedRemoval("", repo)).toBe(true);
  });
});

describe("decideRemovalGuard", () => {
  const input = (command: string) =>
    JSON.stringify({ tool_name: "Bash", cwd: repo, tool_input: { command } });

  test("emits a deny decision for an unsafe removal", () => {
    const output = decideRemovalGuard(input("rm -rf ."));
    expect(output).not.toBeNull();
    const parsed = JSON.parse(output ?? "{}");
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  });

  test("stays silent for a safe command", () => {
    expect(decideRemovalGuard(input("rm -rf /tmp/x"))).toBeNull();
    expect(decideRemovalGuard(input("ls"))).toBeNull();
  });

  test("stays silent when the input has no command", () => {
    expect(decideRemovalGuard(JSON.stringify({ tool_input: {} }))).toBeNull();
    expect(decideRemovalGuard("{}")).toBeNull();
  });
});

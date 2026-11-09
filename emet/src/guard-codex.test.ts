import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import {
  detectAgentHost,
  evaluateApprovalGate,
  formatCodexPreToolUseOutput,
  handleUserPromptSubmit,
  isAgentWorktreeFor,
  isGitPushCommand,
  normalizeHookInput,
  parseApplyPatchPaths,
} from "./guard-codex";

const GUARD_ENTRY = path.join(import.meta.dir, "guard.ts");
const APPROVE_ENTRY = path.join(import.meta.dir, "approve.ts");
const temporaryDirectories: string[] = [];

function makeRepo(): string {
  const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "guard-codex-")));
  temporaryDirectories.push(directory);
  return directory;
}

function seedRun(repo: string, id: string, options: { approved?: boolean } = {}): string {
  const runsDir = path.join(repo, ".emet", "runs");
  const runDirectory = path.join(runsDir, `spec${id}`);
  mkdirSync(path.join(runDirectory, "draft"), { recursive: true });
  writeFileSync(path.join(runDirectory, "spec.md"), "# spec\n");
  writeFileSync(path.join(runDirectory, "tickets.json"), "[]\n");
  if (options.approved) writeFileSync(path.join(runDirectory, "approval.json"), "{}\n");
  return runsDir;
}

async function runCli(
  entry: string,
  argv: string[],
  stdin: string,
  env: Record<string, string>,
  cwd: string,
): Promise<{ stdout: string; exitCode: number }> {
  const processHandle = Bun.spawn(["bun", entry, ...argv], {
    cwd,
    env: { ...process.env, ...env },
    stdin: new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    processHandle.exited,
  ]);
  return { stdout, exitCode };
}

function hookOutput(text: string | null): {
  keys: string[];
  decision: unknown;
  reason: unknown;
} {
  const parsed: unknown = JSON.parse(text ?? "null");
  if (!isObject(parsed)) throw new Error("hook output is not an object");
  const specific = isObject(parsed.hookSpecificOutput) ? parsed.hookSpecificOutput : {};
  return {
    keys: Object.keys(parsed),
    decision: specific.permissionDecision,
    reason: specific.permissionDecisionReason,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("parseApplyPatchPaths", () => {
  test("lists Add, Update, Delete and Move headers once each", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: a/new.ts",
      "+x",
      "*** Update File: b.ts",
      "*** Move to: c.ts",
      "*** Delete File: d.ts",
      "*** Update File: b.ts",
      "*** End Patch",
    ].join("\n");
    expect(parseApplyPatchPaths(patch)).toEqual(["a/new.ts", "b.ts", "c.ts", "d.ts"]);
  });

  test("returns nothing for text without headers", () => {
    expect(parseApplyPatchPaths("echo hi")).toEqual([]);
  });
});

describe("normalizeHookInput", () => {
  const patchInput = {
    tool_name: "apply_patch",
    cwd: "/w",
    tool_input: { command: "*** Add File: x.ts\n+1" },
  };

  test("adds paths for a Codex apply_patch", () => {
    expect(normalizeHookInput(patchInput, "codex").paths).toEqual(["x.ts"]);
  });

  test("leaves Claude input exactly as before", () => {
    expect(normalizeHookInput(patchInput, "claude")).toEqual(patchInput);
    expect(normalizeHookInput("nope", "claude")).toEqual({});
  });
});

describe("host detection", () => {
  test("EMET_AGENT_HOST=codex selects codex, anything else claude", () => {
    expect(detectAgentHost({ EMET_AGENT_HOST: "codex" })).toBe("codex");
    expect(detectAgentHost({})).toBe("claude");
  });

  test("the worktree predicate follows the host", () => {
    expect(isAgentWorktreeFor("codex", "/r/.emet/worktrees/agent-1")).toBe(true);
    expect(isAgentWorktreeFor("codex", "/r/.claude/worktrees/agent-1")).toBe(false);
    expect(isAgentWorktreeFor("claude", "/r/.claude/worktrees/agent-1")).toBe(true);
  });
});

describe("formatCodexPreToolUseOutput", () => {
  test("a deny has no continue, stopReason or suppressOutput", () => {
    const parsed = hookOutput(formatCodexPreToolUseOutput({ decision: "deny", reason: "r" }));
    expect(parsed.keys).toEqual(["hookSpecificOutput"]);
    expect(parsed.decision).toBe("deny");
    expect(formatCodexPreToolUseOutput({ decision: "allow" })).toBeNull();
  });
});

describe("evaluateApprovalGate", () => {
  test("denies a Bash mutation while unapproved", () => {
    const runsDir = seedRun(makeRepo(), "12");
    expect(
      evaluateApprovalGate({ tool_name: "Bash", tool_input: { command: "touch x" } }, runsDir),
    ).toEqual({ decision: "deny", reason: "not approved: send approve 12" });
  });

  test("allows read-only Bash but not chained commands", () => {
    const runsDir = seedRun(makeRepo(), "12");
    const bash = (command: string) =>
      evaluateApprovalGate({ tool_name: "Bash", tool_input: { command } }, runsDir).decision;
    expect(bash("git status")).toBe("allow");
    expect(bash("ls -la")).toBe("allow");
    expect(bash("ls; touch x")).toBe("deny");
    expect(bash("cat a > b")).toBe("deny");
  });

  test("allows patches under draft and denies everything else", () => {
    const repo = makeRepo();
    const runsDir = seedRun(repo, "12");
    const patch = (file: string) => ({
      tool_name: "apply_patch",
      cwd: repo,
      paths: [file],
    });
    expect(evaluateApprovalGate(patch(".emet/runs/spec12/draft/spec.md"), runsDir).decision).toBe(
      "allow",
    );
    expect(evaluateApprovalGate(patch("src/a.ts"), runsDir).decision).toBe("deny");
    expect(evaluateApprovalGate(patch(".emet/runs/spec12/draft/../x"), runsDir).decision).toBe(
      "deny",
    );
    expect(evaluateApprovalGate({ tool_name: "apply_patch", cwd: repo }, runsDir).decision).toBe(
      "deny",
    );
  });

  test("denies a patch with no parsed paths and read-only commands that execute or write", () => {
    const repo = makeRepo();
    const runsDir = seedRun(repo, "12");
    const bash = (command: string) =>
      evaluateApprovalGate({ tool_name: "Bash", tool_input: { command } }, runsDir).decision;
    expect(evaluateApprovalGate({ tool_name: "apply_patch", paths: [] }, runsDir).decision).toBe(
      "deny",
    );
    expect(bash("rg --pre touch x")).toBe("deny");
    expect(bash("git diff --output=x")).toBe("deny");
    expect(bash("rg needle")).toBe("allow");
  });

  test("allows everything once approved or when no run exists", () => {
    const repo = makeRepo();
    const approved = seedRun(repo, "12", { approved: true });
    const bash = { tool_name: "Bash", tool_input: { command: "touch x" } };
    expect(evaluateApprovalGate(bash, approved).decision).toBe("allow");
    expect(evaluateApprovalGate(bash, path.join(repo, "absent")).decision).toBe("allow");
  });
});

describe("isGitPushCommand", () => {
  const pushes = [
    "git push",
    "git push origin develop",
    "  git   push  ",
    "/usr/bin/git push origin x",
    "git -C wt push origin x",
    "git -C /tmp/w push",
    "git --git-dir=/r/.git push",
    "git --git-dir /r/.git --work-tree /r push",
    "git -c core.sshCommand=ssh push origin x",
    "git -c alias.p=push p origin",
    "git --no-pager -p push",
    "GIT_SSH_COMMAND=x git push",
    "A=1 B='two words' git push",
    "env GIT_TRACE=1 git push",
    "env -i git push",
    "command git push",
    "sudo git push",
    "sudo -u root -E git push",
    "exec git push",
    "nohup git push &",
    "timeout 10 git push",
    "nice -n 5 git push",
    "time git push",
    '"git" push',
    "'git' 'push'",
    "g\\it push",
    "git commit -m x && git push",
    "git commit -m x; git push",
    "git status || git push",
    "echo origin | xargs git push",
    "cd wt\ngit push",
    "(git push)",
    "{ git push; }",
    "if true; then git push; fi",
    "echo $(git push)",
    "echo `git push`",
    "x=$(cd wt && git push origin x)",
    "sh -c 'git push'",
    'bash -lc "cd wt && git -C . push origin x"',
    "zsh -c 'sh -c \"git push\"'",
    "eval 'git push'",
    "git-push origin",
    "git push 'unbalanced",
    "$GIT push",
  ];
  const others = [
    "git pull",
    "git status",
    'git commit -m "push the button"',
    "git commit -m 'git push later'",
    "echo git push",
    'echo "git push"',
    "git log --grep push",
    "git stash push -m wip",
    "rg push src",
    "ls",
    "",
  ];

  for (const command of pushes) {
    test(`detects ${JSON.stringify(command)}`, () => {
      expect(isGitPushCommand(command)).toBe(true);
    });
  }
  for (const command of others) {
    test(`allows ${JSON.stringify(command)}`, () => {
      expect(isGitPushCommand(command)).toBe(false);
    });
  }
});

function bashInput(command: string): { tool_name: string; tool_input: { command: string } } {
  return { tool_name: "Bash", tool_input: { command } };
}

describe("evaluateApprovalGate git push", () => {
  test("denies git push whatever the approval state, allows git pull", () => {
    const repo = makeRepo();
    const approved = seedRun(repo, "12", { approved: true });
    const pending = seedRun(makeRepo(), "13");
    const denied = { decision: "deny", reason: "git push is not allowed" };
    expect(evaluateApprovalGate(bashInput("git -C wt push origin x"), approved)).toEqual(denied);
    expect(evaluateApprovalGate(bashInput("git push"), pending)).toEqual(denied);
    expect(evaluateApprovalGate(bashInput("git push"), path.join(repo, "absent"))).toEqual(denied);
    expect(evaluateApprovalGate(bashInput("git pull"), approved).decision).toBe("allow");
    expect(
      evaluateApprovalGate(bashInput('git commit -m "push the button"'), approved).decision,
    ).toBe("allow");
  });
});

describe("handleUserPromptSubmit", () => {
  test("approve <id> on its own line writes approval.json", () => {
    const runsDir = seedRun(makeRepo(), "12");
    expect(handleUserPromptSubmit({ prompt: "ok\napprove 12\n" }, runsDir)).toEqual({
      approved: true,
    });
    expect(existsSync(path.join(runsDir, "spec12", "approval.json"))).toBe(true);
  });

  test("text that merely contains approve <id> writes nothing", () => {
    const runsDir = seedRun(makeRepo(), "12");
    for (const prompt of ["please approve 12", "approve 12 now", "approve 99", "", "approve  12"]) {
      expect(handleUserPromptSubmit({ prompt }, runsDir).approved).toBe(false);
    }
    expect(handleUserPromptSubmit({ tool_output: "approve 12" }, runsDir).approved).toBe(false);
    expect(existsSync(path.join(runsDir, "spec12", "approval.json"))).toBe(false);
  });

  test("fails closed when the spec or tickets file is missing", () => {
    const runsDir = seedRun(makeRepo(), "12");
    rmSync(path.join(runsDir, "spec12", "tickets.json"));
    expect(handleUserPromptSubmit({ prompt: "approve 12" }, runsDir).approved).toBe(false);
  });
});

describe("emet guard run() through stdin", () => {
  const codexEnv = { EMET_AGENT_HOST: "codex" };

  test("Claude PreToolUse input and output are unchanged", async () => {
    const repo = makeRepo();
    const payload = JSON.stringify({
      tool_name: "Bash",
      cwd: repo,
      tool_input: { command: "git reset --hard" },
    });
    const result = await runCli(GUARD_ENTRY, [], payload, { EMET_AGENT_HOST: "" }, repo);
    expect(hookOutput(result.stdout).decision).toBe("deny");
    const allowed = await runCli(
      GUARD_ENTRY,
      [],
      JSON.stringify({ tool_name: "Bash", cwd: repo, tool_input: { command: "ls" } }),
      { EMET_AGENT_HOST: "" },
      repo,
    );
    expect(allowed.stdout).toBe("");
  });

  test("a Codex apply_patch is checked against surface.json", async () => {
    const repo = makeRepo();
    mkdirSync(path.join(repo, ".emet"), { recursive: true });
    writeFileSync(path.join(repo, ".emet", "surface.json"), '{"surfaces":["src/**"]}');
    const patch = (file: string) =>
      JSON.stringify({
        tool_name: "apply_patch",
        cwd: repo,
        tool_input: { command: `*** Begin Patch\n*** Add File: ${file}\n+x\n*** End Patch` },
      });
    const denied = await runCli(GUARD_ENTRY, [], patch("lib/a.ts"), codexEnv, repo);
    expect(hookOutput(denied.stdout).decision).toBe("deny");
    const allowed = await runCli(GUARD_ENTRY, [], patch("src/a.ts"), codexEnv, repo);
    expect(allowed.stdout).toBe("");
  });

  test("the gate still denies when the hook cwd is a subdirectory of the repo", async () => {
    const repo = makeRepo();
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    seedRun(repo, "12");
    const subdirectory = path.join(repo, "src");
    mkdirSync(subdirectory);
    const bash = JSON.stringify({
      tool_name: "Bash",
      cwd: subdirectory,
      tool_input: { command: "touch x" },
    });
    const closed = await runCli(GUARD_ENTRY, [], bash, codexEnv, subdirectory);
    expect(hookOutput(closed.stdout).reason).toBe("not approved: send approve 12");
  });

  test("a Codex Bash git push is denied through the hook, Claude is untouched", async () => {
    const repo = makeRepo();
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    const push = JSON.stringify({
      tool_name: "Bash",
      cwd: repo,
      tool_input: { command: "git -C wt push origin x" },
    });
    const denied = await runCli(GUARD_ENTRY, [], push, codexEnv, repo);
    expect(hookOutput(denied.stdout).reason).toBe("git push is not allowed");
    const claude = await runCli(GUARD_ENTRY, [], push, { EMET_AGENT_HOST: "" }, repo);
    expect(claude.stdout).toBe("");
  });

  test("the gate denies Bash until a UserPromptSubmit approves", async () => {
    const repo = makeRepo();
    Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
    seedRun(repo, "12");
    const bash = JSON.stringify({
      tool_name: "Bash",
      cwd: repo,
      tool_input: { command: "touch x" },
    });
    const closed = await runCli(GUARD_ENTRY, [], bash, codexEnv, repo);
    expect(hookOutput(closed.stdout).reason).toBe("not approved: send approve 12");

    const toolOutput = JSON.stringify({ cwd: repo, tool_response: "approve 12" });
    await runCli(GUARD_ENTRY, ["--event", "UserPromptSubmit"], toolOutput, codexEnv, repo);
    expect(existsSync(path.join(repo, ".emet", "runs", "spec12", "approval.json"))).toBe(false);

    const prompt = JSON.stringify({ cwd: repo, prompt: "approve 12" });
    await runCli(GUARD_ENTRY, ["--event", "UserPromptSubmit"], prompt, codexEnv, repo);
    expect(existsSync(path.join(repo, ".emet", "runs", "spec12", "approval.json"))).toBe(true);
    const check = await runCli(APPROVE_ENTRY, ["--run", "spec12", "--check"], "", {}, repo);
    expect(check.exitCode).toBe(0);
    const open = await runCli(GUARD_ENTRY, [], bash, codexEnv, repo);
    expect(open.stdout).toBe("");
  });
});

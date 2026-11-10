import { describe, expect, test } from "bun:test";
import type { CommandRunner } from "./agenthost";
import { claudeHost } from "./agenthost-claude";

const FAILING_RUNNER: CommandRunner = () =>
  Promise.resolve({ exitCode: 1, stdout: "", stderr: "bad" });

describe("claudeHost data", () => {
  test("slug replaces separators and dots with dashes", () => {
    expect(claudeHost.sessionSlug("/home/a.b/code/emet")).toBe("-home-a-b-code-emet");
  });

  test("transcript paths live under ~/.claude/projects", () => {
    expect(claudeHost.sessionTranscriptPath("-x", "run1", "/h")).toBe(
      "/h/.claude/projects/-x/run1.jsonl",
    );
    expect(claudeHost.workerTranscriptRoot("/a/b", "/h")).toBe("/h/.claude/projects/-a-b");
    expect(claudeHost.transcriptFormat).toBe("claude-jsonl");
  });

  test("agent worktree predicate and branch mapping", () => {
    expect(claudeHost.isAgentWorktree("/r/.claude/worktrees/agent-1")).toBe(true);
    expect(claudeHost.isAgentWorktree("/r/other")).toBe(false);
    expect(claudeHost.agentIdFromBranch("worktree-agent-abc")).toBe("agent-abc");
    expect(claudeHost.agentIdFromBranch("feature")).toBeUndefined();
  });

  test("probes carry today's literals", () => {
    const { probes } = claudeHost;
    expect(probes.pluginListCommand).toEqual(["claude", "plugin", "list", "--json"]);
    expect(probes.skillsPluginId).toBe("mattpocock-skills@claude-plugins-official");
    expect(probes.pluginRemedy(probes.skillsPluginId)).toBe(
      "claude plugin update mattpocock-skills@claude-plugins-official",
    );
    expect(probes.mcpListCommand).toEqual(["claude", "mcp", "list"]);
    expect(probes.requiredCliFlags).toEqual([
      { command: ["claude", "--help"], flag: "--bg" },
      { command: ["claude", "agents", "--help"], flag: "--json" },
    ]);
    expect(probes.agentsDir("/h")).toBe("/h/.claude/agents");
    expect(probes.settingsFiles("/h", "/p")).toEqual([
      "/h/.claude/settings.json",
      "/p/.claude/settings.local.json",
      "/p/.claude/settings.json",
    ]);
    expect(
      probes.parsePluginList(JSON.stringify([{ id: "a@b", installPath: "/i" }, { id: 1 }])),
    ).toEqual([{ id: "a@b", version: "", enabled: true, installPath: "/i" }]);
    expect(probes.parsePluginList("nope")).toEqual([]);
  });
});

describe("claudeHost sessions", () => {
  test("start issues the claude commands then looks the session up", async () => {
    const calls: string[][] = [];
    const run: CommandRunner = (command) => {
      calls.push([...command]);
      const stdout = command[1] === "agents" ? JSON.stringify([{ id: "i", name: "n" }]) : "";
      return Promise.resolve({ exitCode: 0, stdout, stderr: "" });
    };
    const started = await claudeHost.sessions.start(
      { name: "n", permissionMode: "auto", prompt: "go", cwd: "/r" },
      run,
    );
    expect(started).toEqual({ id: "i", name: "n" });
    expect(calls[0]).toEqual(["claude", "--bg", "--name", "n", "--permission-mode", "auto", "go"]);
    expect(calls[1]).toEqual(["claude", "agents", "--json"]);
    expect(claudeHost.sessions.attachCommand("n")).toBe("claude attach n");
  });

  test("list rejects a non-zero exit", async () => {
    const error = await claudeHost.sessions.list(FAILING_RUNNER).catch((caught: unknown) => caught);
    expect(String(error)).toContain("failed (exit 1): bad");
  });
});

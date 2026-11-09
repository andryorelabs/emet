import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type AgentHost, claudeHost } from "./agenthost";
import { findOrphanedScaffoldBranches } from "./cleanup";
import {
  classifyClaudePluginProbe,
  classifyForgeAgentsProbe,
  createDependencyProbes,
} from "./dependencies";
import { checkExternalCliFlags, createEnvironmentProbes, type EnvironmentProbes } from "./doctor";
import { checkSkillsContract, listInstalledPlugins } from "./skills";
import { isAgentWorktree, isWorktreeAgentBranchLive } from "./worktrees";

const STUB_PLUGIN_ID = "stub-skills@stub-market";

function stubHost(overrides: {
  readonly settingsFiles?: (home?: string, cwd?: string) => string[];
  readonly pluginListCommand?: string[];
  readonly agentsDir?: (home?: string) => string | undefined;
}): AgentHost {
  return {
    ...claudeHost,
    name: "codex",
    worktreeLayout: { agentDirPrefix: "slot-", scaffoldBranchPattern: "^worktree-(slot-.+)$" },
    agentIdFromBranch: (branch) => /^worktree-(slot-.+)$/.exec(branch)?.[1],
    isAgentWorktree: (dir) => dir.includes("/.stub/slots/"),
    probes: {
      pluginListCommand: overrides.pluginListCommand ?? ["stubhost", "plugin", "list"],
      parsePluginList: (stdout) =>
        stdout
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => ({
            id: line.trim(),
            version: "1.0.0",
            enabled: true,
            installPath: "/nowhere",
          })),
      skillsPluginId: STUB_PLUGIN_ID,
      pluginRemedy: (id) => `stubhost plugin add ${id}`,
      mcpListCommand: ["stubhost", "mcp", "list"],
      requiredCliFlags: [
        { command: ["stubhost", "--help"], flag: "--spawn" },
        { command: ["stubhost", "run", "--help"], flag: "--events" },
        { command: ["stubhost", "run", "--help"], flag: "--schema" },
      ],
      agentsDir: overrides.agentsDir ?? ((home = "/h") => path.join(home, ".stub", "agents")),
      settingsFiles: overrides.settingsFiles ?? (() => []),
    },
  };
}

const allFlagsDocumented: EnvironmentProbes = {
  helpText: () => Promise.resolve("--spawn --events --schema --json --add-label --remove-label"),
  ghRepoNameWithOwner: () => Promise.resolve(null),
  remoteUrl: () => Promise.resolve(null),
  resolveRef: () => Promise.resolve(null),
  worktreeBaseRef: () => Promise.resolve(null),
};

describe("doctor CLI flags through the host", () => {
  test("a host stub's flags replace the Claude flags", async () => {
    const commands: string[] = [];
    const findings = await checkExternalCliFlags(
      {
        ...allFlagsDocumented,
        helpText: (command) => {
          commands.push(command.join(" "));
          return Promise.resolve(
            command.join(" ") === "stubhost run --help" ? "--events" : "--spawn --json",
          );
        },
      },
      { requireGh: false, host: stubHost({}) },
    );
    expect(commands).toEqual(["stubhost --help", "stubhost run --help"]);
    expect(findings).toEqual([
      "stubhost run no longer documents --schema in --help — emet relies on it",
    ]);
  });

  test("Claude stays the default host", async () => {
    const commands: string[] = [];
    await checkExternalCliFlags(
      {
        ...allFlagsDocumented,
        helpText: (command) => {
          commands.push(command.join(" "));
          return Promise.resolve("--bg --json");
        },
      },
      { requireGh: false },
    );
    expect(commands).toEqual(["claude --help", "claude agents --help"]);
  });
});

describe("plugin probe remedy through the host", () => {
  test("Claude keeps its marketplace remedy and enable hint", () => {
    expect(classifyClaudePluginProbe({ kind: "listed", status: "missing" }).remedy).toEqual([
      "claude plugin marketplace add anthropics/claude-plugins-official",
      "claude plugin install mattpocock-skills@claude-plugins-official",
    ]);
    expect(classifyClaudePluginProbe({ kind: "listed", status: "disabled" }).summary).toContain(
      "`claude plugin enable mattpocock-skills@claude-plugins-official`",
    );
  });

  test("a stub host supplies the remedy, binary and plugin id", () => {
    const host = stubHost({});
    const missing = classifyClaudePluginProbe({ kind: "listed", status: "missing" }, host);
    expect(missing.status).toBe("unsatisfied");
    expect(missing.remedy).toEqual([`stubhost plugin add ${STUB_PLUGIN_ID}`]);
    expect(
      classifyClaudePluginProbe({ kind: "listed", status: "disabled" }, host).summary,
    ).toContain(`\`stubhost plugin enable ${STUB_PLUGIN_ID}\``);
    expect(classifyClaudePluginProbe({ kind: "claude-not-on-path" }, host).summary).toContain(
      "`stubhost` binary",
    );
    expect(
      classifyClaudePluginProbe({ kind: "claude-failed", detail: "exit code 2" }, host).summary,
    ).toContain("`stubhost plugin list` failed");
  });

  test("the skills contract remedy comes from the host", () => {
    const host = stubHost({});
    const root = mkdtempSync(path.join(os.tmpdir(), "emet-wiring-"));
    try {
      const plugins = [
        { id: "mattpocock-skills@stub", version: "1.0.0", enabled: true, installPath: root },
      ];
      const checks = checkSkillsContract(plugins, host);
      expect(checks.find((check) => check.status === "unsatisfied")?.remedy).toEqual([
        `stubhost plugin add ${STUB_PLUGIN_ID}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("plugin list and agents directory through the host", () => {
  test("listInstalledPlugins runs the host's command and parser", () => {
    const host = stubHost({ pluginListCommand: ["printf", "one@m\\ntwo@m\\n"] });
    expect(listInstalledPlugins(host).map((plugin) => plugin.id)).toEqual(["one@m", "two@m"]);
  });

  test("listInstalledPlugins yields an empty list for a missing binary", () => {
    expect(listInstalledPlugins(stubHost({ pluginListCommand: ["no-such-binary-emet"] }))).toEqual(
      [],
    );
  });

  test("the agents directory comes from the host", () => {
    const check = classifyForgeAgentsProbe(
      { kind: "missing", missing: ["emet-worker"] },
      stubHost({}),
    );
    expect(check.summary).toContain("~/.stub/agents/ is missing emet-worker");
    expect(
      classifyForgeAgentsProbe({ kind: "missing", missing: ["emet-worker"] }).summary,
    ).toContain("~/.claude/agents/ is missing emet-worker");
  });

  test("a host without an agents directory has no forge-agents requirement", async () => {
    const probes = createDependencyProbes(stubHost({ agentsDir: () => undefined }));
    expect(await probes.forgeAgents()).toEqual({ kind: "present" });
  });
});

describe("settings files and baseRef through the host", () => {
  test("repo settings win over user settings regardless of host order", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "emet-wiring-"));
    try {
      const repo = path.join(root, "repo");
      const home = path.join(root, "home");
      mkdirSync(path.join(repo, ".stub"), { recursive: true });
      mkdirSync(path.join(home, ".stub"), { recursive: true });
      writeFileSync(path.join(home, ".stub", "settings.json"), '{"worktree":{"baseRef":"user"}}');
      writeFileSync(path.join(repo, ".stub", "settings.json"), '{"worktree":{"baseRef":"repo"}}');
      const host = stubHost({
        settingsFiles: (_home, cwd = repo) => [
          path.join(home, ".stub", "settings.json"),
          path.join(cwd, ".stub", "settings.json"),
        ],
      });
      expect(await createEnvironmentProbes(host).worktreeBaseRef(repo)).toBe("repo");
      rmSync(path.join(repo, ".stub", "settings.json"));
      expect(await createEnvironmentProbes(host).worktreeBaseRef(repo)).toBe("user");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("no settings file means no baseRef", async () => {
    expect(await createEnvironmentProbes(stubHost({})).worktreeBaseRef("/nonexistent")).toBeNull();
  });
});

describe("worktree layout through the host", () => {
  test("scaffold liveness and orphan detection follow the host's branch mapping", () => {
    const host = stubHost({});
    const live = new Set(["slot-1"]);
    expect(isWorktreeAgentBranchLive("worktree-slot-1", live, host)).toBe(true);
    expect(isWorktreeAgentBranchLive("worktree-slot-2", live, host)).toBe(false);
    const orphans = findOrphanedScaffoldBranches(
      [
        { name: "worktree-slot-1", worktreePath: "" },
        { name: "worktree-slot-2", worktreePath: "" },
      ],
      [],
      live,
      host,
    );
    expect(orphans).toEqual(["worktree-slot-2"]);
    expect(isAgentWorktree("/r/.stub/slots/slot-1", host)).toBe(true);
    expect(isAgentWorktree("/r/.claude/worktrees/agent-1", host)).toBe(false);
  });

  test("Claude remains the default for orphan detection", () => {
    expect(
      findOrphanedScaffoldBranches(
        [{ name: "worktree-agent-9", worktreePath: "" }],
        [],
        new Set<string>(),
      ),
    ).toEqual(["worktree-agent-9"]);
  });
});

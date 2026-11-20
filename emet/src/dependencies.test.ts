import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeHost, type PluginInfo } from "./agenthost";
import { codexHost } from "./agenthost-codex";
import { DEFAULT_FORGE_CONFIG } from "./config";
import {
  type TicketNode,
  analyzeTicketGraph,
  formatTicketGraphJson,
  AGENT_NAMES,
  agentHostOfConfig,
  agentPluginInstallPaths,
  MATTPOCOCK_SKILLS_PLUGIN_ID,
  checkDependencies,
  createDependencyProbes,
  classifyClaudePluginProbe,
  AGENT_BROWSER_INSTALL_REMEDY,
  classifyAgentBrowser,
  classifyEngram,
  ENGRAM_INSTALL_REMEDY,
  classifyForgeAgentsProbe,
  classifyGithubCliProbe,
  classifyLinearMcpProbe,
  findLinearMcpEntry,
  formatDependencyCheck,
  indeterminateChecks,
  mcpListMentionsLinear,
  parsePluginListOutput,
  probeForgeAgents,
  probeGithubCli,
  probeLinearMcpServer,
  unsatisfiedChecks,
  type ClaudePluginProbe,
  type DependencyProbes,
  type ForgeAgentsProbe,
  type GithubCliProbe,
  type LinearMcpProbe,
} from "./dependencies";
import type { InstalledPlugin } from "./skills";

const PLUGIN_ID = MATTPOCOCK_SKILLS_PLUGIN_ID;

function stubProbes(overrides: {
  readonly claudePlugin?: ClaudePluginProbe;
  readonly githubCli?: GithubCliProbe;
  readonly linearMcpServer?: LinearMcpProbe;
  readonly forgeAgents?: ForgeAgentsProbe;
}): DependencyProbes {
  return {
    claudePlugin: () =>
      Promise.resolve(overrides.claudePlugin ?? { kind: "listed", status: "installed" }),
    githubCli: () => Promise.resolve(overrides.githubCli ?? { kind: "authenticated" }),
    linearMcpServer: () =>
      Promise.resolve(overrides.linearMcpServer ?? { kind: "declared", source: "mcp-json" }),
    forgeAgents: () => Promise.resolve(overrides.forgeAgents ?? { kind: "present" }),
  };
}

describe("parsePluginListOutput", () => {
  test("missing when the plugin is absent from the listing", () => {
    const output = [
      "Installed plugins:",
      "",
      "  ❯ cloudflare@cloudflare",
      "    Version: 1.0.0",
      "    Status: ✔ enabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("missing");
  });

  test("installed when the plugin is listed as enabled", () => {
    const output = [
      "Installed plugins:",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Version: 1.2.3",
      "    Scope: user",
      "    Status: ✔ enabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("installed");
  });

  test("disabled when the plugin is listed as disabled", () => {
    const output = [
      "Installed plugins:",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Version: 1.2.3",
      "    Status: disabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("disabled");
  });

  test("a different disabled plugin does not produce a false positive", () => {
    const output = [
      "Installed plugins:",
      "",
      "  ❯ some-other-plugin@marketplace",
      "    Status: disabled",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Status: ✔ enabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("installed");
  });

  test("installed when a later scope enables what the first scope disabled", () => {
    const output = [
      "Installed plugins:",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Scope: project",
      "    Status: disabled",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Scope: user",
      "    Status: ✔ enabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("installed");
  });

  test("disabled only when every scope listing it is disabled", () => {
    const output = [
      `  ❯ ${PLUGIN_ID}`,
      "    Scope: project",
      "    Status: disabled",
      "",
      `  ❯ ${PLUGIN_ID}`,
      "    Scope: user",
      "    Status: disabled",
      "",
    ].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("disabled");
  });

  test("an id that merely ends with the plugin id does not match", () => {
    const output = [`  ❯ vendored-${PLUGIN_ID}`, "    Status: ✔ enabled", ""].join("\n");
    expect(parsePluginListOutput(output, PLUGIN_ID)).toBe("missing");
  });

  test("missing on empty output", () => {
    expect(parsePluginListOutput("", PLUGIN_ID)).toBe("missing");
  });
});

describe("classifyEngram", () => {
  const pluginInstalled = { kind: "listed", status: "installed" } as const;

  test("both binary and plugin present is satisfied and prints nothing", () => {
    const check = classifyEngram({ binary: true, plugin: pluginInstalled });
    expect(check.status).toBe("satisfied");
  });

  test("neither present is one indeterminate note with the install remedy", () => {
    const check = classifyEngram({ binary: false, plugin: { kind: "listed", status: "missing" } });
    expect(check.status).toBe("indeterminate");
    expect(check.remedy).toEqual(ENGRAM_INSTALL_REMEDY);
    expect(check.summary).toContain("binary");
    expect(check.summary).toContain("engram@engram");
  });

  test("only the plugin missing names just the plugin", () => {
    const check = classifyEngram({ binary: true, plugin: { kind: "listed", status: "disabled" } });
    expect(check.status).toBe("indeterminate");
    expect(check.summary).not.toContain("binary is not on PATH");
  });

  test("an unverifiable plugin list is never unsatisfied", () => {
    const check = classifyEngram({ binary: false, plugin: { kind: "claude-not-on-path" } });
    expect(check.status).toBe("indeterminate");
  });
});

describe("classifyClaudePluginProbe", () => {
  test("a missing plugin is unsatisfied — it really is not there", () => {
    const check = classifyClaudePluginProbe({ kind: "listed", status: "missing" });
    expect(check.status).toBe("unsatisfied");
    expect(check.remedy).toEqual([
      "claude plugin marketplace add anthropics/claude-plugins-official",
      `claude plugin install ${PLUGIN_ID}`,
    ]);
  });

  test("a disabled plugin is unsatisfied", () => {
    expect(classifyClaudePluginProbe({ kind: "listed", status: "disabled" }).status).toBe(
      "unsatisfied",
    );
  });

  test("an installed plugin is satisfied", () => {
    expect(classifyClaudePluginProbe({ kind: "listed", status: "installed" }).status).toBe(
      "satisfied",
    );
  });

  test("claude not on PATH is indeterminate, never unsatisfied", () => {
    const check = classifyClaudePluginProbe({ kind: "claude-not-on-path" });
    expect(check.status).toBe("indeterminate");
    expect(check.summary).toContain("could not verify");
  });

  test("a failed claude invocation is indeterminate", () => {
    expect(classifyClaudePluginProbe({ kind: "claude-failed", detail: "exit code 1" }).status).toBe(
      "indeterminate",
    );
  });
});

describe("classifyForgeAgentsProbe", () => {
  test("present is satisfied", () => {
    expect(classifyForgeAgentsProbe({ kind: "present" }).status).toBe("satisfied");
  });

  test("missing is unsatisfied and names the missing agents plus the fix", () => {
    const check = classifyForgeAgentsProbe({ kind: "missing", missing: ["emet-reviewer"] });
    expect(check.status).toBe("unsatisfied");
    expect(check.summary).toContain("emet-reviewer");
    expect(check.remedy).toEqual(["./install.sh"]);
  });
});

describe("probeForgeAgents", () => {
  test("present when both agent files exist", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "forge-agents-"));
    try {
      for (const name of AGENT_NAMES) {
        writeFileSync(path.join(directory, `${name}.md`), "");
      }
      expect(probeForgeAgents(directory)).toEqual({ kind: "present" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("missing lists every agent file that is absent", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "forge-agents-"));
    try {
      expect(probeForgeAgents(directory)).toEqual({
        kind: "missing",
        missing: [...AGENT_NAMES],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("probeForgeAgents with a forge plugin", () => {
  test("present when the plugin ships both agents", () => {
    const agents = mkdtempSync(path.join(os.tmpdir(), "forge-agents-"));
    const plugin = mkdtempSync(path.join(os.tmpdir(), "forge-plugin-"));
    try {
      mkdirSync(path.join(plugin, "agents"));
      for (const name of AGENT_NAMES) {
        writeFileSync(path.join(plugin, "agents", `${name}.md`), "");
      }
      expect(probeForgeAgents(agents, [plugin])).toEqual({ kind: "present" });
    } finally {
      rmSync(agents, { recursive: true, force: true });
      rmSync(plugin, { recursive: true, force: true });
    }
  });

  test("present when a legacy forge install ships the legacy agent names", () => {
    const agents = mkdtempSync(path.join(os.tmpdir(), "forge-agents-"));
    try {
      for (const name of ["forge-worker", "forge-reviewer"]) {
        writeFileSync(path.join(agents, `${name}.md`), "");
      }
      expect(probeForgeAgents(agents)).toEqual({ kind: "present" });
    } finally {
      rmSync(agents, { recursive: true, force: true });
    }
  });
});

function installed(id: string, installPath: string): InstalledPlugin {
  return { id, version: "1.0.0", enabled: true, installPath };
}

describe("agentPluginInstallPaths", () => {
  test("names the emet plugin's install path", () => {
    expect(agentPluginInstallPaths([installed("emet@emet-marketplace", "/plugins/emet")])).toEqual([
      "/plugins/emet",
    ]);
  });

  test("falls back to a legacy forge plugin when emet is absent", () => {
    expect(
      agentPluginInstallPaths([installed("forge@forge-marketplace", "/plugins/forge")]),
    ).toEqual(["/plugins/forge"]);
  });

  test("prefers the emet plugin over a legacy forge plugin", () => {
    expect(
      agentPluginInstallPaths([
        installed("forge@forge-marketplace", "/plugins/forge"),
        installed("emet@emet-marketplace", "/plugins/emet"),
      ]),
    ).toEqual(["/plugins/emet"]);
  });

  test("is empty when neither plugin is installed", () => {
    expect(agentPluginInstallPaths([installed("other@x", "/plugins/other")])).toEqual([]);
  });
});

test("AGENT_NAMES are the emet agents", () => {
  expect(AGENT_NAMES).toEqual(["emet-worker", "emet-reviewer"]);
});

describe("classifyGithubCliProbe", () => {
  test("authenticated is satisfied", () => {
    expect(classifyGithubCliProbe({ kind: "authenticated" }).status).toBe("satisfied");
  });

  test("not on PATH is unsatisfied and names the install page", () => {
    const check = classifyGithubCliProbe({ kind: "not-on-path" });
    expect(check.status).toBe("unsatisfied");
    expect(check.summary).toContain("https://cli.github.com");
  });

  test("unauthenticated is unsatisfied and names gh auth login", () => {
    const check = classifyGithubCliProbe({ kind: "unauthenticated" });
    expect(check.status).toBe("unsatisfied");
    expect(check.summary).toContain("gh auth login");
  });

  test("a timed-out probe is indeterminate, so no network never blocks dispatch", () => {
    expect(classifyGithubCliProbe({ kind: "timed-out" }).status).toBe("indeterminate");
  });
});

describe("classifyLinearMcpProbe", () => {
  test("a declared server is satisfied but states the auth limitation", () => {
    const check = classifyLinearMcpProbe({ kind: "declared", source: "mcp-json" });
    expect(check.status).toBe("satisfied");
    expect(check.limitation).toContain("not that the connection is authenticated");
  });

  test("a malformed entry is unsatisfied", () => {
    const check = classifyLinearMcpProbe({ kind: "entry-malformed", serverKey: "linear-server" });
    expect(check.status).toBe("unsatisfied");
    expect(check.summary).toContain("linear-server");
  });

  test("not declared anywhere is unsatisfied", () => {
    expect(classifyLinearMcpProbe({ kind: "not-declared", searchedAllScopes: true }).status).toBe(
      "unsatisfied",
    );
  });

  test("not declared but user scopes unchecked is indeterminate", () => {
    expect(classifyLinearMcpProbe({ kind: "not-declared", searchedAllScopes: false }).status).toBe(
      "indeterminate",
    );
  });

  test("an unreadable .mcp.json is unsatisfied", () => {
    expect(
      classifyLinearMcpProbe({ kind: "mcp-json-unreadable", detail: "Unexpected token" }).status,
    ).toBe("unsatisfied");
  });

  test("the Claude host keeps its restart and `claude mcp list` wording", () => {
    const declared = classifyLinearMcpProbe({ kind: "declared", source: "mcp-json" }, claudeHost);
    expect(declared.limitation).toContain("restart Claude Code and approve the connection");
    const missing = classifyLinearMcpProbe(
      { kind: "not-declared", searchedAllScopes: true },
      claudeHost,
    );
    expect(missing.summary).toContain("`claude mcp list`");
    const unchecked = classifyLinearMcpProbe(
      { kind: "not-declared", searchedAllScopes: false },
      claudeHost,
    );
    expect(unchecked.summary).toContain("`claude` is not on PATH");
  });

  test("the Codex host never mentions claude", () => {
    const probes: readonly LinearMcpProbe[] = [
      { kind: "declared", source: "mcp-json" },
      { kind: "not-declared", searchedAllScopes: true },
      { kind: "not-declared", searchedAllScopes: false },
    ];
    for (const probe of probes) {
      const check = classifyLinearMcpProbe(probe, codexHost);
      expect(`${check.summary} ${check.limitation ?? ""}`.toLowerCase()).not.toContain("claude");
    }
    const declared = classifyLinearMcpProbe({ kind: "declared", source: "mcp-json" }, codexHost);
    expect(declared.limitation).toContain("Codex");
    const unchecked = classifyLinearMcpProbe(
      { kind: "not-declared", searchedAllScopes: false },
      codexHost,
    );
    expect(unchecked.status).toBe("indeterminate");
    expect(unchecked.summary).toContain("Codex");
  });
});

describe("findLinearMcpEntry", () => {
  test("matches on the server key", () => {
    const parsed = { mcpServers: { "linear-server": { command: "npx", args: [] } } };
    expect(findLinearMcpEntry(parsed)).toEqual({ kind: "well-formed", serverKey: "linear-server" });
  });

  test("matches on args when the key does not mention linear", () => {
    const parsed = {
      mcpServers: {
        tickets: { command: "npx", args: ["mcp-remote", "https://mcp.linear.app/sse"] },
      },
    };
    expect(findLinearMcpEntry(parsed).kind).toBe("well-formed");
  });

  test("accepts a remote entry declared with type and url", () => {
    const parsed = { mcpServers: { tickets: { type: "http", url: "https://mcp.linear.app/mcp" } } };
    expect(findLinearMcpEntry(parsed).kind).toBe("well-formed");
  });

  test("a matching entry with neither command nor type+url is malformed", () => {
    const parsed = { mcpServers: { "linear-server": {} } };
    expect(findLinearMcpEntry(parsed)).toEqual({ kind: "malformed", serverKey: "linear-server" });
  });

  test("absent when no server mentions linear", () => {
    const parsed = { mcpServers: { github: { command: "gh" } } };
    expect(findLinearMcpEntry(parsed).kind).toBe("absent");
  });

  test("absent when mcpServers is missing or the document is not an object", () => {
    expect(findLinearMcpEntry({}).kind).toBe("absent");
    expect(findLinearMcpEntry(null).kind).toBe("absent");
    expect(findLinearMcpEntry("nope").kind).toBe("absent");
  });
});

describe("mcpListMentionsLinear", () => {
  test("true when the listing names a linear server", () => {
    expect(
      mcpListMentionsLinear("linear-server: https://mcp.linear.app/sse (HTTP) - ✓ Connected"),
    ).toBe(true);
  });

  test("false for an unrelated listing", () => {
    expect(mcpListMentionsLinear("github: gh (stdio) - ✓ Connected")).toBe(false);
  });
});

describe("probeLinearMcpServer", () => {
  test("reports a malformed entry from a real .mcp.json", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "forge-deps-"));
    try {
      writeFileSync(
        path.join(directory, ".mcp.json"),
        JSON.stringify({ mcpServers: { "linear-server": {} } }),
      );
      expect(await probeLinearMcpServer(directory)).toEqual({
        kind: "entry-malformed",
        serverKey: "linear-server",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("reports unreadable JSON rather than throwing", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "forge-deps-"));
    try {
      writeFileSync(path.join(directory, ".mcp.json"), "{ not json");
      const probe = await probeLinearMcpServer(directory);
      expect(probe.kind).toBe("mcp-json-unreadable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("declares the server when the entry is well-formed", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "forge-deps-"));
    try {
      writeFileSync(
        path.join(directory, ".mcp.json"),
        JSON.stringify({ mcpServers: { "linear-server": { command: "npx", args: [] } } }),
      );
      expect(await probeLinearMcpServer(directory)).toEqual({
        kind: "declared",
        source: "mcp-json",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("formatDependencyCheck", () => {
  test("reproduces the exact missing-plugin text init has always printed", () => {
    const check = classifyClaudePluginProbe({ kind: "listed", status: "missing" });
    expect(formatDependencyCheck(check, "      ")).toBe(
      "mattpocock-skills plugin not found — /emet's interview/spec/ticket phases (1-5) need it. Run:\n" +
        "      claude plugin marketplace add anthropics/claude-plugins-official\n" +
        "      claude plugin install mattpocock-skills@claude-plugins-official",
    );
  });

  test("reproduces the exact disabled-plugin text", () => {
    const check = classifyClaudePluginProbe({ kind: "listed", status: "disabled" });
    expect(formatDependencyCheck(check, "      ")).toBe(
      "mattpocock-skills plugin is installed but disabled — run " +
        "`claude plugin enable mattpocock-skills@claude-plugins-official`.",
    );
  });

  test("reproduces the exact gh texts", () => {
    expect(formatDependencyCheck(classifyGithubCliProbe({ kind: "not-on-path" }), "      ")).toBe(
      "gh CLI not found on PATH — required for every tracker (PRs always use it). Install: https://cli.github.com",
    );
    expect(
      formatDependencyCheck(classifyGithubCliProbe({ kind: "unauthenticated" }), "      "),
    ).toBe("gh CLI found but not authenticated — run `gh auth login` before dispatching a wave.");
  });

  test("indents every remedy line with the caller-supplied indent", () => {
    const check = classifyClaudePluginProbe({ kind: "listed", status: "missing" });
    expect(formatDependencyCheck(check, "  ")).toBe(
      "mattpocock-skills plugin not found — /emet's interview/spec/ticket phases (1-5) need it. Run:\n" +
        "  claude plugin marketplace add anthropics/claude-plugins-official\n" +
        "  claude plugin install mattpocock-skills@claude-plugins-official",
    );
  });
});

describe("checkDependencies", () => {
  test("always checks the plugin, whatever the tracker", async () => {
    for (const tracker of ["github", "linear", "local"] as const) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const checks = await checkDependencies({
        tracker,
        repoRoot: "/tmp",
        probes: stubProbes({}),
      });
      expect(checks.some((check) => check.dependency === "claude-plugin")).toBe(true);
    }
  });

  test("checks gh for every tracker kind", async () => {
    const github = await checkDependencies({
      tracker: "github",
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "unauthenticated" } }),
    });
    expect(unsatisfiedChecks(github).map((check) => check.dependency)).toEqual(["github-cli"]);

    const local = await checkDependencies({
      tracker: "local",
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "unauthenticated" } }),
    });
    expect(unsatisfiedChecks(local).map((check) => check.dependency)).toEqual(["github-cli"]);
  });

  test("skips gh for a local tracker with merge landing", async () => {
    const local = await checkDependencies({
      tracker: "local",
      landingMode: "merge",
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "not-on-path" } }),
    });
    expect(local.some((check) => check.dependency === "github-cli")).toBe(false);
    expect(unsatisfiedChecks(local)).toEqual([]);
  });

  test("still checks gh for a github tracker with merge landing", async () => {
    const github = await checkDependencies({
      tracker: "github",
      landingMode: "merge",
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "not-on-path" } }),
    });
    expect(unsatisfiedChecks(github).map((check) => check.dependency)).toEqual(["github-cli"]);
  });

  test("checks gh for a local tracker with pr landing", async () => {
    const local = await checkDependencies({
      tracker: "local",
      landingMode: "pr",
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "not-on-path" } }),
    });
    expect(unsatisfiedChecks(local).map((check) => check.dependency)).toEqual(["github-cli"]);
  });

  test("checks Linear only for a linear tracker", async () => {
    const linear = await checkDependencies({
      tracker: "linear",
      repoRoot: "/tmp",
      probes: stubProbes({ linearMcpServer: { kind: "not-declared", searchedAllScopes: true } }),
    });
    expect(unsatisfiedChecks(linear).map((check) => check.dependency)).toEqual([
      "linear-mcp-server",
    ]);

    const github = await checkDependencies({
      tracker: "github",
      repoRoot: "/tmp",
      probes: stubProbes({ linearMcpServer: { kind: "not-declared", searchedAllScopes: true } }),
    });
    expect(github.some((check) => check.dependency === "linear-mcp-server")).toBe(false);
  });

  test("an undeclared tracker.kind skips tracker checks and says so", async () => {
    const checks = await checkDependencies({
      tracker: null,
      repoRoot: "/tmp",
      probes: stubProbes({ githubCli: { kind: "not-on-path" } }),
    });
    expect(checks.map((check) => check.dependency)).toEqual([
      "claude-plugin",
      "forge-agents",
      "tracker-kind",
    ]);
    expect(indeterminateChecks(checks).map((check) => check.dependency)).toEqual(["tracker-kind"]);
    expect(unsatisfiedChecks(checks)).toEqual([]);
  });

  test("a healthy github repo produces nothing to act on", async () => {
    const checks = await checkDependencies({
      tracker: "github",
      repoRoot: "/tmp",
      probes: stubProbes({}),
    });
    expect(unsatisfiedChecks(checks)).toEqual([]);
    expect(indeterminateChecks(checks)).toEqual([]);
  });

  test("claude off PATH leaves a github repo blockable only by gh", async () => {
    const checks = await checkDependencies({
      tracker: "github",
      repoRoot: "/tmp",
      probes: stubProbes({
        claudePlugin: { kind: "claude-not-on-path" },
        githubCli: { kind: "unauthenticated" },
      }),
    });
    expect(unsatisfiedChecks(checks).map((check) => check.dependency)).toEqual(["github-cli"]);
    expect(indeterminateChecks(checks).map((check) => check.dependency)).toEqual(["claude-plugin"]);
  });
});

const ticket = (id: string, overrides: Partial<TicketNode> = {}): TicketNode => ({
  id,
  status: "todo",
  priority: 3,
  createdAt: "2026-01-01T00:00:00Z",
  blockedBy: [],
  ...overrides,
});

describe("analyzeTicketGraph", () => {
  test("a cancelled or dropped blocker still blocks", () => {
    for (const status of ["cancelled", "dropped"] as const) {
      const result = analyzeTicketGraph([
        ticket("A", { status }),
        ticket("B", { blockedBy: ["A"] }),
      ]);
      expect(result.ready.map((node) => node.id)).not.toContain("B");
      expect(result.blocked).toEqual([{ id: "B", blockers: ["A"] }]);
    }
  });

  test("a done blocker releases its dependent", () => {
    const result = analyzeTicketGraph([
      ticket("A", { status: "done" }),
      ticket("B", { blockedBy: ["A"] }),
    ]);
    expect(result.ready.map((node) => node.id)).toEqual(["B"]);
  });

  test("an unknown blocker id blocks", () => {
    const result = analyzeTicketGraph([ticket("B", { blockedBy: ["GHOST"] })]);
    expect(result.blocked).toEqual([{ id: "B", blockers: ["GHOST"] }]);
  });

  test("detects a cycle and reports its path with exit code 1", () => {
    const result = analyzeTicketGraph([
      ticket("A", { blockedBy: ["C"] }),
      ticket("B", { blockedBy: ["A"] }),
      ticket("C", { blockedBy: ["B"] }),
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.cycle).toEqual(["A", "C", "B", "A"]);
    expect(result.ready).toEqual([]);
  });

  test("orders ready set by critical path, then priority, then created", () => {
    const result = analyzeTicketGraph([
      ticket("lone-urgent", { priority: 1 }),
      ticket("root", { priority: 4 }),
      ticket("mid", { blockedBy: ["root"] }),
      ticket("leaf", { blockedBy: ["mid"] }),
      ticket("lone-old", { priority: 2, createdAt: "2025-01-01T00:00:00Z" }),
      ticket("lone-new", { priority: 2, createdAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.ready.map((node) => node.id)).toEqual([
      "root",
      "lone-urgent",
      "lone-old",
      "lone-new",
    ]);
  });

  test("formats a stable JSON document", () => {
    const result = analyzeTicketGraph([ticket("A"), ticket("B", { blockedBy: ["A"] })]);
    expect(JSON.parse(formatTicketGraphJson(result))).toEqual({
      exitCode: 0,
      cycle: null,
      ready: ["A"],
      blocked: [{ id: "B", blockers: ["A"] }],
    });
  });
});

function hostWithProbes(overrides: Partial<(typeof claudeHost)["probes"]>): typeof claudeHost {
  return { ...claudeHost, probes: { ...claudeHost.probes, ...overrides } };
}

async function statusFor(command: string, parsed: PluginInfo[]): Promise<ClaudePluginProbe> {
  return createDependencyProbes(
    hostWithProbes({
      pluginListCommand: [command, "plugin", "list"],
      parsePluginList: () => parsed,
    }),
  ).claudePlugin();
}

function pluginInfo(id: string, enabled: boolean): PluginInfo {
  return { id, version: "1.0.0", enabled, installPath: "/unused" };
}

describe("probes that shell out", () => {
  let binDirectory = "";
  let fakeCli = "";
  const brokenInterpreter = "#!/nonexistent/interpreter\n";

  function installFakeBinary(name: string, body: string): void {
    writeFileSync(path.join(binDirectory, path.basename(name)), `#!/bin/sh\n${body}\n`, {
      mode: 0o755,
    });
  }

  function pluginHost(parsed?: PluginInfo[]): typeof claudeHost {
    return hostWithProbes({
      pluginListCommand: [fakeCli, "plugin", "list"],
      ...(parsed === undefined ? {} : { parsePluginList: () => parsed }),
    });
  }

  beforeEach(() => {
    binDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-fakebin-"));
    fakeCli = path.join(binDirectory, "emet-fake-cli");
  });

  afterEach(() => {
    rmSync(binDirectory, { recursive: true, force: true });
  });

  test("claude plugin probe reports a missing binary", async () => {
    const host = hostWithProbes({ pluginListCommand: ["emet-no-such-cli", "plugin", "list"] });
    expect(await createDependencyProbes(host).claudePlugin()).toEqual({
      kind: "claude-not-on-path",
    });
  });

  test("claude plugin probe parses a text listing and memoizes the result", async () => {
    installFakeBinary(
      path.basename(fakeCli),
      `printf '  ❯ ${PLUGIN_ID}\\n    Status: ✔ enabled\\n'`,
    );
    const probes = createDependencyProbes(pluginHost());
    const first = await probes.claudePlugin();
    expect(first).toEqual({ kind: "listed", status: "installed" });
    expect(await probes.claudePlugin()).toBe(first);
  });

  test("claude plugin probe reads a JSON listing through the host parser", async () => {
    installFakeBinary(path.basename(fakeCli), "echo '[]'");
    const id = claudeHost.probes.skillsPluginId;
    expect(await statusFor(fakeCli, [pluginInfo("other", true)])).toEqual({
      kind: "listed",
      status: "missing",
    });
    expect(await statusFor(fakeCli, [pluginInfo(id, true)])).toEqual({
      kind: "listed",
      status: "installed",
    });
    expect(await statusFor(fakeCli, [pluginInfo(id, false)])).toEqual({
      kind: "listed",
      status: "disabled",
    });
  });

  test("claude plugin probe reports a non-zero exit code", async () => {
    installFakeBinary(path.basename(fakeCli), "exit 3");
    expect(await createDependencyProbes(pluginHost()).claudePlugin()).toEqual({
      kind: "claude-failed",
      detail: "exit code 3",
    });
  });

  test("claude plugin probe reports a binary that cannot be spawned", async () => {
    writeFileSync(fakeCli, brokenInterpreter, { mode: 0o755 });
    const probe = await createDependencyProbes(pluginHost()).claudePlugin();
    expect(probe.kind).toBe("claude-failed");
  });

  test("claude plugin probe reports a timeout", async () => {
    installFakeBinary(path.basename(fakeCli), "exec sleep 30");
    expect(await createDependencyProbes(pluginHost()).claudePlugin()).toEqual({
      kind: "claude-failed",
      detail: "timed out after 5000ms",
    });
  }, 20_000);

  test("gh probe maps absent, authenticated, unauthenticated and spawn failure", async () => {
    const binary = path.join(binDirectory, "gh");
    expect(await probeGithubCli("emet-no-such-cli")).toEqual({ kind: "not-on-path" });
    installFakeBinary("gh", "exit 0");
    expect(await probeGithubCli(binary)).toEqual({ kind: "authenticated" });
    installFakeBinary("gh", "exit 1");
    expect(await probeGithubCli(binary)).toEqual({ kind: "unauthenticated" });
    writeFileSync(binary, brokenInterpreter, { mode: 0o755 });
    expect(await probeGithubCli(binary)).toEqual({ kind: "not-on-path" });
  });

  test("gh probe reports a timeout", async () => {
    installFakeBinary("gh", "exec sleep 30");
    expect(await probeGithubCli(path.join(binDirectory, "gh"))).toEqual({ kind: "timed-out" });
  }, 20_000);

  test("linear probe falls back to the host mcp list", async () => {
    const repo = mkdtempSync(path.join(os.tmpdir(), "emet-deps-repo-"));
    try {
      expect(await probeLinearMcpServer(repo, codexHost)).toEqual({
        kind: "not-declared",
        searchedAllScopes: false,
      });
      const missingBinaryHost = hostWithProbes({ mcpListCommand: ["emet-no-such-cli", "mcp"] });
      expect(await probeLinearMcpServer(repo, missingBinaryHost)).toEqual({
        kind: "not-declared",
        searchedAllScopes: false,
      });
      const host = hostWithProbes({ mcpListCommand: [fakeCli, "mcp", "list"] });
      installFakeBinary(path.basename(fakeCli), "exit 2");
      expect(await probeLinearMcpServer(repo, host)).toEqual({
        kind: "not-declared",
        searchedAllScopes: false,
      });
      installFakeBinary(path.basename(fakeCli), "echo 'other-server: https://example.com'");
      expect(await probeLinearMcpServer(repo, host)).toEqual({
        kind: "not-declared",
        searchedAllScopes: true,
      });
      installFakeBinary(path.basename(fakeCli), "echo 'linear-server: https://mcp.linear.app/mcp'");
      expect(await createDependencyProbes(host).linearMcpServer(repo)).toEqual({
        kind: "declared",
        source: "claude-mcp-list",
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("agents probe is satisfied for a host without an agents directory", async () => {
    const host = hostWithProbes({ agentsDir: () => undefined });
    expect(await createDependencyProbes(host).forgeAgents()).toEqual({ kind: "present" });
  });

  test("agents probe looks in the host agents directory and memoizes", async () => {
    const agentsDirectory = path.join(binDirectory, "agents");
    mkdirSync(agentsDirectory);
    installFakeBinary(path.basename(fakeCli), "exit 0");
    const probes = createDependencyProbes(
      hostWithProbes({ agentsDir: () => agentsDirectory, pluginListCommand: [fakeCli] }),
    );
    const probe = await probes.forgeAgents();
    expect(probe.kind).toBe("missing");
    expect(await probes.forgeAgents()).toBe(probe);
  });
});

describe("host selection and remedies", () => {
  test("agentHostOfConfig defaults to claude and honours an explicit host", () => {
    expect(agentHostOfConfig(DEFAULT_FORGE_CONFIG).name).toBe("claude");
    expect(agentHostOfConfig({ ...DEFAULT_FORGE_CONFIG, agentHost: "codex" }).name).toBe("codex");
  });

  test("a non-claude host installs the plugin through its own remedy", () => {
    const check = classifyClaudePluginProbe({ kind: "listed", status: "missing" }, codexHost);
    expect(check.remedy).toEqual([codexHost.probes.pluginRemedy(codexHost.probes.skillsPluginId)]);
  });

  test("the skills contract probe is memoized per probe set", () => {
    const probes = createDependencyProbes({
      ...claudeHost,
      probes: { ...claudeHost.probes, pluginListCommand: ["true"] },
    });
    const first = probes.skillsContract?.();
    expect(first).toBeDefined();
    expect(probes.skillsContract?.()).toBe(first);
  });
});

describe("classifyAgentBrowser", () => {
  test("a missing binary is an indeterminate optional note with the install remedy", () => {
    const check = classifyAgentBrowser({ binary: false, doctor: { kind: "skipped" } });
    expect(check.status).toBe("indeterminate");
    expect(check.summary).toStartWith("optional:");
    expect(check.summary).toContain("agent-browser");
    expect(check.remedy).toEqual(AGENT_BROWSER_INSTALL_REMEDY);
  });

  test("a failing agent-browser doctor is an indeterminate warning, never unsatisfied", () => {
    const check = classifyAgentBrowser({
      binary: true,
      doctor: { kind: "failed", detail: "exit code 2" },
    });
    expect(check.status).toBe("indeterminate");
    expect(check.summary).toStartWith("warning:");
    expect(check.summary).toContain("exit code 2");
  });

  test("a healthy binary is satisfied", () => {
    expect(classifyAgentBrowser({ binary: true, doctor: { kind: "ok" } }).status).toBe("satisfied");
  });
});

describe("createDependencyProbes agentBrowser", () => {
  let binDirectory: string;
  let savedPath: string | undefined;
  let spawnSpy: Mock<typeof Bun.spawn> | undefined;

  beforeEach(() => {
    binDirectory = mkdtempSync(path.join(os.tmpdir(), "forge-agent-browser-"));
    savedPath = process.env.PATH;
    process.env.PATH = binDirectory;
  });

  afterEach(() => {
    spawnSpy?.mockRestore();
    spawnSpy = undefined;
    if (savedPath === undefined) Reflect.deleteProperty(process.env, "PATH");
    else process.env.PATH = savedPath;
    rmSync(binDirectory, { recursive: true, force: true });
  });

  function installAgentBrowser(script: string): void {
    const file = path.join(binDirectory, "agent-browser");
    writeFileSync(file, script);
    chmodSync(file, 0o755);
  }

  test("a missing binary skips the doctor run", async () => {
    expect(await createDependencyProbes().agentBrowser?.()).toEqual({
      binary: false,
      doctor: { kind: "skipped" },
    });
  });

  function stubSpawn(exitCode: number | null): void {
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a minimal Subprocess stand-in
      (() => ({
        stdout: new Response("").body,
        exited: Promise.resolve(exitCode),
        exitCode,
      })) as unknown as typeof Bun.spawn,
    );
  }

  test("a doctor run that exits 0 is ok", async () => {
    installAgentBrowser("#!/bin/sh\nexit 0\n");
    stubSpawn(0);
    expect(await createDependencyProbes().agentBrowser?.()).toEqual({
      binary: true,
      doctor: { kind: "ok" },
    });
  });

  test("a doctor run that exits non-zero is a failure naming the exit code", async () => {
    installAgentBrowser("#!/bin/sh\nexit 3\n");
    stubSpawn(3);
    expect(await createDependencyProbes().agentBrowser?.()).toEqual({
      binary: true,
      doctor: { kind: "failed", detail: "exit code 3" },
    });
  });

  test("a binary that cannot be spawned is a failure carrying the spawn error", async () => {
    installAgentBrowser("#!/bin/sh\nexit 0\n");
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("spawn exploded");
    });
    expect(await createDependencyProbes().agentBrowser?.()).toEqual({
      binary: true,
      doctor: { kind: "failed", detail: "spawn exploded" },
    });
  });

  test("a doctor run killed by the timeout is reported as timed out", async () => {
    installAgentBrowser("#!/bin/sh\nexit 0\n");
    stubSpawn(null);
    expect(await createDependencyProbes().agentBrowser?.()).toEqual({
      binary: true,
      doctor: { kind: "failed", detail: "timed out after 5000ms" },
    });
  });

  test("the probe result is memoized per probe set", async () => {
    installAgentBrowser("#!/bin/sh\nexit 0\n");
    stubSpawn(0);
    const probes = createDependencyProbes();
    expect(await probes.agentBrowser?.()).toBe(await probes.agentBrowser?.());
  });
});

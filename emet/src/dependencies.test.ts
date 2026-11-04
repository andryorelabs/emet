import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type TicketNode,
  analyzeTicketGraph,
  formatTicketGraphJson,
  AGENT_NAMES,
  agentPluginInstallPaths,
  MATTPOCOCK_SKILLS_PLUGIN_ID,
  checkDependencies,
  classifyClaudePluginProbe,
  classifyForgeAgentsProbe,
  classifyGithubCliProbe,
  classifyLinearMcpProbe,
  findLinearMcpEntry,
  formatDependencyCheck,
  indeterminateChecks,
  mcpListMentionsLinear,
  parsePluginListOutput,
  probeForgeAgents,
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
      "mattpocock-skills plugin not found — /forge's interview/spec/ticket phases (1-5) need it. Run:\n" +
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
      "mattpocock-skills plugin not found — /forge's interview/spec/ticket phases (1-5) need it. Run:\n" +
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

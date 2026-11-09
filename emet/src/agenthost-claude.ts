import os from "node:os";
import path from "node:path";
import { isObject } from "./narrow";
import type {
  AgentHost,
  CommandRunner,
  PluginInfo,
  SessionInfo,
  StartSessionRequest,
} from "./agenthost";

const SKILLS_PLUGIN_ID = "mattpocock-skills@claude-plugins-official";
const SCAFFOLD_BRANCH_PATTERN = "^worktree-(agent-.+)$";

function sessionSlug(cwd: string): string {
  return cwd.replaceAll(/[/.]/g, "-");
}

function parseSessionRows(stdout: string): SessionInfo[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new TypeError("`claude agents --json` did not return an array");
  }
  const rows: unknown[] = parsed;
  return rows.map((row): SessionInfo => {
    if (!isObject(row)) return { id: null, name: null };
    const { id, name } = row;
    return {
      id: typeof id === "string" ? id : null,
      name: typeof name === "string" ? name : null,
    };
  });
}

async function listSessions(run: CommandRunner): Promise<SessionInfo[]> {
  const result = await run(["claude", "agents", "--json"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `\`claude agents --json\` failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return parseSessionRows(result.stdout);
}

async function startSession(
  request: StartSessionRequest,
  run: CommandRunner,
): Promise<SessionInfo> {
  const launched = await run(
    [
      "claude",
      "--bg",
      "--name",
      request.name,
      "--permission-mode",
      request.permissionMode,
      request.prompt,
    ],
    { cwd: request.cwd },
  );
  if (launched.exitCode !== 0) {
    throw new Error(
      `\`claude --bg\` failed (exit ${launched.exitCode}): ${(launched.stderr || launched.stdout).trim()}`,
    );
  }
  const started = (await listSessions(run)).find((row) => row.name === request.name);
  if (!started) {
    throw new Error(
      `\`claude --bg\` exited 0 but no session named ${request.name} appears in \`claude agents --json\`.`,
    );
  }
  return started;
}

function parsePluginList(stdout: string): PluginInfo[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const plugins: PluginInfo[] = [];
  for (const entry of parsed) {
    if (!isObject(entry)) continue;
    const { id, version, enabled, installPath } = entry;
    if (typeof id !== "string" || typeof installPath !== "string") continue;
    plugins.push({
      id,
      version: typeof version === "string" ? version : "",
      enabled: enabled !== false,
      installPath,
    });
  }
  return plugins;
}

export const claudeHost: AgentHost = {
  name: "claude",
  anchorProcessName: "claude",
  sessionSlug,
  sessionTranscriptPath: (slug, runId, home = os.homedir()) =>
    path.join(home, ".claude", "projects", slug, `${runId}.jsonl`),
  workerTranscriptRoot: (cwd, home = os.homedir()) =>
    path.join(home, ".claude", "projects", sessionSlug(cwd)),
  workerTranscriptGlob: "*.jsonl",
  transcriptFormat: "claude-jsonl",
  isAgentWorktree: (dir) => dir.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`),
  worktreeLayout: {
    agentDirPrefix: "agent-",
    scaffoldBranchPattern: SCAFFOLD_BRANCH_PATTERN,
  },
  agentIdFromBranch: (branch) => new RegExp(SCAFFOLD_BRANCH_PATTERN).exec(branch)?.[1],
  sessions: {
    list: listSessions,
    start: startSession,
    attachCommand: (name) => `claude attach ${name}`,
  },
  probes: {
    pluginListCommand: ["claude", "plugin", "list", "--json"],
    parsePluginList,
    skillsPluginId: SKILLS_PLUGIN_ID,
    pluginRemedy: (id) => `claude plugin update ${id}`,
    mcpListCommand: ["claude", "mcp", "list"],
    requiredCliFlags: [
      { command: ["claude", "--help"], flag: "--bg" },
      { command: ["claude", "agents", "--help"], flag: "--json" },
    ],
    agentsDir: (home = os.homedir()) => path.join(home, ".claude", "agents"),
    settingsFiles: (home = os.homedir(), cwd = process.cwd()) => [
      path.join(home, ".claude", "settings.json"),
      path.join(cwd, ".claude", "settings.local.json"),
      path.join(cwd, ".claude", "settings.json"),
    ],
  },
};

import path from "node:path";
import type { AgentHost, HostRegistry, PluginInfo } from "./agenthost";

const SKILLS_PLUGIN_ID = "mattpocock-skills@mattpocock";
const SCAFFOLD_BRANCH_PATTERN = "^worktree-(agent-.+)$";
const PLUGIN_ROW_PATTERN = /^(\S+@\S+)\s+(.+?)\s{2,}(\S+)(?:\s{2,}|$)/;
const VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)/;

/** The marketplace install commands that provide the skills plugin, in order. */
export const CODEX_SKILLS_INSTALL_COMMANDS: readonly string[] = [
  "codex plugin marketplace add mattpocock/skills",
  "codex plugin add mattpocock-skills@mattpocock",
];

function sessionSlug(cwd: string): string {
  return cwd.replaceAll(/[/.]/g, "-");
}

function runRoot(home: string | undefined): string {
  return path.join(home ?? process.cwd(), ".emet", "runs");
}

/** Extracts `major.minor.patch` from `codex --version` output, or `undefined`. */
export function parseCodexVersion(stdout: string): string | undefined {
  return VERSION_PATTERN.exec(stdout)?.[0];
}

/** True when `version` is at least `minimum`, comparing numerically per segment. */
export function isCodexVersionAtLeast(version: string, minimum: string): boolean {
  const have = VERSION_PATTERN.exec(version)?.slice(1).map(Number);
  const need = VERSION_PATTERN.exec(minimum)?.slice(1).map(Number);
  if (have === undefined || need === undefined) return false;
  for (const [index, wanted] of need.entries()) {
    const actual = have[index] ?? 0;
    if (actual !== wanted) return actual > wanted;
  }
  return true;
}

/**
 * Parses the `codex plugin list` table (`unverified` format: rows of
 * `<name>@<marketplace>  <status>  <version>  <source>`; installed unless the
 * status says `not installed`).
 */
export function parseCodexPluginList(stdout: string): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  for (const line of stdout.split("\n")) {
    const match = PLUGIN_ROW_PATTERN.exec(line.trim());
    if (match === null) continue;
    const [, id = "", status = "", version = ""] = match;
    const lowered = status.toLowerCase();
    if (lowered.includes("not installed")) continue;
    plugins.push({
      id,
      version,
      enabled: !lowered.includes("disabled"),
      installPath: "",
    });
  }
  return plugins;
}

function notImplemented(): never {
  throw new Error("codex host: not implemented");
}

export const codexHost: AgentHost = {
  name: "codex",
  anchorProcessName: "codex",
  sessionSlug,
  sessionTranscriptPath: (slug, runId, home) =>
    path.join(runRoot(home), runId, "codex", `${slug}.jsonl`),
  workerTranscriptRoot: (_cwd, home) => runRoot(home),
  workerTranscriptGlob: "*/codex/*.jsonl",
  transcriptFormat: "codex-jsonl",
  isAgentWorktree: (dir) => dir.includes(`${path.sep}.emet${path.sep}worktrees${path.sep}agent-`),
  worktreeLayout: {
    agentDirPrefix: "agent-",
    scaffoldBranchPattern: SCAFFOLD_BRANCH_PATTERN,
  },
  agentIdFromBranch: (branch) => new RegExp(SCAFFOLD_BRANCH_PATTERN).exec(branch)?.[1],
  sessions: {
    list: () => Promise.resolve().then(notImplemented),
    start: () => Promise.resolve().then(notImplemented),
    attachCommand: (name) => `codex exec resume ${name}`,
  },
  probes: {
    pluginListCommand: ["codex", "plugin", "list"],
    parsePluginList: parseCodexPluginList,
    skillsPluginId: SKILLS_PLUGIN_ID,
    pluginRemedy: () => CODEX_SKILLS_INSTALL_COMMANDS.join(" && "),
    requiredCliFlags: [
      { command: ["codex", "exec", "--help"], flag: "--json" },
      { command: ["codex", "exec", "--help"], flag: "--output-schema" },
    ],
    agentsDir: () => undefined,
    settingsFiles: () => [],
  },
};

/** Registers the Codex adapter so `resolveAgentHost("codex")` returns it. */
export function registerCodexHost(registry: HostRegistry): void {
  registry.codex = codexHost;
}

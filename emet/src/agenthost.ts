import { claudeHost } from "./agenthost-claude";
import { codexHost } from "./agenthost-codex";

/**
 * The Agent host seam: the product a run executes in. An adapter holds only
 * data and small command builders (commands, ids, paths, patterns, tags); the
 * consuming modules keep their own logic. No adapter imports `usage.ts`,
 * `metrics.ts`, `skills.ts` or `dependencies.ts`, so the seam adds no import
 * cycles.
 */

export type AgentHostName = "claude" | "codex";

export type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandRunner = (
  command: readonly string[],
  options?: { readonly cwd?: string },
) => Promise<CommandResult>;

export type SessionInfo = {
  readonly id: string | null;
  readonly name: string | null;
};

export type StartSessionRequest = {
  readonly name: string;
  readonly permissionMode: string;
  readonly prompt: string;
  readonly cwd: string;
};

export type PluginInfo = {
  readonly id: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly installPath: string;
};

type TranscriptFormat = "claude-jsonl" | "codex-jsonl";

export interface AgentHost {
  readonly name: AgentHostName;
  /** The process name of the host's own process, the run's liveness anchor. */
  readonly anchorProcessName: string;
  /** The persisted session slug of a working directory (claims, slots, lock reasons). */
  sessionSlug(cwd: string): string;
  /** The coordinator transcript file of a run. */
  sessionTranscriptPath(slug: string, runId: string, home?: string): string;
  /** The directory that holds a working directory's worker transcripts. */
  workerTranscriptRoot(cwd: string, home?: string): string;
  /** Glob, relative to {@link AgentHost.workerTranscriptRoot}, matching worker transcripts. */
  readonly workerTranscriptGlob: string;
  readonly transcriptFormat: TranscriptFormat;
  isAgentWorktree(dir: string): boolean;
  readonly worktreeLayout: {
    /** Directory-name prefix of an agent worktree (`agent-<id>`). */
    readonly agentDirPrefix: string;
    /** Regular expression source matching a scaffold branch; group 1 is the agent directory name. */
    readonly scaffoldBranchPattern: string;
  };
  /** The agent worktree directory name a scaffold branch maps to, if it is one. */
  agentIdFromBranch(branch: string): string | undefined;
  readonly sessions: {
    list(run: CommandRunner): Promise<SessionInfo[]>;
    start(request: StartSessionRequest, run: CommandRunner): Promise<SessionInfo>;
    attachCommand(name: string): string;
  };
  readonly probes: {
    readonly pluginListCommand: string[];
    parsePluginList(stdout: string): PluginInfo[];
    readonly skillsPluginId: string;
    pluginRemedy(id: string): string;
    readonly mcpListCommand?: string[];
    readonly requiredCliFlags: Array<{ command: string[]; flag: string }>;
    agentsDir(home?: string): string | undefined;
    settingsFiles(home?: string, cwd?: string): string[];
  };
}

export type HostRegistry = Partial<Record<AgentHostName, AgentHost>>;

/** Every shipped adapter; Claude stays the default host a config selects. */
const DEFAULT_REGISTRY: HostRegistry = { claude: claudeHost, codex: codexHost };

/** Throws `unknown agent host` for a name with no registered adapter. */
export function resolveAgentHost(
  name: AgentHostName,
  registry: HostRegistry = DEFAULT_REGISTRY,
): AgentHost {
  const host = registry[name];
  if (host === undefined) throw new Error(`unknown agent host: ${name}`);
  return host;
}

export { claudeHost };

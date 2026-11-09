import { optionalProperty } from "./optional";
import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  resolveAgentHostName,
  resolveCodexConfig,
  resolveRepoRoot,
  type ForgeConfig,
  type HandoffLauncher,
} from "./config";
import { claudeHost } from "./agenthost-claude";
import { registerCodexHost } from "./agenthost-codex";
import {
  resolveAgentHost,
  type AgentHost,
  type CommandResult,
  type CommandRunner,
  type HostRegistry,
} from "./agenthost";
import { errorMessage, isObject } from "./narrow";
import { BINARY, LEGACY_PRODUCT, PRODUCT } from "./names";
import { writePhase } from "./phase";

/**
 * Launches one wave of a run as a background `claude --bg` session and, per
 * `handoff.launcher`, opens an Orca tab attached to it.
 *
 * This is a CLI command rather than prose in `reference/phases-9-handoff.md`
 * because the prose version failed twice in the field:
 *
 * - A wave launched by hand ("run it in another session") had no written
 *   procedure at all — the Orca step lived only in Phase 9's autoChain
 *   branch — so the coordinator improvised a bare `claude --bg` and never
 *   opened a tab.
 * - Inside autoChain the launching session is itself a `claude --bg`
 *   session, whose environment has no `TERM_PROGRAM`. The documented
 *   `launcher: auto` gate (`TERM_PROGRAM == Orca`) was therefore false on
 *   every chained launch, and none of them opened a tab.
 *
 * Orca is detected by asking the runtime (`orca status --json`), never by
 * looking at the environment, for exactly that reason.
 */

export type { CommandResult, CommandRunner };

export type LaunchRequest = {
  readonly specId: string;
  readonly wave: number;
  readonly repoRoot: string;
  readonly launcher: HandoffLauncher;
  readonly permissionMode: string;
};

type OrcaTabOutcome = {
  readonly opened: boolean;
  readonly reason: string;
};

export type LaunchOutcome = {
  readonly name: string;
  readonly id: string | null;
  readonly attach: string;
  readonly orcaTab: OrcaTabOutcome;
};

type AgentRow = { readonly id?: string | null; readonly name?: string | null };

const LAUNCH_TIMEOUT_MS = 15_000;

const defaultRunner: CommandRunner = async (command, options) => {
  try {
    const child = Bun.spawn([...command], {
      ...optionalProperty("cwd", options?.cwd),
      stdout: "pipe",
      stderr: "pipe",
      timeout: LAUNCH_TIMEOUT_MS,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { exitCode, stdout, stderr };
  } catch (error: unknown) {
    return { exitCode: 127, stdout: "", stderr: errorMessage(error) };
  }
};

export function waveSessionName(specId: string, wave: number): string {
  return `${PRODUCT}-${specId}-w${wave}`;
}

/**
 * `claude agents --json` lists sessions of every project, and a name can
 * outlive its process, so a "live" `emet-<spec-id>-*` (or legacy `forge-<spec-id>-*`) session is any row
 * carrying that name prefix. Sessions of an earlier or the same wave are
 * ignored so wave n can launch wave n+1 from inside its own session; a
 * session whose wave cannot be read still blocks.
 */
function findBlockingSessions(rows: readonly AgentRow[], specId: string, wave: number): string[] {
  const prefixes = [PRODUCT, LEGACY_PRODUCT].map((product) => `${product}-${specId}-`);
  return rows
    .map((row) => row.name ?? "")
    .flatMap((name) => {
      const prefix = prefixes.find((candidate) => name.startsWith(candidate));
      return prefix === undefined ? [] : [{ name, prefix }];
    })
    .filter(({ name, prefix }) => {
      const match = /^w(\d+)$/.exec(name.slice(prefix.length));
      return !match || Number(match[1]) >= wave;
    })
    .map(({ name }) => name);
}

/**
 * Whether to try opening an Orca tab. `orca` forces the attempt, `bg` never
 * does, and `auto` asks the Orca runtime itself — `TERM_PROGRAM` is absent
 * in `claude --bg` sessions, so it cannot be the gate.
 */
async function shouldOpenOrcaTab(
  launcher: HandoffLauncher,
  runner: CommandRunner,
): Promise<{ readonly attempt: boolean; readonly reason: string }> {
  if (launcher === "bg") {
    return { attempt: false, reason: 'handoff.launcher is "bg"' };
  }
  if (launcher === "orca") {
    return { attempt: true, reason: 'handoff.launcher is "orca"' };
  }
  const status = await runner(["orca", "status", "--json"]);
  if (status.exitCode !== 0) {
    return {
      attempt: false,
      reason: `orca CLI unavailable (exit ${status.exitCode})`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(status.stdout);
    const result = isObject(parsed) ? parsed.result : undefined;
    const runtime = isObject(result) ? result.runtime : undefined;
    const reachable = isObject(runtime) ? runtime.reachable : undefined;
    return reachable === true
      ? { attempt: true, reason: "orca runtime reachable" }
      : { attempt: false, reason: "orca runtime not reachable" };
  } catch {
    return { attempt: false, reason: "orca status output was not JSON" };
  }
}

/**
 * `orca terminal create` reports `surface: "background"` plus a "could not
 * make it discoverable" warning for tabs that do render and run their
 * command, so only `ok` decides success here.
 *
 * The tab's command runs inside `bash -c` with the absolute `claude` path:
 * Orca rewrites a typed command that invokes `claude` (bare or by path) to
 * inject `--plugin-dir` ahead of the subcommand, which turns `attach <name>`
 * into a prompt.
 */
async function openOrcaTab(
  request: LaunchRequest,
  name: string,
  runner: CommandRunner,
  host: AgentHost,
): Promise<OrcaTabOutcome> {
  const result = await runner([
    "orca",
    "terminal",
    "create",
    "--worktree",
    `path:${request.repoRoot}`,
    "--title",
    name,
    "--command",
    `bash -c '${host.sessions.attachCommand(name).replace(/^claude(?= )/, Bun.which("claude") ?? "claude")}'`,
    "--json",
  ]);
  if (result.exitCode !== 0) {
    return {
      opened: false,
      reason: `orca terminal create failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    return isObject(parsed) && parsed.ok === true
      ? { opened: true, reason: "orca tab created" }
      : { opened: false, reason: "orca terminal create returned ok=false" };
  } catch {
    return { opened: false, reason: "orca terminal create output was not JSON" };
  }
}

export async function launchWave(
  request: LaunchRequest,
  runner: CommandRunner = defaultRunner,
  host: AgentHost = claudeHost,
): Promise<LaunchOutcome> {
  const name = waveSessionName(request.specId, request.wave);

  const existing = findBlockingSessions(
    await host.sessions.list(runner),
    request.specId,
    request.wave,
  );
  if (existing.length > 0) {
    throw new ForgeConfigError(
      `${BINARY} launch: a session for spec ${request.specId} already exists (${existing.join(", ")}) — not launching a second one.`,
    );
  }

  let started;
  try {
    started = await host.sessions.start(
      {
        name,
        permissionMode: request.permissionMode,
        prompt: `/${BINARY}:run --dispatch ${request.specId}`,
        cwd: request.repoRoot,
      },
      runner,
    );
  } catch (error: unknown) {
    throw new Error(`${BINARY} launch: ${errorMessage(error)}`, { cause: error });
  }

  writePhase(request.repoRoot, {
    phase: "dispatch",
    wave: request.wave,
    spec: request.specId,
    runId: null,
  });

  const decision = await shouldOpenOrcaTab(request.launcher, runner);
  const orcaTab = decision.attempt
    ? await openOrcaTab(request, name, runner, host)
    : { opened: false, reason: `skipped: ${decision.reason}` };

  return { name, id: started.id ?? null, attach: host.sessions.attachCommand(name), orcaTab };
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

/**
 * Resolves the Agent host and its launch settings from the repo config. On the
 * Codex host no Orca tab is opened and the permission mode is `codex.sandbox`,
 * `danger-full-access` unless the repo configures `workspace-write`.
 */
export function launchSettingsFor(config: ForgeConfig): {
  host: AgentHost;
  launcher: HandoffLauncher;
  permissionMode: string;
} {
  const registry: HostRegistry = { claude: claudeHost };
  registerCodexHost(registry);
  const hostName = resolveAgentHostName(config);
  const host = resolveAgentHost(hostName, registry);
  return hostName === "codex"
    ? { host, launcher: "bg", permissionMode: resolveCodexConfig(config).sandbox }
    : { host, launcher: config.handoff.launcher, permissionMode: config.handoff.permissionMode };
}

const USAGE = `usage: ${BINARY} launch <spec-id> --wave <n>`;

export async function run(argv: string[]): Promise<void> {
  try {
    if (argv.length === 0 || argv.includes("--help")) {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }

    const specId = argv[0];
    const waveRaw = readFlagValue(argv, "--wave");
    const wave = Number(waveRaw);
    if (!specId || specId.startsWith("--") || !Number.isInteger(wave) || wave < 1) {
      throw new ForgeConfigError(`${BINARY} launch: ${USAGE}`);
    }

    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError(`${BINARY} launch: not inside a git repository`);
    }
    const { config } = await loadForgeConfigWithDefaults(repoRoot);

    const settings = launchSettingsFor(config);
    const outcome = await launchWave(
      {
        specId,
        wave,
        repoRoot,
        launcher: settings.launcher,
        permissionMode: settings.permissionMode,
      },
      defaultRunner,
      settings.host,
    );
    console.log(JSON.stringify(outcome));
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type HandoffLauncher,
  type HandoffPermissionMode,
} from './config'

/**
 * Launches one wave of a run as a background `claude --bg` session and, per
 * `handoff.launcher`, opens an Orca tab attached to it.
 *
 * This is a CLI command rather than prose in `reference/phases-6-9.md`
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

export type CommandResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type CommandRunner = (
  command: readonly string[],
  options?: { readonly cwd?: string },
) => Promise<CommandResult>

export type LaunchRequest = {
  readonly specId: string
  readonly wave: number
  readonly repoRoot: string
  readonly launcher: HandoffLauncher
  readonly permissionMode: HandoffPermissionMode
}

export type OrcaTabOutcome = {
  readonly opened: boolean
  readonly reason: string
}

export type LaunchOutcome = {
  readonly name: string
  readonly id: string | null
  readonly attach: string
  readonly orcaTab: OrcaTabOutcome
}

type AgentRow = { readonly id?: string | null; readonly name?: string | null }

const LAUNCH_TIMEOUT_MS = 15_000

export const defaultRunner: CommandRunner = async (command, options) => {
  try {
    const child = Bun.spawn([...command], {
      cwd: options?.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: LAUNCH_TIMEOUT_MS,
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { exitCode, stdout, stderr }
  } catch (error: unknown) {
    return { exitCode: 127, stdout: '', stderr: (error as Error).message }
  }
}

export function waveSessionName(specId: string, wave: number): string {
  return `forge-${specId}-w${wave}`
}

function parseAgentRows(stdout: string): AgentRow[] {
  const parsed: unknown = JSON.parse(stdout)
  if (!Array.isArray(parsed)) {
    throw new Error('`claude agents --json` did not return an array')
  }
  return parsed as AgentRow[]
}

async function listAgents(runner: CommandRunner): Promise<AgentRow[]> {
  const result = await runner(['claude', 'agents', '--json'])
  if (result.exitCode !== 0) {
    throw new Error(
      `\`claude agents --json\` failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    )
  }
  return parseAgentRows(result.stdout)
}

/**
 * `claude agents --json` lists sessions of every project, and a name can
 * outlive its process, so a "live" `forge-<spec-id>-*` session is any row
 * carrying that name prefix. Sessions of an earlier or the same wave are
 * ignored so wave n can launch wave n+1 from inside its own session; a
 * session whose wave cannot be read still blocks.
 */
function findBlockingSessions(
  rows: readonly AgentRow[],
  specId: string,
  wave: number,
): string[] {
  const prefix = `forge-${specId}-`
  return rows
    .map((row) => row.name ?? '')
    .filter((name) => name.startsWith(prefix))
    .filter((name) => {
      const match = /^w(\d+)$/.exec(name.slice(prefix.length))
      return !match || Number(match[1]) >= wave
    })
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
  if (launcher === 'bg') {
    return { attempt: false, reason: 'handoff.launcher is "bg"' }
  }
  if (launcher === 'orca') {
    return { attempt: true, reason: 'handoff.launcher is "orca"' }
  }
  const status = await runner(['orca', 'status', '--json'])
  if (status.exitCode !== 0) {
    return {
      attempt: false,
      reason: `orca CLI unavailable (exit ${status.exitCode})`,
    }
  }
  try {
    const parsed = JSON.parse(status.stdout) as {
      result?: { runtime?: { reachable?: unknown } }
    }
    return parsed.result?.runtime?.reachable === true
      ? { attempt: true, reason: 'orca runtime reachable' }
      : { attempt: false, reason: 'orca runtime not reachable' }
  } catch {
    return { attempt: false, reason: 'orca status output was not JSON' }
  }
}

/**
 * `orca terminal create` reports `surface: "background"` plus a "could not
 * make it discoverable" warning for tabs that do render and run their
 * command, so only `ok` decides success here.
 *
 * The tab's command uses the absolute `claude` path: Orca rewrites a typed
 * command that starts with the bare word `claude` to inject `--plugin-dir`
 * ahead of the subcommand, which turns `attach <name>` into a prompt.
 */
async function openOrcaTab(
  request: LaunchRequest,
  name: string,
  runner: CommandRunner,
): Promise<OrcaTabOutcome> {
  const result = await runner([
    'orca',
    'terminal',
    'create',
    '--worktree',
    `path:${request.repoRoot}`,
    '--title',
    name,
    '--command',
    `${Bun.which('claude') ?? 'claude'} attach ${name}`,
    '--json',
  ])
  if (result.exitCode !== 0) {
    return {
      opened: false,
      reason: `orca terminal create failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
    }
  }
  try {
    const parsed = JSON.parse(result.stdout) as { ok?: unknown }
    return parsed.ok === true
      ? { opened: true, reason: 'orca tab created' }
      : { opened: false, reason: 'orca terminal create returned ok=false' }
  } catch {
    return { opened: false, reason: 'orca terminal create output was not JSON' }
  }
}

export async function launchWave(
  request: LaunchRequest,
  runner: CommandRunner = defaultRunner,
): Promise<LaunchOutcome> {
  const name = waveSessionName(request.specId, request.wave)

  const existing = findBlockingSessions(
    await listAgents(runner),
    request.specId,
    request.wave,
  )
  if (existing.length > 0) {
    throw new ForgeConfigError(
      `forge launch: a session for spec ${request.specId} already exists (${existing.join(', ')}) — not launching a second one.`,
    )
  }

  const launched = await runner(
    [
      'claude',
      '--bg',
      '--name',
      name,
      '--permission-mode',
      request.permissionMode,
      `/forge --dispatch ${request.specId}`,
    ],
    { cwd: request.repoRoot },
  )
  if (launched.exitCode !== 0) {
    throw new Error(
      `forge launch: \`claude --bg\` failed (exit ${launched.exitCode}): ${(launched.stderr || launched.stdout).trim()}`,
    )
  }

  const started = (await listAgents(runner)).find((row) => row.name === name)
  if (!started) {
    throw new Error(
      `forge launch: \`claude --bg\` exited 0 but no session named ${name} appears in \`claude agents --json\`.`,
    )
  }

  const decision = await shouldOpenOrcaTab(request.launcher, runner)
  const orcaTab = decision.attempt
    ? await openOrcaTab(request, name, runner)
    : { opened: false, reason: `skipped: ${decision.reason}` }

  return { name, id: started.id ?? null, attach: `claude attach ${name}`, orcaTab }
}

function readFlagValue(
  argv: readonly string[],
  flag: string,
): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  return argv[index + 1]
}

const USAGE = 'usage: forge launch <spec-id> --wave <n>'

export async function run(argv: string[]): Promise<void> {
  try {
    if (argv.length === 0 || argv.includes('--help')) {
      console.error(USAGE)
      process.exitCode = 2
      return
    }

    const specId = argv[0]
    const waveRaw = readFlagValue(argv, '--wave')
    const wave = Number(waveRaw)
    if (!specId || specId.startsWith('--') || !Number.isInteger(wave) || wave < 1) {
      throw new ForgeConfigError(`forge launch: ${USAGE}`)
    }

    const repoRoot = await resolveRepoRoot()
    if (!repoRoot) {
      throw new ForgeConfigError('forge launch: not inside a git repository')
    }
    const { config } = await loadForgeConfigWithDefaults(repoRoot)

    const outcome = await launchWave({
      specId,
      wave,
      repoRoot,
      launcher: config.handoff.launcher,
      permissionMode: config.handoff.permissionMode,
    })
    console.log(JSON.stringify(outcome))
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message)
      process.exitCode = 2
      return
    }
    console.error((error as Error).message)
    process.exitCode = 1
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2))
}

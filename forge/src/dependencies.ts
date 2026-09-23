import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { TrackerKind } from './config'

/**
 * The third-party tools `/forge` needs, and how far this CLI will go about
 * them.
 *
 * What forge can safely automate stops at *checking*. The check itself is
 * read-only, but `claude plugin install`, `gh auth login`, and authenticating
 * someone else's Linear MCP server are all account-level actions on the
 * *person running forge*, not on the repo. Printing the exact command and
 * letting them decide when to run it matches how the rest of this tool
 * already treats anything it can't safely act on by itself (a `TODO(forge):`
 * marker, a warning).
 *
 * Three consumers share this module and each picks its own severity:
 * `init` prints everything as advice, `doctor` reports it per repo, and
 * `preflight` refuses to dispatch on it. That is why a check reports a
 * three-valued {@link DependencyStatus} rather than a boolean: "I verified
 * this is missing" and "I could not verify this at all" must not collapse
 * into the same answer once one of them blocks a wave.
 */

export const MATTPOCOCK_SKILLS_PLUGIN_ID = 'mattpocock-skills@claude-plugins-official'

/** The two `~/.claude/agents/*.md` files `install.sh` copies from this repo's
 * own `agents/` directory. Phase 6 dispatches workers as `forge-worker` and
 * Phase 8 dispatches the reviewer as `forge-reviewer` — either name missing
 * makes that `Agent({subagent_type: ...})` call fail outright. */
export const FORGE_AGENT_NAMES = ['forge-worker', 'forge-reviewer'] as const

/**
 * Every probe runs a foreign binary that can block on the network —
 * `gh auth status` validates the token against the API, and `claude` may go
 * looking at a marketplace. A dispatch gate that *hangs* is worse than one
 * that fails, so every probe is spawned with a timeout and a hang is
 * reported as `indeterminate` rather than waited out. Bun Shell (`Bun.$`)
 * has no timeout option, which is why these use `Bun.spawn` directly.
 */
export const DEPENDENCY_PROBE_TIMEOUT_MS = 5_000

export type DependencyName =
  | 'claude-plugin'
  | 'forge-agents'
  | 'github-cli'
  | 'linear-mcp-server'
  | 'tracker-kind'

export type DependencyStatus =
  /** Verified present and usable — never reported to anyone. */
  | 'satisfied'
  /** Verified absent or unusable. `preflight` refuses to dispatch on this. */
  | 'unsatisfied'
  /** Could not be verified either way (tool not on PATH, probe timed out).
   * Always advisory: blocking here would strand anyone whose environment is
   * merely unusual rather than broken. */
  | 'indeterminate'

export type DependencyCheck = {
  readonly dependency: DependencyName
  readonly status: DependencyStatus
  /** One line, no newlines: what is wrong and why it matters. */
  readonly summary: string
  /** Literal commands to run, one per line. Empty when the remedy fits in
   * `summary` or when there is nothing the user can run. */
  readonly remedy: readonly string[]
  /** What could *not* be verified, when the check passed but only partly —
   * today just the Linear MCP server's authentication. */
  readonly limitation: string | null
}

export type ClaudePluginProbe =
  | { readonly kind: 'listed'; readonly status: 'installed' | 'disabled' | 'missing' }
  | { readonly kind: 'claude-not-on-path' }
  | { readonly kind: 'claude-failed'; readonly detail: string }

/** Filesystem-only — unlike the plugin/gh/Linear probes, there's no binary to
 * shell out to: `install.sh` just copies files, so checking they landed is a
 * plain `existsSync` per name. */
export type ForgeAgentsProbe =
  | { readonly kind: 'present' }
  | { readonly kind: 'missing'; readonly missing: readonly string[] }

export type GithubCliProbe =
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'not-on-path' }
  | { readonly kind: 'timed-out' }

export type LinearMcpProbe =
  | { readonly kind: 'declared'; readonly source: 'mcp-json' | 'claude-mcp-list' }
  | { readonly kind: 'entry-malformed'; readonly serverKey: string }
  | { readonly kind: 'not-declared'; readonly searchedAllScopes: boolean }
  | { readonly kind: 'mcp-json-unreadable'; readonly detail: string }

export type DependencyProbes = {
  /** Memoized by {@link createDependencyProbes} — the plugin list is global,
   * so a fleet sweep over 30 repos must still shell out exactly once. */
  readonly claudePlugin: () => Promise<ClaudePluginProbe>
  /** Memoized for the same reason: `gh` auth is per account/host, not per repo. */
  readonly githubCli: () => Promise<GithubCliProbe>
  readonly linearMcpServer: (repoRoot: string) => Promise<LinearMcpProbe>
  /** Memoized: `~/.claude/agents/` is a fixed, user-scoped path, not per repo. */
  readonly forgeAgents: () => Promise<ForgeAgentsProbe>
}

type ProbeRun =
  | { readonly kind: 'ran'; readonly exitCode: number; readonly stdout: string }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'spawn-failed'; readonly message: string }

/**
 * A process killed by `Bun.spawn`'s `timeout` surfaces as `exitCode === null`
 * with a `signalCode`, not as a thrown error — so a timeout is detected by
 * inspecting the finished subprocess, while a genuinely un-spawnable binary
 * (not on PATH) throws and lands in `spawn-failed`.
 */
export async function runProbeCommand(
  command: readonly string[],
  timeoutMs: number = DEPENDENCY_PROBE_TIMEOUT_MS,
): Promise<ProbeRun> {
  try {
    const child = Bun.spawn(command as string[], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: timeoutMs,
      killSignal: 'SIGTERM',
    })
    const stdout = await new Response(child.stdout).text()
    await child.exited
    if (child.exitCode === null) return { kind: 'timed-out' }
    return { kind: 'ran', exitCode: child.exitCode, stdout }
  } catch (error: unknown) {
    return {
      kind: 'spawn-failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Bun Shell is its own minimal implementation rather than a real POSIX
 * shell, so the usual `command -v` builtin isn't available inside a `Bun.$`
 * template — `which` is what this codebase resolves binaries with. */
export async function resolveBinaryOnPath(binary: string): Promise<boolean> {
  const result = await Bun.$`which ${binary}`.nothrow().quiet()
  return result.exitCode === 0
}

/**
 * `claude plugin list` prints one `❯ <id>` block per *installation scope*, so
 * the same plugin id legitimately appears several times (once under `user`,
 * repeatedly under `project`) with independent statuses. An earlier version
 * of this parser read only the first block, which reported `disabled` for a
 * plugin that was enabled in another scope — harmless while this was advice,
 * but it would have blocked dispatch once `preflight` started gating on it.
 * A plugin is `installed` if *any* of its blocks is enabled.
 *
 * Matching is done on the block header rather than a bare substring search so
 * that an id which merely contains another as a suffix can't satisfy it.
 */
export function parsePluginListOutput(
  output: string,
  pluginId: string,
): 'installed' | 'disabled' | 'missing' {
  const blocks = output.split('❯').slice(1)
  let sawPlugin = false
  for (const block of blocks) {
    const header = block.split('\n', 1)[0]?.trim()
    if (header !== pluginId) continue
    sawPlugin = true
    if (!/disabled/i.test(block)) return 'installed'
  }
  return sawPlugin ? 'disabled' : 'missing'
}

/** `claude mcp list` covers every scope (user-level `~/.claude.json` included),
 * not just the repo's `.mcp.json` — a repo-local check alone would block a
 * perfectly working user-level Linear server. */
export function mcpListMentionsLinear(output: string): boolean {
  return output.toLowerCase().includes('linear')
}

export type LinearEntryLookup =
  | { readonly kind: 'absent' }
  | { readonly kind: 'malformed'; readonly serverKey: string }
  | { readonly kind: 'well-formed'; readonly serverKey: string }

/**
 * `.mcp.json` uses a server key naming convention (`linear-server`, per every
 * real config seen in this fleet) rather than a fixed field to grep for —
 * checks both the server's key and its `command`/`args` for the literal
 * substring `linear`, since a self-hosted or renamed entry might still carry
 * it only in one place (e.g. `mcp-remote https://mcp.linear.app/...`).
 *
 * A matched entry is then checked for *shape*: either stdio (`command`) or
 * remote (`type` + `url`). An entry matching the name but carrying neither is
 * a real, detectable misconfiguration rather than a working server.
 */
export function findLinearMcpEntry(parsed: unknown): LinearEntryLookup {
  if (typeof parsed !== 'object' || parsed === null) return { kind: 'absent' }
  const servers = (parsed as Record<string, unknown>).mcpServers
  if (typeof servers !== 'object' || servers === null) return { kind: 'absent' }

  for (const [key, value] of Object.entries(servers as Record<string, unknown>)) {
    const entry = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
    const args = Array.isArray(entry.args) ? entry.args.join(' ') : ''
    const command = typeof entry.command === 'string' ? entry.command : ''
    const url = typeof entry.url === 'string' ? entry.url : ''
    const haystack = `${key} ${command} ${args} ${url}`.toLowerCase()
    if (!haystack.includes('linear')) continue

    const isStdio = command.length > 0
    const isRemote = typeof entry.type === 'string' && url.length > 0
    return isStdio || isRemote
      ? { kind: 'well-formed', serverKey: key }
      : { kind: 'malformed', serverKey: key }
  }
  return { kind: 'absent' }
}

export function classifyClaudePluginProbe(probe: ClaudePluginProbe): DependencyCheck {
  const base = { dependency: 'claude-plugin' as const, limitation: null }
  switch (probe.kind) {
    case 'claude-not-on-path':
      return {
        ...base,
        status: 'indeterminate',
        summary:
          "could not verify the mattpocock-skills plugin — the `claude` binary is not on this shell's PATH. " +
          "/forge's interview/spec/ticket phases (1-5) need that plugin; check it from a shell where `claude` resolves.",
        remedy: [],
      }
    case 'claude-failed':
      return {
        ...base,
        status: 'indeterminate',
        summary: `could not verify the mattpocock-skills plugin — \`claude plugin list\` failed: ${probe.detail}`,
        remedy: [],
      }
    case 'listed':
      if (probe.status === 'installed') {
        return { ...base, status: 'satisfied', summary: 'mattpocock-skills plugin is installed', remedy: [] }
      }
      if (probe.status === 'disabled') {
        return {
          ...base,
          status: 'unsatisfied',
          summary:
            'mattpocock-skills plugin is installed but disabled — run ' +
            `\`claude plugin enable ${MATTPOCOCK_SKILLS_PLUGIN_ID}\`.`,
          remedy: [],
        }
      }
      return {
        ...base,
        status: 'unsatisfied',
        summary:
          "mattpocock-skills plugin not found — /forge's interview/spec/ticket phases (1-5) need it. Run:",
        remedy: [
          'claude plugin marketplace add anthropics/claude-plugins-official',
          `claude plugin install ${MATTPOCOCK_SKILLS_PLUGIN_ID}`,
        ],
      }
  }
}

export function classifyForgeAgentsProbe(probe: ForgeAgentsProbe): DependencyCheck {
  const base = { dependency: 'forge-agents' as const, limitation: null }
  if (probe.kind === 'present') {
    return { ...base, status: 'satisfied', summary: 'forge-worker and forge-reviewer agents are installed', remedy: [] }
  }
  return {
    ...base,
    status: 'unsatisfied',
    summary:
      `~/.claude/agents/ is missing ${probe.missing.join(', ')} — Phase 6/8 dispatch will fail to resolve ` +
      'the subagent_type. Re-run:',
    remedy: ['./install.sh'],
  }
}

export function classifyGithubCliProbe(probe: GithubCliProbe): DependencyCheck {
  const base = { dependency: 'github-cli' as const, limitation: null, remedy: [] }
  switch (probe.kind) {
    case 'authenticated':
      return { ...base, status: 'satisfied', summary: 'gh CLI is installed and authenticated' }
    case 'not-on-path':
      return {
        ...base,
        status: 'unsatisfied',
        summary:
          "gh CLI not found on PATH — required for this repo's github tracker. Install: https://cli.github.com",
      }
    case 'unauthenticated':
      return {
        ...base,
        status: 'unsatisfied',
        summary: 'gh CLI found but not authenticated — run `gh auth login` before dispatching a wave.',
      }
    case 'timed-out':
      return {
        ...base,
        status: 'indeterminate',
        summary: `could not verify gh authentication — \`gh auth status\` timed out after ${DEPENDENCY_PROBE_TIMEOUT_MS}ms (no network?).`,
      }
  }
}

/**
 * The one thing forge deliberately does not try to verify is whether the
 * Linear MCP *connection* is authorized. That token lives in Claude Code's
 * own credential store in a format that is neither documented nor stable,
 * and its presence wouldn't prove the session is still valid anyway. So a
 * declared, well-formed server is `satisfied` with the gap stated out loud in
 * `limitation` rather than silently treated as proof of a working tracker.
 */
export function classifyLinearMcpProbe(probe: LinearMcpProbe): DependencyCheck {
  const base = { dependency: 'linear-mcp-server' as const, remedy: [] }
  const authLimitation =
    'forge can verify the Linear MCP server is declared, not that the connection is authenticated — ' +
    'if Phase 0 fails to read tickets, restart Claude Code and approve the connection.'

  switch (probe.kind) {
    case 'declared':
      return {
        ...base,
        status: 'satisfied',
        summary: `Linear MCP server declared (${probe.source === 'mcp-json' ? '.mcp.json' : 'claude mcp list'})`,
        limitation: authLimitation,
      }
    case 'entry-malformed':
      return {
        ...base,
        status: 'unsatisfied',
        summary:
          `tracker: linear — the "${probe.serverKey}" entry in .mcp.json has neither a \`command\` (stdio) ` +
          'nor a `type` + `url` (remote), so no MCP client can start it.',
        limitation: null,
      }
    case 'not-declared':
      return {
        ...base,
        status: probe.searchedAllScopes ? 'unsatisfied' : 'indeterminate',
        summary: probe.searchedAllScopes
          ? 'tracker: linear — no Linear MCP server found in .mcp.json or in `claude mcp list`. /forge cannot read or move tickets without it.'
          : "tracker: linear — no Linear MCP server in .mcp.json, and `claude` is not on PATH to check user-level scopes. If yours is configured at user level this is fine.",
        limitation: null,
      }
    case 'mcp-json-unreadable':
      return {
        ...base,
        status: 'unsatisfied',
        summary: `tracker: linear — .mcp.json could not be read as JSON: ${probe.detail}`,
        limitation: null,
      }
  }
}

function trackerKindUndeclaredCheck(): DependencyCheck {
  return {
    dependency: 'tracker-kind',
    status: 'indeterminate',
    summary:
      'forge.config.json declares no tracker.kind — tracker-specific dependency checks (gh, Linear) were skipped. ' +
      'Re-run `forge init --force` or add a "tracker": { "kind": ... } section.',
    remedy: [],
    limitation: null,
  }
}

export async function checkDependencies(input: {
  readonly tracker: TrackerKind | null
  readonly repoRoot: string
  readonly probes: DependencyProbes
}): Promise<readonly DependencyCheck[]> {
  const checks: DependencyCheck[] = [
    classifyClaudePluginProbe(await input.probes.claudePlugin()),
    classifyForgeAgentsProbe(await input.probes.forgeAgents()),
  ]

  if (input.tracker === null) {
    checks.push(trackerKindUndeclaredCheck())
    return checks
  }
  if (input.tracker === 'github') {
    checks.push(classifyGithubCliProbe(await input.probes.githubCli()))
  }
  if (input.tracker === 'linear') {
    checks.push(classifyLinearMcpProbe(await input.probes.linearMcpServer(input.repoRoot)))
  }
  return checks
}

/**
 * `continuationIndent` is the caller's own indentation for a remedy line —
 * `init` prints these under a two-space bullet with six-space commands, and
 * `preflight` under its own `- ` list, so neither the summary nor the remedy
 * hardcodes a layout.
 */
export function formatDependencyCheck(check: DependencyCheck, continuationIndent: string): string {
  if (check.remedy.length === 0) return check.summary
  return `${check.summary}\n${check.remedy.map((line) => `${continuationIndent}${line}`).join('\n')}`
}

export function unsatisfiedChecks(
  checks: readonly DependencyCheck[],
): readonly DependencyCheck[] {
  return checks.filter((check) => check.status === 'unsatisfied')
}

export function indeterminateChecks(
  checks: readonly DependencyCheck[],
): readonly DependencyCheck[] {
  return checks.filter((check) => check.status === 'indeterminate')
}

async function probeClaudePlugin(): Promise<ClaudePluginProbe> {
  if (!(await resolveBinaryOnPath('claude'))) return { kind: 'claude-not-on-path' }
  const result = await runProbeCommand(['claude', 'plugin', 'list'])
  if (result.kind === 'timed-out') {
    return { kind: 'claude-failed', detail: `timed out after ${DEPENDENCY_PROBE_TIMEOUT_MS}ms` }
  }
  if (result.kind === 'spawn-failed') return { kind: 'claude-failed', detail: result.message }
  if (result.exitCode !== 0) return { kind: 'claude-failed', detail: `exit code ${result.exitCode}` }
  return {
    kind: 'listed',
    status: parsePluginListOutput(result.stdout, MATTPOCOCK_SKILLS_PLUGIN_ID),
  }
}

export function probeForgeAgents(agentsDirectory: string): ForgeAgentsProbe {
  const missing = FORGE_AGENT_NAMES.filter(
    (name) => !existsSync(path.join(agentsDirectory, `${name}.md`)),
  )
  return missing.length === 0 ? { kind: 'present' } : { kind: 'missing', missing }
}

async function probeGithubCli(): Promise<GithubCliProbe> {
  if (!(await resolveBinaryOnPath('gh'))) return { kind: 'not-on-path' }
  const result = await runProbeCommand(['gh', 'auth', 'status'])
  if (result.kind === 'timed-out') return { kind: 'timed-out' }
  if (result.kind === 'spawn-failed') return { kind: 'not-on-path' }
  return result.exitCode === 0 ? { kind: 'authenticated' } : { kind: 'unauthenticated' }
}

export async function probeLinearMcpServer(repoRoot: string): Promise<LinearMcpProbe> {
  const file = Bun.file(path.join(repoRoot, '.mcp.json'))
  if (await file.exists()) {
    let parsed: unknown
    try {
      parsed = await file.json()
    } catch (error: unknown) {
      return {
        kind: 'mcp-json-unreadable',
        detail: error instanceof Error ? error.message : String(error),
      }
    }
    const lookup = findLinearMcpEntry(parsed)
    if (lookup.kind === 'well-formed') return { kind: 'declared', source: 'mcp-json' }
    if (lookup.kind === 'malformed') {
      return { kind: 'entry-malformed', serverKey: lookup.serverKey }
    }
  }

  if (!(await resolveBinaryOnPath('claude'))) {
    return { kind: 'not-declared', searchedAllScopes: false }
  }
  const result = await runProbeCommand(['claude', 'mcp', 'list'])
  if (result.kind !== 'ran' || result.exitCode !== 0) {
    return { kind: 'not-declared', searchedAllScopes: false }
  }
  return mcpListMentionsLinear(result.stdout)
    ? { kind: 'declared', source: 'claude-mcp-list' }
    : { kind: 'not-declared', searchedAllScopes: true }
}

/** Memoizes the two repo-independent probes so a fleet sweep shells out once
 * rather than once per repo. */
export function createDependencyProbes(): DependencyProbes {
  let claudePluginResult: Promise<ClaudePluginProbe> | null = null
  let githubCliResult: Promise<GithubCliProbe> | null = null

  let forgeAgentsResult: Promise<ForgeAgentsProbe> | null = null

  return {
    claudePlugin: () => (claudePluginResult ??= probeClaudePlugin()),
    githubCli: () => (githubCliResult ??= probeGithubCli()),
    linearMcpServer: probeLinearMcpServer,
    forgeAgents: () =>
      (forgeAgentsResult ??= Promise.resolve(
        probeForgeAgents(path.join(os.homedir(), '.claude', 'agents')),
      )),
  }
}

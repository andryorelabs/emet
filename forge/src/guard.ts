import { readFileSync } from 'node:fs'

import { listOccupiedSlots, type SlotListEntry } from './slots'

/**
 * `forge guard` — a Claude Code `PreToolUse` hook that blocks the three
 * harness-level failure modes real `/forge` runs have hit repeatedly (see
 * `reference/incidents.md`'s bug-report drafts): a worker backgrounding a
 * `Bash` command it means to wait on (it gets no completion notification,
 * so it stalls unattended), `ScheduleWakeup` replaying a slash command
 * while background work is in flight (indistinguishable from a human
 * re-typing it, risking a restart from Phase 0), and `code-review`'s
 * finder-roster fan-out hanging when another `/forge` coordinator's wave
 * is already busy on this host.
 *
 * None of these are `/forge`-internal bugs — they're triggers this repo's
 * own docs (`worker-prompt.md`, `phases-6-9.md`) already ask a session not
 * to pull, restated here as a hook because a prose rule has, measurably,
 * not been enough (`reference/incidents.md`'s "handoff note's 0-of-4 wave").
 * A hook makes the same rule structurally true regardless of whether this
 * turn's context happens to include the doc that states it.
 *
 * Reads one `PreToolUse` hook payload from stdin, writes a
 * `permissionDecision: "deny"` response to stdout when a rule fires, or
 * nothing at all (implicit "allow" — the harness's own default) otherwise.
 * Every rule fails open: an internal error here must never block a
 * session's ordinary work because this hook has a bug of its own.
 */

export type PreToolUseHookInput = {
  readonly tool_name?: string
  readonly cwd?: string
  readonly tool_input?: Record<string, unknown>
}

export type GuardVerdict =
  | { readonly decision: 'allow' }
  | { readonly decision: 'deny'; readonly reason: string }

const ALLOW: GuardVerdict = { decision: 'allow' }

function deny(reason: string): GuardVerdict {
  return { decision: 'deny', reason }
}

/**
 * A worker never gets a completion notification for its own `Bash
 * run_in_background: true` call — that channel is wired to the top-level
 * session only. Scoped to a `/forge` agent worktree's own cwd (rather than
 * every `Bash` call everywhere) since an ordinary interactive session
 * backgrounding something is a legitimate, supported pattern this hook has
 * no business blocking.
 */
export function checkBackgroundBashInWorktree(input: PreToolUseHookInput): GuardVerdict {
  if (input.tool_name !== 'Bash') return ALLOW
  if (input.tool_input?.run_in_background !== true) return ALLOW
  if (!input.cwd?.includes('.claude/worktrees/agent-')) return ALLOW

  return deny(
    'forge guard: a /forge worker gets no completion notification for a backgrounded Bash ' +
      'process (that channel only reaches the top-level session) — run this in the ' +
      'foreground, wrapped in `timeout` if it might hang. See reference/incidents.md.',
  )
}

/**
 * `ScheduleWakeup`'s `prompt` replaying a slash command arrives, on fire, as
 * a fresh `<command-message>` turn — indistinguishable from a human
 * re-typing it. For `/forge` specifically that risks restarting the whole
 * multi-phase run from Phase 0 instead of resuming an in-progress wave (a
 * real run measured exactly this, three times in a row — see
 * `reference/incidents.md`).
 */
export function checkScheduleWakeupSlashCommand(input: PreToolUseHookInput): GuardVerdict {
  if (input.tool_name !== 'ScheduleWakeup') return ALLOW
  const prompt = input.tool_input?.prompt
  if (typeof prompt !== 'string' || !prompt.trimStart().startsWith('/forge')) return ALLOW

  return deny(
    'forge guard: ScheduleWakeup\'s prompt must not be a /forge slash command — on fire it ' +
      'replays as a fresh command turn and can restart the run from Phase 0. Use a short ' +
      'resume note instead (e.g. "resume wave close-out for run <runId>"). See reference/incidents.md.',
  )
}

/**
 * Parses `/proc/<pid>/stat`'s 4th whitespace-separated field (`ppid`) — the
 * one line this hook needs from procfs, read directly rather than pulling in
 * a process-tree library for a single integer. Returns `null` for a pid
 * that's gone, unreadable, or whose `stat` doesn't parse (e.g. a process
 * name containing a literal `)` throws off naive splitting — this locates
 * the *last* `)` first, exactly like `ps`/procfs docs recommend, so that
 * case still parses correctly).
 */
export function readParentPid(
  pid: number,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): number | null {
  try {
    const raw = readFile(`/proc/${pid}/stat`)
    const afterComm = raw.slice(raw.lastIndexOf(')') + 1).trim()
    const fields = afterComm.split(/\s+/)
    // fields[0] is state, fields[1] is ppid — the ppid is the 4th field of
    // the whole stat line, but the first two (pid, comm) were consumed by
    // `lastIndexOf(')')` above.
    const ppid = Number(fields[1])
    return Number.isSafeInteger(ppid) && ppid > 0 ? ppid : null
  } catch {
    return null
  }
}

/**
 * Walks `startPid`'s own ancestry (itself, its parent, its parent's parent,
 * …) up to `maxDepth` hops, stopping at pid 1 or the first unreadable
 * `/proc/<pid>/stat`. Used to decide whether a slot's `anchorPid` is *this*
 * session (the hook process descends from it) or a sibling's.
 */
export function collectProcessAncestry(
  startPid: number,
  readParent: (pid: number) => number | null = readParentPid,
  maxDepth = 64,
): number[] {
  const ancestry: number[] = [startPid]
  let current = startPid
  for (let hop = 0; hop < maxDepth; hop++) {
    const parent = readParent(current)
    if (parent === null || parent === current || parent <= 1) break
    ancestry.push(parent)
    current = parent
  }
  return ancestry
}

/**
 * Whether at least one *other* run (an `anchorPid` outside this hook
 * process's own ancestry) holds a slot with a `'live'` verdict — the signal
 * `phases-6-9.md`'s Phase 8 uses to skip `code-review`'s finder-roster
 * fan-out: several real runs measured that roster hanging when multiple
 * `/forge` coordinators' background work was contending for the same host
 * at once, unrelated to raw memory/cpu headroom.
 */
export function hasLiveSiblingRun(
  entries: readonly SlotListEntry[],
  ownAncestry: readonly number[],
): boolean {
  const ownPids = new Set(ownAncestry)
  return entries.some((entry) => entry.verdict === 'live' && !ownPids.has(entry.holder.anchorPid))
}

/**
 * `code-review`'s own fan-out is what hung repeatedly under host
 * contention (`reference/incidents.md`) — this only fires for that one
 * skill, keyed on `tool_input.skill` however the `Skill` tool names it
 * (`code-review`, or a plugin-scoped `plugin:code-review`).
 */
function isCodeReviewSkillInvocation(input: PreToolUseHookInput): boolean {
  if (input.tool_name !== 'Skill') return false
  const skill = input.tool_input?.skill
  return typeof skill === 'string' && (skill === 'code-review' || skill.endsWith(':code-review'))
}

export async function checkCodeReviewFanoutWithSiblingRun(
  input: PreToolUseHookInput,
  hookPid: number,
  listSlots: () => Promise<readonly SlotListEntry[]> = listOccupiedSlots,
): Promise<GuardVerdict> {
  if (!isCodeReviewSkillInvocation(input)) return ALLOW

  const entries = await listSlots()
  const ownAncestry = collectProcessAncestry(hookPid)
  if (!hasLiveSiblingRun(entries, ownAncestry)) return ALLOW

  return deny(
    'forge guard: another /forge coordinator has a live worker slot on this host right now ' +
      '(check "forge slots") — run code-review in a single pass with no finder-roster fan-out ' +
      'instead (e.g. --level medium or lower); the fan-out has repeatedly hung under host ' +
      'contention from a sibling wave. See reference/incidents.md.',
  )
}

/**
 * Runs every rule and returns the first `deny`, or `allow` if none fire.
 * Never throws: an internal error in any rule is caught and treated as
 * `allow` (with the error on stderr) — this hook must never be the reason
 * an otherwise-fine tool call gets blocked.
 */
export async function evaluateGuard(
  input: PreToolUseHookInput,
  hookPid: number,
): Promise<GuardVerdict> {
  try {
    const backgroundBashVerdict = checkBackgroundBashInWorktree(input)
    if (backgroundBashVerdict.decision === 'deny') return backgroundBashVerdict

    const scheduleWakeupVerdict = checkScheduleWakeupSlashCommand(input)
    if (scheduleWakeupVerdict.decision === 'deny') return scheduleWakeupVerdict

    return await checkCodeReviewFanoutWithSiblingRun(input, hookPid)
  } catch (error) {
    console.error('forge:guard — internal error, allowing the call:', error)
    return ALLOW
  }
}

function formatHookOutput(verdict: GuardVerdict): string | null {
  if (verdict.decision === 'allow') return null
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: verdict.reason,
    },
  })
}

export async function run(): Promise<void> {
  let raw: string
  try {
    raw = await Bun.stdin.text()
  } catch (error) {
    console.error('forge:guard — could not read stdin, allowing the call:', error)
    return
  }

  let input: PreToolUseHookInput
  try {
    input = raw.trim().length > 0 ? (JSON.parse(raw) as PreToolUseHookInput) : {}
  } catch (error) {
    console.error('forge:guard — could not parse hook input, allowing the call:', error)
    return
  }

  const verdict = await evaluateGuard(input, process.pid)
  const output = formatHookOutput(verdict)
  if (output) console.log(output)
}

if (import.meta.main) {
  await run()
}

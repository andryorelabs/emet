import { describe, expect, test } from 'bun:test'

import {
  checkBackgroundBashInWorktree,
  checkCodeReviewFanoutWithSiblingRun,
  checkScheduleWakeupSlashCommand,
  collectProcessAncestry,
  evaluateGuard,
  hasLiveSiblingRun,
  readParentPid,
  type PreToolUseHookInput,
} from './guard'
import type { SlotHolder } from './slots'

function makeHolder(overrides: Partial<SlotHolder> = {}): SlotHolder {
  return {
    pid: 1000,
    worktree: '/repo',
    acquiredAt: Date.now(),
    runId: 'run-a',
    anchorPid: 1000,
    ticket: 'AO-1',
    sessionSlug: '-home-user-repo',
    repoRoot: '/repo',
    ...overrides,
  }
}

describe('checkBackgroundBashInWorktree', () => {
  test('denies a backgrounded Bash call from inside an agent worktree', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'Bash',
      cwd: '/repo/.claude/worktrees/agent-abc',
      tool_input: { run_in_background: true },
    }
    expect(checkBackgroundBashInWorktree(input).decision).toBe('deny')
  })

  test('allows a foreground Bash call from inside an agent worktree', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'Bash',
      cwd: '/repo/.claude/worktrees/agent-abc',
      tool_input: { run_in_background: false },
    }
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: 'allow' })
  })

  test('allows a backgrounded Bash call from an ordinary (non-worker) cwd', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'Bash',
      cwd: '/home/user/code/some-repo',
      tool_input: { run_in_background: true },
    }
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: 'allow' })
  })

  test('ignores every other tool', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'ScheduleWakeup',
      cwd: '/repo/.claude/worktrees/agent-abc',
      tool_input: { run_in_background: true },
    }
    expect(checkBackgroundBashInWorktree(input)).toEqual({ decision: 'allow' })
  })
})

describe('checkScheduleWakeupSlashCommand', () => {
  test('denies a /forge prompt', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'ScheduleWakeup',
      tool_input: { prompt: '/forge --dispatch AO-565' },
    }
    expect(checkScheduleWakeupSlashCommand(input).decision).toBe('deny')
  })

  test('denies a /forge prompt with leading whitespace', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'ScheduleWakeup',
      tool_input: { prompt: '  /forge --dispatch AO-565' },
    }
    expect(checkScheduleWakeupSlashCommand(input).decision).toBe('deny')
  })

  test('allows an ordinary resume-note prompt', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'ScheduleWakeup',
      tool_input: { prompt: 'resume wave close-out for run ao550' },
    }
    expect(checkScheduleWakeupSlashCommand(input)).toEqual({ decision: 'allow' })
  })

  test('ignores every other tool', () => {
    const input: PreToolUseHookInput = {
      tool_name: 'Bash',
      tool_input: { prompt: '/forge --dispatch AO-565' },
    }
    expect(checkScheduleWakeupSlashCommand(input)).toEqual({ decision: 'allow' })
  })
})

describe('readParentPid', () => {
  test('parses ppid out of a well-formed /proc/<pid>/stat line', () => {
    const stat = '1234 (bun) S 999 1234 1234 0 -1 4194560 ...'
    expect(readParentPid(1234, () => stat)).toBe(999)
  })

  test('handles a process name containing a literal ")"', () => {
    const stat = '1234 (weird ) name) S 5555 1234 1234 0 -1 4194560'
    expect(readParentPid(1234, () => stat)).toBe(5555)
  })

  test('returns null when the file is unreadable', () => {
    expect(
      readParentPid(1234, () => {
        throw new Error('ENOENT')
      }),
    ).toBeNull()
  })

  test('returns null for a malformed line', () => {
    expect(readParentPid(1234, () => '1234 (bun)')).toBeNull()
  })
})

describe('collectProcessAncestry', () => {
  test('walks up to pid 1 and stops', () => {
    const parents: Record<number, number> = { 500: 400, 400: 300, 300: 1 }
    const ancestry = collectProcessAncestry(500, (pid) => parents[pid] ?? null)
    expect(ancestry).toEqual([500, 400, 300])
  })

  test('stops when a hop reports no parent', () => {
    const ancestry = collectProcessAncestry(500, () => null)
    expect(ancestry).toEqual([500])
  })

  test('never loops forever on a self-referential parent', () => {
    const ancestry = collectProcessAncestry(500, () => 500)
    expect(ancestry).toEqual([500])
  })
})

describe('hasLiveSiblingRun', () => {
  test('true when a live slot is held by an anchorPid outside this ancestry', () => {
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: 'live' as const }]
    expect(hasLiveSiblingRun(entries, [111, 222])).toBe(true)
  })

  test('false when the only live slot is this run\'s own', () => {
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 111 }), verdict: 'live' as const }]
    expect(hasLiveSiblingRun(entries, [111, 222])).toBe(false)
  })

  test('false when the sibling slot is dead, not live', () => {
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: 'dead' as const }]
    expect(hasLiveSiblingRun(entries, [111])).toBe(false)
  })

  test('false with no occupied slots at all', () => {
    expect(hasLiveSiblingRun([], [111])).toBe(false)
  })
})

describe('checkCodeReviewFanoutWithSiblingRun', () => {
  test('denies code-review when a live sibling run holds a slot', async () => {
    const input: PreToolUseHookInput = { tool_name: 'Skill', tool_input: { skill: 'code-review' } }
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: 'live' as const }]
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, async () => entries)
    expect(verdict.decision).toBe('deny')
  })

  test('allows code-review when no sibling run is live', async () => {
    const input: PreToolUseHookInput = { tool_name: 'Skill', tool_input: { skill: 'code-review' } }
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, async () => [])
    expect(verdict).toEqual({ decision: 'allow' })
  })

  test('matches a plugin-scoped skill name', async () => {
    const input: PreToolUseHookInput = {
      tool_name: 'Skill',
      tool_input: { skill: 'mattpocock-skills:code-review' },
    }
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: 'live' as const }]
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, async () => entries)
    expect(verdict.decision).toBe('deny')
  })

  test('ignores every other skill', async () => {
    const input: PreToolUseHookInput = { tool_name: 'Skill', tool_input: { skill: 'simplify' } }
    const entries = [{ index: 0, holder: makeHolder({ anchorPid: 777 }), verdict: 'live' as const }]
    const verdict = await checkCodeReviewFanoutWithSiblingRun(input, 111, async () => entries)
    expect(verdict).toEqual({ decision: 'allow' })
  })
})

describe('evaluateGuard', () => {
  test('allows an ordinary tool call with nothing to flag', async () => {
    const input: PreToolUseHookInput = { tool_name: 'Read', tool_input: { file_path: '/x' } }
    expect(await evaluateGuard(input, process.pid)).toEqual({ decision: 'allow' })
  })

  test('never throws on a malformed input shape', async () => {
    const input = {} as PreToolUseHookInput
    const verdict = await evaluateGuard(input, process.pid)
    expect(verdict).toEqual({ decision: 'allow' })
  })
})

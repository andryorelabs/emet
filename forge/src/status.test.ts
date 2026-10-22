import { describe, expect, test } from 'bun:test'

import {
  buildStatusReport,
  groupWorkers,
  parsePullRequests,
  parseRunIdentity,
  summarize,
  type PullRequestStatus,
  type WaveInput,
  type WorkerSignal,
} from './status'

const greenPullRequest: PullRequestStatus = {
  number: 1,
  state: 'open',
  checks: 'passing',
  mergeable: true,
  changesRequested: false,
}

function worker(overrides: Partial<WorkerSignal> = {}): WorkerSignal {
  return { ticket: 'CLA-1', branch: 'b', pullRequest: null, stalled: false, ...overrides }
}

function wave(workers: WorkerSignal[], runVerdict: WaveInput['runVerdict'] = 'live'): WaveInput {
  return { runId: 'forge20w2042651', runVerdict, workers }
}

const stateOf = (input: WaveInput) => buildStatusReport([input], null).waves[0]!.state

describe('wave states', () => {
  test('working: a worker has no PR yet', () => {
    expect(
      stateOf(wave([worker(), worker({ ticket: 'CLA-2', pullRequest: greenPullRequest })])),
    ).toBe('working')
  })

  test('checking: every worker has a PR and checks are pending', () => {
    expect(
      stateOf(wave([worker({ pullRequest: { ...greenPullRequest, checks: 'pending' } })])),
    ).toBe('checking')
  })

  test('ready: all PRs green and mergeable', () => {
    expect(stateOf(wave([worker({ pullRequest: greenPullRequest })]))).toBe('ready')
  })

  test.each([
    ['stalled worker', worker({ stalled: true })],
    ['failing checks', worker({ pullRequest: { ...greenPullRequest, checks: 'failing' } })],
    ['conflict', worker({ pullRequest: { ...greenPullRequest, mergeable: false } })],
    ['changes requested', worker({ pullRequest: { ...greenPullRequest, changesRequested: true } })],
    ['closed PR', worker({ pullRequest: { ...greenPullRequest, state: 'closed' } })],
  ])('needs-decision: %s', (_label, signal) => {
    expect(
      stateOf(wave([worker({ ticket: 'CLA-2', pullRequest: greenPullRequest }), signal])),
    ).toBe('needs-decision')
  })

  test('needs-decision: dead run without a PR', () => {
    expect(stateOf(wave([worker()], 'dead'))).toBe('needs-decision')
  })
})

describe('report', () => {
  test('no active run reports idle, with and without --spec', () => {
    expect(buildStatusReport([], null)).toEqual({ state: 'idle', spec: null, waves: [] })
    expect(buildStatusReport([], '20').state).toBe('idle')
    expect(summarize(buildStatusReport([], null))).toContain('idle')
  })

  test('--spec filters waves by the spec in the run id', () => {
    const other: WaveInput = { ...wave([worker()]), runId: 'forge21w1000000' }
    const report = buildStatusReport([wave([worker()]), other], '21')
    expect(report.waves.map((w) => w.runId)).toEqual(['forge21w1000000'])
  })

  test('overall state is the most urgent wave', () => {
    const blocked: WaveInput = { ...wave([worker({ stalled: true })]), runId: 'forge20w1000000' }
    const ready = wave([worker({ pullRequest: greenPullRequest })])
    expect(buildStatusReport([ready, blocked], null).state).toBe('needs-decision')
  })

  test('JSON shape is stable', () => {
    const report = buildStatusReport([wave([worker({ pullRequest: greenPullRequest })])], '20')
    expect(Object.keys(report)).toEqual(['state', 'spec', 'waves'])
    expect(Object.keys(report.waves[0]!)).toEqual([
      'runId', 'spec', 'wave', 'runVerdict', 'state', 'workers',
    ])
    expect(Object.keys(report.waves[0]!.workers[0]!)).toEqual([
      'ticket', 'branch', 'pullRequest', 'stalled', 'state', 'reason',
    ])
  })

  test('summary is one line', () => {
    const line = summarize(buildStatusReport([wave([worker()])], null))
    expect(line.split('\n')).toHaveLength(1)
    expect(line).toContain('wave 2 working')
  })
})

describe('parsing and merging', () => {
  test('parseRunIdentity', () => {
    expect(parseRunIdentity('forge20w2042651')).toEqual({ spec: '20', wave: 2 })
    expect(parseRunIdentity('weird')).toEqual({ spec: null, wave: null })
  })

  test('parsePullRequests maps gh JSON', () => {
    const map = parsePullRequests(
      JSON.stringify([
        {
          number: 5, state: 'OPEN', headRefName: 'a', mergeable: 'MERGEABLE', reviewDecision: null,
          statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }],
        },
        {
          number: 6, state: 'OPEN', headRefName: 'b', mergeable: 'CONFLICTING',
          statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }],
        },
        { number: 7, state: 'MERGED', headRefName: 'c', statusCheckRollup: [] },
      ]),
    )
    expect(map.get('a')).toMatchObject({ checks: 'pending', mergeable: true })
    expect(map.get('b')).toMatchObject({ checks: 'failing', mergeable: false })
    expect(map.get('c')).toMatchObject({ state: 'merged', checks: 'none' })
  })

  test('groupWorkers merges reservations, worktrees, PRs and stalled', () => {
    const waves = groupWorkers(
      [{ directory: '/w/1', branch: 'br', lockedReason: 'forge run=forge20w2042651 ticket=CLA-1 anchor=1 at=x' }],
      [
        { runId: 'forge20w2042651', ticket: 'CLA-1' },
        { runId: 'forge20w2042651', ticket: 'CLA-2' },
      ],
      new Map([['br', greenPullRequest]]),
      new Set(['/w/1']),
      new Map([['forge20w2042651', 'live']]),
    )
    expect(waves).toHaveLength(1)
    expect(waves[0]!.workers).toEqual([
      { ticket: 'CLA-1', branch: 'br', pullRequest: greenPullRequest, stalled: true },
      { ticket: 'CLA-2', branch: null, pullRequest: null, stalled: false },
    ])
  })
})

/**
 * Shared worktree/branch classification used by both `forge-cleanup.ts` and
 * `forge-preflight.ts` — extracted so the two scripts never disagree about
 * what counts as "live" vs. "safe to delete". See `forge-cleanup.ts`'s own
 * top-of-file comment for the full rationale (squash-merge detection via
 * `git merge-tree`, why `git cherry` can't be used, the two-signal liveness
 * check).
 */

/**
 * What {@link classifyByContent} itself can actually return. Kept distinct
 * from {@link BranchVerdict} so the compiler can catch a future attempt to
 * add a case the function doesn't produce — `'in-use'` is never a content
 * verdict, it's a caller-side fact (a branch is checked out by a live
 * worktree) composed on top, see `forge-cleanup.ts`'s `ClassifiedBranch`.
 */
export type ContentVerdict = 'merged' | 'equivalent' | 'diverged' | 'conflicted'

/**
 * The wider verdict type callers compose once they layer their own
 * `'in-use'` signal on top of {@link ContentVerdict} — accepted by
 * {@link isSafeToDelete} so both a bare content verdict and a
 * caller-composed one can be checked with the same function.
 */
export type BranchVerdict = ContentVerdict | 'in-use'

export type BranchEntry = {
  readonly name: string
  readonly worktreePath: string
}

/**
 * Parses `git branch --list <pattern> '--format=%(refname:short)%09%(worktreepath)'`
 * output into structured entries. A branch not checked out by any worktree
 * has an empty `worktreePath`.
 */
export function parseBranchListing(output: string): BranchEntry[] {
  const trimmed = output.trim()
  if (trimmed.length === 0) {
    return []
  }
  return trimmed.split('\n').map((line) => {
    const [name, worktreePath] = line.split('\t', 2)
    return { name: name ?? '', worktreePath: worktreePath ?? '' }
  })
}

/**
 * Parses `git worktree list --porcelain` output into the set of live
 * worktree directory basenames (e.g. `agent-a2d4c8f6ee10afe2e`).
 */
export function parseWorktreeDirectoryNames(output: string): Set<string> {
  const names = new Set<string>()
  for (const line of output.split('\n')) {
    if (!line.startsWith('worktree ')) {
      continue
    }
    const directory = line.slice('worktree '.length).trim()
    names.add(directory.split('/').pop() ?? '')
  }
  return names
}

export async function listBranches(pattern: string): Promise<BranchEntry[]> {
  const output =
    await Bun.$`git branch --list ${pattern} '--format=%(refname:short)%09%(worktreepath)'`.text()
  return parseBranchListing(output)
}

export async function listLiveWorktreeDirectoryNames(): Promise<Set<string>> {
  const output = await Bun.$`git worktree list --porcelain`.text()
  return parseWorktreeDirectoryNames(output)
}

export type WorktreeEntry = {
  readonly directory: string
  readonly branch: string | null
  /**
   * The raw text after a `locked` porcelain line — `''` for `git worktree
   * lock` with no reason given, `null` when the worktree isn't locked at
   * all. See {@link resolveWorktreeOwner} for `/forge`'s own reason format.
   */
  readonly lockedReason: string | null
  /**
   * The commit sha from the porcelain `HEAD <sha>` line. Optional (rather
   * than always required) so existing fixtures across this repo's test
   * files — written before this field existed, and indifferent to it — stay
   * valid without every one of them being touched; `parseWorktreeEntries`
   * itself always sets it, `undefined` only when a caller builds an entry
   * by hand without it.
   */
  readonly head?: string | null
}

/**
 * Parses `git worktree list --porcelain` into `{directory, branch,
 * lockedReason, head}` records — unlike {@link parseWorktreeDirectoryNames},
 * this keeps the full path, the branch actually checked out there (`null`
 * for a detached worktree), the commit it's at, and whether/why the
 * worktree is locked.
 */
export function parseWorktreeEntries(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let currentDirectory: string | null = null
  let currentBranch: string | null = null
  let currentLockedReason: string | null = null
  let currentHead: string | null = null

  const flush = () => {
    if (currentDirectory) {
      entries.push({
        directory: currentDirectory,
        branch: currentBranch,
        lockedReason: currentLockedReason,
        head: currentHead,
      })
    }
  }

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      currentDirectory = line.slice('worktree '.length).trim()
      currentBranch = null
      currentLockedReason = null
      currentHead = null
    } else if (line.startsWith('HEAD ')) {
      currentHead = line.slice('HEAD '.length).trim()
    } else if (line.startsWith('branch ')) {
      currentBranch = line
        .slice('branch '.length)
        .trim()
        .replace('refs/heads/', '')
    } else if (line === 'locked' || line.startsWith('locked ')) {
      currentLockedReason =
        line === 'locked' ? '' : line.slice('locked '.length).trim()
    } else if (line.trim().length === 0) {
      flush()
      currentDirectory = null
      currentBranch = null
      currentLockedReason = null
      currentHead = null
    }
  }
  flush()

  return entries
}

export type WorktreeOwner = {
  readonly runId: string
  readonly ticket: string
  readonly anchorPid: number
  readonly at: string
}

/**
 * Parses the `git worktree lock` reason `/forge` writes at worker bootstrap
 * — `forge run=<runId> ticket=<ticket> anchor=<pid> at=<iso>`, a literal
 * `forge` token followed by space-separated `key=value` pairs (safe because
 * none of `runId`/`ticket`/pid/ISO-timestamp values can contain whitespace)
 * — back into structured fields. Returns `null` for anything that isn't
 * this exact shape: an unlocked worktree (`lockedReason` is `null`), a
 * human's own unrelated `git worktree lock '<reason>'`, or a reason missing
 * one of the four keys — never throws, since encountering a non-`/forge`
 * lock is an expected, normal case.
 */
export function resolveWorktreeOwner(
  entry: WorktreeEntry,
): WorktreeOwner | null {
  if (entry.lockedReason === null) return null

  const tokens = entry.lockedReason.trim().split(/\s+/)
  if (tokens[0] !== 'forge') return null

  const fields = new Map<string, string>()
  for (const token of tokens.slice(1)) {
    const separatorIndex = token.indexOf('=')
    if (separatorIndex === -1) continue
    fields.set(token.slice(0, separatorIndex), token.slice(separatorIndex + 1))
  }

  const runId = fields.get('run')
  const ticket = fields.get('ticket')
  const at = fields.get('at')
  const anchorPid = Number(fields.get('anchor'))
  if (!runId || !ticket || !at || !Number.isFinite(anchorPid)) return null

  return { runId, ticket, anchorPid, at }
}

export async function listWorktreeEntries(): Promise<WorktreeEntry[]> {
  const output = await Bun.$`git worktree list --porcelain`.text()
  return parseWorktreeEntries(output)
}

/**
 * `worktree-agent-<id>` branches map 1:1 to a `.claude/worktrees/agent-<id>`
 * directory. The branch itself carries no `%(worktreepath)` once the worker
 * checks out its own `ao-*` branch, so liveness has to be read from the
 * directory instead.
 */
export function isWorktreeAgentBranchLive(
  branchName: string,
  liveDirectoryNames: ReadonlySet<string>,
): boolean {
  const agentId = branchName.slice('worktree-'.length)
  return liveDirectoryNames.has(agentId)
}

/**
 * Resolves `<remote>/<trunk>`'s tree sha (e.g. `origin/main^{tree}`) —
 * `remote`/`trunk` come from a repo's `forge.config.json` (`repo.remote`,
 * `repo.trunk`; see `config.ts`), replacing what used to be a hardcoded
 * `origin/main` here. Every caller must fetch `remote` first (`cleanup.ts`
 * does, right before calling this) so classification is never made against a
 * stale local ref.
 */
export async function resolveMainTree(
  remote: string,
  trunk: string,
): Promise<string> {
  const ref = `${remote}/${trunk}`
  const output = await Bun.$`git rev-parse ${`${ref}^{tree}`}`.text()
  const tree = output.trim()
  if (tree.length === 0) {
    throw new Error(
      `could not resolve ${ref}'s tree — refusing to classify branches`,
    )
  }
  return tree
}

/**
 * `remote`/`trunk` are the same config-sourced values as
 * {@link resolveMainTree} — pass the identical pair used to compute
 * `mainTree` so the ancestor check and the merge-tree comparison agree on
 * what "merged" means.
 */
export async function classifyByContent(
  branch: string,
  mainTree: string,
  remote: string,
  trunk: string,
): Promise<ContentVerdict> {
  const ref = `${remote}/${trunk}`
  const ancestorCheck = await Bun.$`git merge-base --is-ancestor ${branch} ${ref}`
    .nothrow()
    .quiet()
  if (ancestorCheck.exitCode === 0) {
    return 'merged'
  }

  const merged = await Bun.$`git merge-tree --write-tree ${ref} ${branch}`
    .nothrow()
    .quiet()
  if (merged.exitCode !== 0) {
    return 'conflicted'
  }
  const resultTree = merged.stdout.toString().trim().split('\n', 1)[0] ?? ''
  if (resultTree.length === 0 || mainTree.length === 0) {
    return 'conflicted'
  }
  return resultTree === mainTree ? 'equivalent' : 'diverged'
}

export function isSafeToDelete(verdict: BranchVerdict): boolean {
  return verdict === 'merged' || verdict === 'equivalent'
}

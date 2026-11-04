import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  ForgeConfigError,
  requireForgeConfig,
  resolveRepoRoot,
  type ForgeConfig,
  type LandingMode,
} from "./config";
import {
  checkDependencies,
  createDependencyProbes,
  formatDependencyCheck,
  resolveBinaryOnPath,
  type DependencyCheck,
  type DependencyProbes,
} from "./dependencies";
import {
  classifyRun,
  isRunClosed,
  resolveIdleThresholdMs,
  resolveRunArtifactPath,
  resolveSessionSlug,
  type RunVerdict,
} from "./runs";
import {
  isSlotStale,
  listOccupiedSlots,
  resolveMaxLiveWorkers,
  resolveSlotsDirectory,
} from "./slots";
import { checkApproval, type ApprovalRecord } from "./approve";
import { isObject } from "./narrow";
import { readEnv, TODO_MARKER, TODO_MARKERS } from "./names";
import { listReservations } from "./claims";
import { resolveLandedVerdict, type LandedVerdict } from "./landed";
import { checkWorktreeForkBase, createEnvironmentProbes, type EnvironmentProbes } from "./doctor";
import { checkStale } from "./map";
import { validatePlan, type PlanTicket } from "./validate";
import {
  classifyByContent,
  findReservationForBranch,
  isAgentWorktree,
  isForeignWorktree,
  isSafeToDelete,
  isWorktreeAgentBranchLive,
  listBranches,
  listLiveWorktreeDirectoryNames,
  listWorktreeEntries,
  resolveMainTree,
  resolveWorktreeOwner,
  resolveWorktreeOwnerWithReservations,
  trunkReference,
  type WorktreeEntry,
  type WorktreeOwner,
} from "./worktrees";

/**
 * Local git/filesystem hygiene checks that must pass before `/forge`
 * dispatches its next wave of worktree workers. Read-only — this script
 * makes no changes, it only reports pass/fail per check. Deliberately
 * dependency-light: it never touches the Linear API, since that's a
 * separate, more expensive check `/forge`'s own Phase 0 already does by
 * reading the docs.
 *
 * `/forge` worktrees now carry their own liveness signal: `runs.ts`'s
 * {@link classifyRun} walks a worktree's owning run's anchor process (via
 * `resolveWorktreeOwner`'s parse of the `git worktree lock` reason each
 * worker writes at bootstrap, see `docs/agents/forge.md`) to tell a run
 * that's genuinely still going from one abandoned by a crashed or skipped
 * `forge:cleanup`. Only a worktree with no `/forge` lock reason at all
 * (pre-existing worktrees, or an ordinary interactive worktree unrelated to
 * `/forge`) falls back to `cleanup.ts`'s own merge/equivalence
 * classifier ({@link classifyByContent}).
 *
 * It does gate on third-party dependencies now (`dependencies.ts`): a repo
 * whose `tracker.kind` is `github` or `linear` refuses to dispatch while `gh`
 * or the Linear MCP server is verifiably unusable — never while that could
 * merely not be checked (see `evaluateDependencyGate`). This still never
 * calls the Linear API itself, only checks what `.mcp.json`/`claude mcp
 * list` declare. `FORGE_SKIP_DEPENDENCY_CHECKS=1` downgrades a blocking
 * finding to a warning for one invocation; it is deliberately not a CLI flag
 * — `preflight` is invoked unattended by the `/forge` coordinator, and a flag
 * is exactly what an agent would learn to add once its own gate turns red.
 */

function readFlagValue(flag: string): string | undefined {
  const flagIndex = process.argv.indexOf(flag);
  if (flagIndex === -1) return undefined;
  return process.argv[flagIndex + 1];
}

/**
 * Max agents `/forge` dispatches within a single wave — see
 * docs/agents/forge.md's "Concurrency" section. The cap check below fails
 * unless at least this many slots are free. Sourced from
 * `forge.config.json`'s `concurrency.waveSize` (no env override — none
 * existed before this config field did).
 */
function resolveWaveSize(config: ForgeConfig): number {
  return config.concurrency.waveSize;
}

/**
 * Config fields the schema marks deprecated because no code reads them. They
 * stay valid in existing configs; `forge doctor` warns when one is set.
 */
export const DEPRECATED_CONFIG_FIELDS: readonly string[] = [
  "repo.commitTypes",
  "repo.integrationBranch",
  "ticket.branchPattern",
  "ticket.idExample",
  "tracker.readyLabel",
  "tracker.triageLabels",
  "tracker.prReference",
  "schema.sharedDatabase",
  "commands.fullSuite.runInBackground",
  "commands.fullSuite.reset",
  "worktree.stateDir",
  "design.canvasIndex",
];

/**
 * Dependency probes for `config`'s tracker and landing mode: `gh` is only
 * required when the tracker is `github` or landing opens PRs.
 */
export function collectDependencyChecks(
  config: ForgeConfig,
  repoRoot: string,
  probes: DependencyProbes,
): Promise<readonly DependencyCheck[]> {
  return checkDependencies({
    tracker: config.tracker.kind,
    landingMode: config.landing.mode,
    repoRoot,
    probes,
  });
}

const SKIP_DEPENDENCY_CHECKS_KEY = "SKIP_DEPENDENCY_CHECKS";
const SKIP_DEPENDENCY_CHECKS_ENV = `EMET_${SKIP_DEPENDENCY_CHECKS_KEY}`;

function dependencyChecksSkipped(): boolean {
  return readEnv(SKIP_DEPENDENCY_CHECKS_KEY) === "1";
}

/**
 * Splits dependency checks into what blocks dispatch and what only warns —
 * kept pure and separate from the probing so the *gating policy* is what a
 * test exercises directly, without spawning anything. `indeterminate` always
 * warns, never blocks (see `dependencies.ts`'s module doc comment for why).
 * `options.skip` downgrades an `unsatisfied` finding to a warning rather than
 * silencing it, so `EMET_SKIP_DEPENDENCY_CHECKS=1` still shows what it
 * bypassed.
 */
export function evaluateDependencyGate(
  checks: readonly DependencyCheck[],
  options: { readonly skip: boolean },
): { readonly failures: readonly string[]; readonly warnings: readonly string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  for (const check of checks) {
    if (check.status === "indeterminate") {
      warnings.push(formatDependencyCheck(check, "  "));
    } else if (check.status === "unsatisfied") {
      if (options.skip) {
        warnings.push(
          `${formatDependencyCheck(check, "  ")} — downgraded by ${SKIP_DEPENDENCY_CHECKS_ENV}`,
        );
      } else {
        failures.push(formatDependencyCheck(check, "  "));
      }
    }
  }
  return { failures, warnings };
}

/**
 * Binaries the repo's own `preflight.requiredCommands` names — a check
 * distinct from `checkDependencies`, which asks whether a tracker's tool is
 * *usable* (installed, authenticated), not merely present. `alreadyCovered`
 * excludes a binary a dependency check already owns (`gh`, for a github
 * tracker) so one missing tool never produces two failures for the same
 * root cause. `resolve` is injectable so a test never has to shell out.
 */
export async function findMissingRequiredCommands(
  commands: readonly string[],
  alreadyCovered: ReadonlySet<string>,
  resolve: (binary: string) => Promise<boolean> = resolveBinaryOnPath,
): Promise<readonly string[]> {
  const missing: string[] = [];
  for (const command of commands) {
    if (alreadyCovered.has(command)) continue;
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    if (!(await resolve(command))) missing.push(command);
  }
  return missing;
}

export type WorktreeEntryVerdict =
  | { readonly kind: "detached"; readonly entry: WorktreeEntry }
  | {
      readonly kind: "own-run-leftover";
      readonly entry: WorktreeEntry;
      readonly owner: WorktreeOwner;
    }
  | {
      readonly kind: "other-run-live";
      readonly entry: WorktreeEntry;
      readonly owner: WorktreeOwner;
    }
  | {
      readonly kind: "idle";
      readonly entry: WorktreeEntry;
      readonly owner: WorktreeOwner;
    }
  | {
      readonly kind: "dead";
      readonly entry: WorktreeEntry;
      readonly owner: WorktreeOwner;
    }
  | {
      readonly kind: "closed";
      readonly entry: WorktreeEntry;
      readonly owner: WorktreeOwner;
    }
  | { readonly kind: "foreign"; readonly entry: WorktreeEntry }
  | {
      readonly kind: "content-fallback";
      readonly entry: WorktreeEntry;
      readonly branch: string;
    };

export interface ClassifyWorktreeEntryOptions {
  /** Enables the `foreign` verdict: without it every unowned entry is `content-fallback`. */
  readonly branchPrefix?: string;
  /** Runs this returns `true` for are `closed`, whatever their anchor process is doing. */
  readonly isRunClosed?: (runId: string) => boolean;
}

/**
 * Decides what one `.claude/worktrees/` entry means for preflight. A
 * detached worktree (no branch checked out) always needs a human. An
 * unowned entry (no `/forge` lock reason — pre-T1b, or an ordinary
 * interactive worktree doing unrelated feature work) falls back to
 * `classifyByContent`, decided by the caller since that classification is
 * async and git-backed. An owned entry defers to `classifyOwnerRun` (real
 * callers pass `classifyRun` from `runs.ts`; tests inject a fake) to
 * decide between four outcomes: a `'live'` owner matching the caller's own
 * `--run` is this run's own leftover from an interrupted attempt — still a
 * failure; a `'live'` owner that doesn't match (or no `--run` was given at
 * all) is informational only; `'idle'` is a warning, never a failure;
 * `'dead'` is reported as reclaimable, never a hard failure on its own. An
 * owner whose run is closed is `'closed'`, checked before liveness so a
 * finished run with a still-open coordinator is not live. With
 * `options.branchPrefix`, an unowned entry whose branch is not forge-shaped is
 * `'foreign'`; an unowned `<branchPrefix>-*` branch stays `content-fallback`.
 */
export function classifyWorktreeEntry(
  entry: WorktreeEntry,
  currentRunId: string | undefined,
  classifyOwnerRun: (owner: WorktreeOwner) => RunVerdict,
  resolveOwner: (entry: WorktreeEntry) => WorktreeOwner | null = resolveWorktreeOwner,
  options: ClassifyWorktreeEntryOptions = {},
): WorktreeEntryVerdict {
  if (!entry.branch) return { kind: "detached", entry };

  const owner = resolveOwner(entry);
  if (!owner) {
    if (
      options.branchPrefix !== undefined &&
      isForeignWorktree(entry, null, options.branchPrefix)
    ) {
      return { kind: "foreign", entry };
    }
    return { kind: "content-fallback", entry, branch: entry.branch };
  }

  if (options.isRunClosed?.(owner.runId) === true) return { kind: "closed", entry, owner };

  const runVerdict = classifyOwnerRun(owner);
  if (runVerdict === "live") {
    return owner.runId === currentRunId
      ? { kind: "own-run-leftover", entry, owner }
      : { kind: "other-run-live", entry, owner };
  }
  if (runVerdict === "idle") return { kind: "idle", entry, owner };
  return { kind: "dead", entry, owner };
}

/**
 * `emet init` writes a `TODO(forge):` marker into a generated
 * `docs/agents/*.md` file for anything it couldn't infer on its own — a
 * shared singleton resource, schema/migration ownership, a Linear team key
 * (see `src/init.ts`'s templates). A repo that still carries one hasn't
 * finished being set up: dispatching against it would mean `/forge` silently
 * guessing at something a human was supposed to fill in, exactly the
 * half-initialized-repo failure mode this check exists to block. Pure over
 * already-read file content so it's testable without touching disk.
 */
export function findTodoMarkers(fileName: string, content: string): string[] {
  return content
    .split("\n")
    .map((line, index) => ({ text: line.trim(), number: index + 1 }))
    .filter(({ text }) => TODO_MARKERS.some((marker) => text.includes(marker)))
    .map(({ text, number }) => `${fileName}:${number}: ${text}`);
}

/**
 * Scans every `docs/agents/*.md` file (not just `forge.md` — `emet init`'s
 * own templates also leave `TODO(forge):` markers in `issue-tracker.md` and
 * `domain.md`, so a check scoped to a single file would miss most of them)
 * for a leftover marker. Missing `docs/agents/` entirely is not itself a
 * failure here — that's a separate, pre-existing concern this check doesn't
 * own.
 */
export async function findTodoMarkersInDocsAgents(repoRoot: string): Promise<string[]> {
  const docsAgentsDirectory = path.join(repoRoot, "docs", "agents");
  if (!existsSync(docsAgentsDirectory)) return [];
  const entries = await readdir(docsAgentsDirectory);
  const markers: string[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(docsAgentsDirectory, entry);
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    const content = await Bun.file(filePath).text();
    markers.push(...findTodoMarkers(`docs/agents/${entry}`, content));
  }
  return markers;
}

export type SlotCapacityCheck = {
  readonly freeCount: number;
  readonly cap: number;
  readonly waveSize: number;
  /** `false` only when every slot is occupied — the one condition that
   * actually blocks dispatch outright. See the doc comment below for why
   * `freeCount < waveSize` alone is no longer this. */
  readonly ok: boolean;
  /** `true` when some, but fewer than `waveSize`, slots are free — this
   * wave can still dispatch, just fewer tickets than a full wave. Never
   * `true` when `ok` is `false` (0 free is reported via `ok` alone, not as
   * "degraded"). */
  readonly degraded: boolean;
};

/**
 * Can this wave dispatch *at all* right now — not "a full wave", just at
 * least one worker? A hard requirement of `freeCount >= waveSize` meant 5
 * busy slots out of 8 blocked a wave of even a single ticket, which is the
 * cap fighting the very thing it exists to protect: real host capacity was
 * never actually exhausted, only `waveSize`'s worth of it. `acquireSlot`
 * (`slots.ts`) is already per-worker and already drops just the one ticket
 * that couldn't get a slot, not the whole wave — this check now mirrors that
 * granularity instead of being stricter than the mechanism it's gating.
 * `freeCount === 0` is still a hard failure (nothing to dispatch against at
 * all); `0 < freeCount < waveSize` is `ok: true, degraded: true` (dispatch a
 * partial wave, note there's less room than a full one) — see `main()` for
 * how each is surfaced.
 *
 * Counting live claims and then deciding to dispatch would be read-then-
 * write, not atomic, and would race across two coordinators checking at the
 * same moment — the actual fix for that (N slots acquired one at a time via
 * `slots.ts`'s `acquireSlot`, immediately before each worker's `Agent` call)
 * belongs to dispatch time (Phase 6), out of this script's scope. This only
 * answers the capacity question ahead of time; it never acquires or
 * releases a slot itself. `isSlotFree` is injected so tests can simulate
 * "slots free" and "slots exhausted" without touching the filesystem —
 * production passes the negation of `slots.ts`'s {@link isSlotStale} over
 * each of the host-wide slot pool's indices.
 */
export function checkSlotCapacity(
  cap: number,
  waveSize: number,
  isSlotFree: (slotIndex: number) => boolean,
): SlotCapacityCheck {
  let freeCount = 0;
  for (let index = 0; index < cap; index++) {
    if (isSlotFree(index)) freeCount++;
  }
  return {
    freeCount,
    cap,
    waveSize,
    ok: freeCount > 0,
    degraded: freeCount > 0 && freeCount < waveSize,
  };
}

/**
 * The ticket id an unowned worker-shaped branch names: `cla-154-slug` with
 * prefix `cla` is `CLA-154`. `null` for any other branch shape, such as a
 * `worktree-agent-*` scaffold, which names no ticket.
 */
export function ticketFromWorkerBranch(branch: string, branchPrefix: string): string | null {
  const match = new RegExp(`^${branchPrefix.toLowerCase()}-(\\d+)(?:-|$)`, "i").exec(branch);
  return match?.[1] === undefined ? null : `${branchPrefix.toUpperCase()}-${match[1]}`;
}

export type WorktreeEntryReport = {
  readonly bucket: "fail" | "info" | "warn";
  readonly line: string;
};

/**
 * Turns one {@link WorktreeEntryVerdict} into a bucketed, printable line —
 * split out of `main()`'s loop (rather than a `switch` directly inside the
 * `for`) since `unicorn/no-break-in-nested-loop` flags a `break` nested two
 * levels deep as ambiguous. `'fail'` blocks dispatch; `'info'`/`'warn'`
 * never do.
 */
export async function describeWorktreeEntryVerdict(
  entry: WorktreeEntry,
  verdict: WorktreeEntryVerdict,
  mainTree: string,
  remote: string,
  trunk: string,
  local: boolean,
  resolveLanded: (branch: string) => Promise<LandedVerdict> = () => Promise.resolve("unknown"),
): Promise<WorktreeEntryReport> {
  switch (verdict.kind) {
    case "detached": {
      return {
        bucket: "fail",
        line: `  ${entry.directory}: detached, no branch — needs human review`,
      };
    }
    case "own-run-leftover": {
      return {
        bucket: "fail",
        line: `  ${entry.directory} (${entry.branch}): live — this run's own leftover from an interrupted attempt (run ${verdict.owner.runId}, ticket ${verdict.owner.ticket}) — run "emet cleanup --run ${verdict.owner.runId}" to clear it`,
      };
    }
    case "other-run-live": {
      return {
        bucket: "info",
        line: `  ${entry.directory} (${entry.branch}): live — owned by run ${verdict.owner.runId}, ticket ${verdict.owner.ticket}`,
      };
    }
    case "idle": {
      return {
        bucket: "warn",
        line: `  ${entry.directory} (${entry.branch}): idle since ${verdict.owner.at} — owned by run ${verdict.owner.runId}, ticket ${verdict.owner.ticket} (not blocking dispatch)`,
      };
    }
    case "dead": {
      return {
        bucket: "info",
        line: `  ${entry.directory} (${entry.branch}): dead — reclaimable via "emet cleanup --run ${verdict.owner.runId} --force" (or --all --force if abandoned)`,
      };
    }
    case "closed": {
      return {
        bucket: "info",
        line: `  ${entry.directory} (${entry.branch}): closed — run ${verdict.owner.runId} is finished (ticket ${verdict.owner.ticket}) — reclaimable via "emet cleanup"`,
      };
    }
    case "foreign": {
      return {
        bucket: "info",
        line: `  ${entry.directory} (${entry.branch}): foreign worktree — not an emet worker, left alone`,
      };
    }
    case "content-fallback":
    default: {
      if ((await resolveLanded(verdict.branch)) === "landed") {
        return {
          bucket: "info",
          line: `  ${entry.directory} (${verdict.branch}): unowned, but its ticket landed — safe to run "emet cleanup"`,
        };
      }
      const contentVerdict = await classifyByContent(verdict.branch, mainTree, remote, trunk, {
        local,
      });
      const trunkRef = local ? trunk : `${remote}/${trunk}`;
      const safe = isSafeToDelete(contentVerdict);
      const advice = safe
        ? `looks merged/equivalent to ${trunkRef} — safe to run "emet cleanup"`
        : `${contentVerdict} from ${trunkRef} — needs human review before cleanup, work could be lost`;
      /**
       * Merged/equivalent residue is harmless leftover, never a hazard to a
       * sibling coordinator — only genuinely unclassifiable content (still
       * diverged/conflicted against trunk, with no reservation to attribute
       * it either) blocks dispatch.
       */
      return {
        bucket: safe ? "info" : "fail",
        line: `  ${entry.directory} (${verdict.branch}): ${advice}`,
      };
    }
  }
}

export type PostDispatchFailure = {
  readonly kind:
    | "duplicate-ticket-worktree"
    | "duplicate-ticket-branch-number"
    | "unlocked-past-deadline"
    | "branch-ticket-mismatch"
    | "missing-worktrees";
  readonly message: string;
};

/**
 * Extracts a ticket's numeric suffix (`PROJ-321` → `321`, `NFK-42` → `42`) —
 * every tracker adapter's id shape (see `reference/tracker-*.md`) is
 * `<PREFIX>-<digits>`, so this stays a fixed shape regardless of
 * the configured `ticket.idPattern`, which only varies the prefix.
 */
function ticketNumber(ticket: string): string | null {
  const match = /-(\d+)$/.exec(ticket);
  return match ? (match[1] ?? null) : null;
}

/**
 * A worker's own branch convention (`docs/agents/forge.md`'s "Ticket ids
 * and branches") is `<branchPrefix>-<n>-<slug>` — this checks that a
 * worktree's checked-out branch actually names the same ticket number its
 * own lock declares, so a shell mis-routed to the wrong worktree fails
 * loudly instead of silently committing under someone else's ticket.
 *
 * `branchPrefix` is required, with no default: it used to fall back to
 * `'ao'` — the Linear team key of the single repo this CLI was extracted
 * from — which silently reported "branch doesn't match its ticket" in every
 * repo whose prefix isn't `ao`. A missing argument is now a type error
 * instead of a wrong answer.
 */
export function isBranchMatchingTicket(
  branch: string,
  ticket: string,
  branchPrefix: string,
): boolean {
  const loweredTicket = ticket.toLowerCase();
  if (!loweredTicket.startsWith(`${branchPrefix}-`)) {
    const fullStem = `${branchPrefix}-${loweredTicket}`;
    if (branch === fullStem || branch.startsWith(`${fullStem}-`)) return true;
    if (ticket === loweredTicket) return false;
  }
  const number = ticketNumber(ticket);
  if (!number) return false;
  return branch === `${branchPrefix}-${number}` || branch.startsWith(`${branchPrefix}-${number}-`);
}

/**
 * Groups `.claude/worktrees/` entries by the ticket their own `git worktree
 * lock` reason declares, keeping only groups with more than one member — the
 * PROJ-281 wave 2 failure mode: two worktrees claiming the same ticket, with
 * nothing distinguishing the canonical one from the duplicate.
 */
export function findDuplicateTicketWorktrees(
  entries: readonly WorktreeEntry[],
): Map<string, WorktreeEntry[]> {
  const byTicket = new Map<string, WorktreeEntry[]>();
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry);
    if (!owner) continue;
    const group = byTicket.get(owner.ticket) ?? [];
    group.push(entry);
    byTicket.set(owner.ticket, group);
  }
  for (const [ticket, group] of byTicket) {
    if (group.length < 2) byTicket.delete(ticket);
  }
  return byTicket;
}

/**
 * Groups `<branchPrefix>-<n>-*` branch names by their numeric ticket id,
 * keeping only groups with more than one member — catches the observed
 * `proj-284-starred-page` vs. `proj-284-starred-page-fixes` case, two branches
 * for the same ticket that {@link findDuplicateTicketWorktrees} alone can't
 * see once only one of them still has a live, locked worktree.
 *
 * `branchPrefix` is required for the same reason it is on
 * {@link isBranchMatchingTicket}: defaulting it to one repo's own `'ao'`
 * turned every other repo's duplicate branches invisible rather than
 * failing loudly.
 */
export function findDuplicateTicketBranchNumbers(
  branchNames: readonly string[],
  branchPrefix: string,
): Map<string, string[]> {
  const byNumber = new Map<string, string[]>();
  const branchPattern = new RegExp(`^${branchPrefix}-(\\d+)-`);
  const slugPattern = new RegExp(`^${branchPrefix}-([a-z][a-z0-9-]*?-\\d{2,})-`);
  for (const name of branchNames) {
    const match = slugPattern.exec(name) ?? branchPattern.exec(name);
    const number = match?.[1];
    if (!number) continue;
    const group = byNumber.get(number) ?? [];
    group.push(name);
    byNumber.set(number, group);
  }
  for (const [number, group] of byNumber) {
    if (group.length < 2) byNumber.delete(number);
  }
  return byNumber;
}

/**
 * `.claude/worktrees/` entries with no `git worktree lock` at all, more than
 * `maxAgeMs` past the caller-supplied reference time — the PROJ-321 case:
 * bootstrap step 0 (`reference/worker-prompt.md`, whose reason string comes
 * from `emet lock-reason`) was skipped, so `resolveWorktreeOwner` can never
 * attribute the worktree to a run and neither `emet cleanup` nor this
 * module's default mode can tell a canonical worktree from a duplicate.
 * `statMtimeMs` is injected (rather
 * than a direct `statSync` call) so tests can simulate ages without
 * touching the filesystem; production passes the directory's own mtime as a
 * stand-in for "time since this dispatch created it" — reasonable since this
 * audit only ever runs immediately after a dispatch, so any not-yet-locked
 * worktree under `.claude/worktrees/` was necessarily just created by it.
 */
export function findWorktreesMissingLockPastDeadline(
  entries: readonly WorktreeEntry[],
  maxAgeMs: number,
  nowMs: number,
  statMtimeMs: (directory: string) => number | null,
): WorktreeEntry[] {
  return entries.filter((entry) => {
    if (entry.lockedReason !== null) return false;
    const mtimeMs = statMtimeMs(entry.directory);
    if (mtimeMs === null) return false;
    return nowMs - mtimeMs > maxAgeMs;
  });
}

function buildDuplicateTicketWorktreeFailures(
  entries: readonly WorktreeEntry[],
): PostDispatchFailure[] {
  const failures: PostDispatchFailure[] = [];
  for (const [ticket, group] of findDuplicateTicketWorktrees(entries)) {
    failures.push({
      kind: "duplicate-ticket-worktree",
      message: `${ticket} is claimed by ${group.length} worktrees — pick the canonical one, delete/re-lock the rest:\n${group.map((entry) => `  ${entry.directory} (${entry.branch ?? "detached"}, HEAD ${entry.head ?? "unknown"})`).join("\n")}`,
    });
  }
  return failures;
}

function buildDuplicateTicketBranchNumberFailures(
  branchNames: readonly string[],
  branchPrefix: string,
): PostDispatchFailure[] {
  const failures: PostDispatchFailure[] = [];
  for (const [number, names] of findDuplicateTicketBranchNumbers(branchNames, branchPrefix)) {
    failures.push({
      kind: "duplicate-ticket-branch-number",
      message: `Ticket ${branchPrefix.toUpperCase()}-${number} has ${names.length} branches: ${names.join(", ")} — one of these was created in error.`,
    });
  }
  return failures;
}

function buildUnlockedPastDeadlineFailures(
  entries: readonly WorktreeEntry[],
  maxAgeMs: number,
  nowMs: number,
  statMtimeMs: (directory: string) => number | null,
): PostDispatchFailure[] {
  return findWorktreesMissingLockPastDeadline(entries, maxAgeMs, nowMs, statMtimeMs).map(
    (entry) => ({
      kind: "unlocked-past-deadline",
      message: `${entry.directory} has no git worktree lock ${Math.round(maxAgeMs / 1000)}s+ after dispatch — the worker skipped bootstrap step 0. Re-lock it with: git worktree lock ${entry.directory} --reason "$(emet lock-reason --run <runId> --ticket <ticket>)"`,
    }),
  );
}

/**
 * Whether `entry` is still on its own `Agent`-generated scaffold branch
 * (`worktree-<directory-basename>`) — the state every worktree is in for the
 * brief window between bootstrap step 0 (`git worktree lock`, which needs no
 * checkout) and the worker's own `git checkout -b <branchPrefix>-<n>-*`. Not
 * a mismatch with *any* ticket, since nothing has gone wrong yet — just not
 * finished bootstrapping.
 */
function isOwnScaffoldBranch(entry: WorktreeEntry): boolean {
  if (!entry.branch) return false;
  return entry.branch === `worktree-${path.basename(entry.directory)}`;
}

/**
 * A worktree's checked-out branch not matching its own lock's ticket — a
 * shell mis-routed to the wrong worktree. Scoped by whichever `entries` the
 * caller passes: `auditPostDispatch` passes everything (no run to scope by),
 * `mainPostDispatch` passes only entries it has already attributed to the
 * current run, so a sibling coordinator's own unrelated mismatch never fails
 * *this* run's audit.
 *
 * **Tolerates the bootstrap-in-progress race**: `reference/worker-prompt.md`
 * has a worker lock its worktree (step 0) *before* checking out its ticket
 * branch — if this audit runs in the brief window between those two steps
 * (real runs measured this happening, always resolved by a same-run retry a
 * few seconds later), the entry is still on its own scaffold branch
 * ({@link isOwnScaffoldBranch}), not some *other* ticket's branch. That's
 * never treated as a mismatch as long as the lock is younger than `maxAgeMs`
 * — past that, `unlocked-past-deadline`'s sibling check already covers a
 * worker that never got past step 0, and any scaffold branch surviving this
 * long really is worth flagging. `nowMs`/`maxAgeMs` default to real time and
 * `POST_DISPATCH_UNLOCKED_MAX_AGE_MS` so every existing call site keeps
 * working unchanged; tests inject both.
 */
export function findBranchTicketMismatches(
  entries: readonly WorktreeEntry[],
  branchPrefix: string,
  options: { readonly nowMs?: number; readonly maxAgeMs?: number } = {},
): PostDispatchFailure[] {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? POST_DISPATCH_UNLOCKED_MAX_AGE_MS;
  const failures: PostDispatchFailure[] = [];
  for (const entry of entries) {
    const owner = resolveWorktreeOwner(entry);
    if (!owner || !entry.branch) continue;
    if (isBranchMatchingTicket(entry.branch, owner.ticket, branchPrefix)) continue;
    if (isOwnScaffoldBranch(entry)) {
      const lockedAtMs = Date.parse(owner.at);
      if (Number.isFinite(lockedAtMs) && nowMs - lockedAtMs <= maxAgeMs) continue;
    }
    failures.push({
      kind: "branch-ticket-mismatch",
      message: `${entry.directory} is checked out on branch ${entry.branch}, but its own lock names ticket ${owner.ticket} — a shell was likely routed to the wrong worktree.`,
    });
  }
  return failures;
}

/**
 * Which of `expectedTickets` (this run's own slot holdings — see
 * `mainPostDispatch`) have no matching entry in `mineEntries` (worktrees
 * already attributed to this run). Empty means every ticket this run
 * dispatched has a locked worktree accounted for.
 */
export function findMissingTicketsForRun(
  mineEntries: readonly WorktreeEntry[],
  expectedTickets: readonly string[],
): string[] {
  const claimed = new Set(
    mineEntries
      .map((entry) => resolveWorktreeOwner(entry)?.ticket)
      .filter((ticket): ticket is string => Boolean(ticket)),
  );
  return expectedTickets.filter((ticket) => !claimed.has(ticket));
}

/**
 * The four post-dispatch gates from `docs/agents/forge.md` — run once,
 * immediately after a wave's batch of parallel `Agent` calls returns, before
 * any worker has had a chance to commit. Unlike the default preflight mode
 * above (which only ever warns/informs about a live worktree), every finding
 * here is a hard failure: each one means dispatch itself went wrong, not
 * that a long-running worker is merely still in flight.
 *
 * Runs every check over exactly the `entries`/`ticketBranchNames` given, with
 * no run-scoping of its own — `mainPostDispatch` is what decides which
 * entries enter this audit at all, and additionally runs the run-scoped
 * missing-worktrees check this function doesn't know about (it has no
 * `runId` or slot data to compare against).
 */
export function auditPostDispatch(
  entries: readonly WorktreeEntry[],
  ticketBranchNames: readonly string[],
  options: {
    readonly maxUnlockedAgeMs: number;
    readonly nowMs: number;
    readonly statMtimeMs: (directory: string) => number | null;
    /** `ticket.branchPrefix` from `forge.config.json`. Required — see
     * {@link isBranchMatchingTicket} for why this no longer defaults. */
    readonly branchPrefix: string;
  },
): PostDispatchFailure[] {
  return [
    ...buildDuplicateTicketWorktreeFailures(entries),
    ...buildDuplicateTicketBranchNumberFailures(ticketBranchNames, options.branchPrefix),
    ...buildUnlockedPastDeadlineFailures(
      entries,
      options.maxUnlockedAgeMs,
      options.nowMs,
      options.statMtimeMs,
    ),
    ...findBranchTicketMismatches(entries, options.branchPrefix, {
      nowMs: options.nowMs,
      maxAgeMs: options.maxUnlockedAgeMs,
    }),
  ];
}

/**
 * Generous relative to how fast `git worktree lock` actually runs
 * (sub-second) — this only exists to give a worker's own bootstrap script a
 * fair chance to reach bootstrap step 0 before the coordinator's audit runs,
 * not to model any real expected latency.
 */
const POST_DISPATCH_UNLOCKED_MAX_AGE_MS = 30_000;

function statDirectoryMtimeMs(directory: string): number | null {
  try {
    return statSync(directory).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * `--post-dispatch` mode: run once, immediately after a wave's batch of
 * parallel `Agent` calls returns, before any worker has had a chance to
 * commit.
 *
 * **Scoping used to be by path** (`isOwnAgentWorktree(entry, repoRoot)`) —
 * every entry under the *coordinator's own* `repoRoot`'s `.claude/worktrees/`
 * was "mine", everything else invisible, on the assumption that a dispatched
 * agent worktree always nests under the launching worktree. That assumption
 * is false under Orca (see `worktrees.ts`'s `isAgentWorktree` doc comment and
 * `reference/incidents.md`), so this now scopes by **run**, using
 * {@link resolveWorktreeOwner}'s `runId` — the one signal that actually
 * identifies whose dispatch a worktree belongs to, regardless of where
 * `isolation: "worktree"` physically put it:
 *
 * - **duplicate-ticket-worktree / duplicate-ticket-branch-number**: run over
 *   *every* agent worktree/branch on the repo, any run — these only ever
 *   fire when the *same ticket* appears twice, which a sibling coordinator's
 *   own (necessarily different) ticket can never trigger, so there is
 *   nothing to falsely fail here by widening the scope.
 * - **branch-ticket-mismatch**: scoped to entries this run's own `--run
 *   <runId>` owns — a sibling's unrelated mismatch is that sibling's audit
 *   to fail, not this one's.
 * - **missing-worktrees** (new): the real fix for the "0 worktree(s)
 *   checked" vacuous pass. This run's own slot holdings (each worker
 *   acquires its slot immediately before its `Agent` call, per Phase 6 —
 *   see `slots.ts`) say how many tickets this wave dispatched; if fewer
 *   locked worktrees are attributed to this run than that, something is
 *   wrong — a worker skipped bootstrap, or `isolation: "worktree"` put it
 *   somewhere unexpected — and this now **fails**, listing any stale
 *   unlocked candidates as leads, rather than silently reporting `0
 *   worktree(s) checked ... OK`. `--expect <n>` overrides the slot-derived
 *   count for a coordinator that dispatched without acquiring slots.
 *
 * With no `--run` given at all (an ad-hoc/manual invocation — every
 * documented dispatch always passes it), this falls back to the old
 * behavior: every check runs globally, best-effort, since there is no run to
 * scope by.
 */
async function mainPostDispatch(config: ForgeConfig): Promise<void> {
  const branchPrefix = config.ticket.branchPrefix;
  const currentRunId = readFlagValue("--run");
  const explicitExpectRaw = readFlagValue("--expect");

  const allWorktreeEntries = await listWorktreeEntries();
  const agentEntries = allWorktreeEntries.filter((entry) => isAgentWorktree(entry.directory));
  const ticketBranches = await listBranches(`${branchPrefix}-*`);
  const agentTicketBranchNames = ticketBranches
    .filter((branch) => isAgentWorktree(branch.worktreePath))
    .map((branch) => branch.name);

  const nowMs = Date.now();
  const failures: PostDispatchFailure[] = [
    ...buildDuplicateTicketWorktreeFailures(agentEntries),
    ...buildDuplicateTicketBranchNumberFailures(agentTicketBranchNames, branchPrefix),
  ];

  if (!currentRunId) {
    failures.push(
      ...buildUnlockedPastDeadlineFailures(
        agentEntries,
        POST_DISPATCH_UNLOCKED_MAX_AGE_MS,
        nowMs,
        statDirectoryMtimeMs,
      ),
      ...findBranchTicketMismatches(agentEntries, branchPrefix, {
        nowMs,
        maxAgeMs: POST_DISPATCH_UNLOCKED_MAX_AGE_MS,
      }),
    );
    if (failures.length > 0) {
      console.error("emet preflight --post-dispatch failed:\n");
      for (const failure of failures) console.error(`- ${failure.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `emet preflight --post-dispatch OK — ${agentEntries.length} worktree(s) checked (no --run given, so not scoped to any one dispatch), no ticket/branch duplicates, no unlocked stragglers.`,
    );
    return;
  }

  const reservations = await listReservations();
  const mineEntries = agentEntries.filter(
    (entry) =>
      resolveWorktreeOwnerWithReservations(entry, reservations, branchPrefix)?.runId ===
      currentRunId,
  );
  failures.push(
    ...findBranchTicketMismatches(mineEntries, branchPrefix, {
      nowMs,
      maxAgeMs: POST_DISPATCH_UNLOCKED_MAX_AGE_MS,
    }),
  );

  const expectedTickets =
    explicitExpectRaw === undefined
      ? (await listOccupiedSlots())
          .filter((entry) => entry.holder.runId === currentRunId)
          .map((entry) => entry.holder.ticket)
      : [];
  const explicitExpectedCount =
    explicitExpectRaw !== undefined ? Number(explicitExpectRaw) : undefined;
  const expectationKnown =
    expectedTickets.length > 0 ||
    (explicitExpectedCount !== undefined && explicitExpectedCount > 0);

  if (expectationKnown) {
    const missingTickets = findMissingTicketsForRun(mineEntries, expectedTickets);
    const missingCount =
      explicitExpectedCount !== undefined
        ? Math.max(0, explicitExpectedCount - mineEntries.length)
        : missingTickets.length;

    if (missingCount > 0) {
      /**
       * Only worktrees a *sibling's* reservation doesn't already explain are
       * real leads for this run's missing ticket(s) — an unlocked worktree
       * the harness dropped the lock on for a sibling's already-finished
       * worker (see `reference/incidents.md`) is not a candidate for this
       * run's own dispatch, and pointing at it wastes the coordinator's time
       * chasing another run's worktree.
       */
      const unlockedCandidates = agentEntries.filter((entry) => {
        if (entry.lockedReason !== null) return false;
        const reservationOwner = entry.branch
          ? findReservationForBranch(entry.branch, branchPrefix, reservations)
          : null;
        return !reservationOwner || reservationOwner.runId === currentRunId;
      });
      const stale = findWorktreesMissingLockPastDeadline(
        unlockedCandidates,
        POST_DISPATCH_UNLOCKED_MAX_AGE_MS,
        nowMs,
        statDirectoryMtimeMs,
      );
      const ticketsNote =
        expectedTickets.length > 0
          ? ` (tickets: ${expectedTickets.join(", ")}${missingTickets.length > 0 ? `; missing: ${missingTickets.join(", ")}` : ""})`
          : "";
      const staleNote =
        stale.length > 0
          ? ` ${stale.length} unlocked worktree(s) past the ${Math.round(POST_DISPATCH_UNLOCKED_MAX_AGE_MS / 1000)}s deadline may be the missing one(s) — a worker may have skipped bootstrap step 0:\n${stale.map((entry) => `  ${entry.directory}`).join("\n")}`
          : ' No unlocked candidate worktrees were found either — check where isolation:"worktree" actually placed them (see reference/incidents.md).';
      failures.push({
        kind: "missing-worktrees",
        message: `Expected ${explicitExpectedCount ?? expectedTickets.length} locked worktree(s) for run ${currentRunId}${ticketsNote}, found ${mineEntries.length}.${staleNote}`,
      });
    }
  }

  if (failures.length > 0) {
    console.error("emet preflight --post-dispatch failed:\n");
    for (const failure of failures) console.error(`- ${failure.message}`);
    process.exitCode = 1;
    return;
  }

  if (mineEntries.length === 0 && agentEntries.length > 0 && !expectationKnown) {
    console.log(
      `emet preflight --post-dispatch OK — but 0 of run ${currentRunId}'s worktree(s) were attributed out of ${agentEntries.length} agent worktree(s) present, and no slot/--expect data was available to check for a miss. Verify by hand: "emet slots --list" and "git worktree list --porcelain".`,
    );
    return;
  }

  console.log(
    `emet preflight --post-dispatch OK — ${mineEntries.length} of run ${currentRunId}'s worktree(s) checked (${agentEntries.length} total across every /emet coordinator in this repo), no ticket/branch duplicates, no unlocked stragglers.`,
  );
}

export type RunGateFindings = {
  readonly failures: readonly string[];
  readonly warnings: readonly string[];
};

function readApprovalRecord(approvalPath: string): ApprovalRecord | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(approvalPath, "utf8"));
    if (!isObject(parsed)) return null;
    const { specPath, ticketsPath, specHash, ticketsHash, approvedAt } = parsed;
    if (
      typeof specPath !== "string" ||
      typeof ticketsPath !== "string" ||
      typeof specHash !== "string" ||
      typeof ticketsHash !== "string" ||
      typeof approvedAt !== "string"
    ) {
      return null;
    }
    return { specPath, ticketsPath, specHash, ticketsHash, approvedAt };
  } catch {
    return null;
  }
}

function stringsOrEmpty(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function toPlanTickets(raw: unknown): PlanTicket[] {
  const list = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw.tickets)
      ? raw.tickets
      : null;
  if (list === null) throw new Error('tickets file must be an array (or {"tickets": [...]})');
  const tickets: PlanTicket[] = [];
  for (const [index, entry] of list.entries()) {
    const candidate: Record<string, unknown> = isObject(entry) ? entry : {};
    if (typeof candidate.id !== "string") throw new Error(`ticket ${index} needs an "id"`);
    tickets.push({
      id: candidate.id,
      covers: stringsOrEmpty(candidate.covers),
      surfaces: stringsOrEmpty(candidate.surfaces),
      wave: typeof candidate.wave === "number" ? candidate.wave : 1,
      blockedBy: stringsOrEmpty(candidate.blockedBy),
      ...(typeof candidate.newSurfaceLines === "number"
        ? { newSurfaceLines: candidate.newSurfaceLines }
        : {}),
      folded: candidate.folded === true,
    });
  }
  return tickets;
}

/**
 * The directory holding a run's `approval.json`: the shared git-common-dir
 * location first, then the legacy `<repoRoot>/.forge/runs/<id>/`. A run with
 * no approval anywhere resolves to the shared write location, so the gate
 * reports the missing record there.
 */
export async function resolveApprovalDirectory(
  runId: string,
  repoRoot: string,
  commonDirectory?: string,
): Promise<string> {
  const location = await resolveRunArtifactPath(runId, "approval.json", {
    repoRoot,
    ...(commonDirectory === undefined ? {} : { commonDirectory }),
  });
  return path.dirname(location.readPath ?? location.writePath);
}

/**
 * S9 + S15: dispatch refuses when the approved spec/tickets changed
 * (`approve --check`) and when the approved plan no longer validates
 * (`validate`). Both read the paths recorded in the run's approval record.
 */
export function evaluateRunGate(
  runDirectory: string,
  options: { readonly inlineMaxLines: number },
): RunGateFindings {
  const failures: string[] = [];
  const warnings: string[] = [];
  const approvalPath = path.join(runDirectory, "approval.json");
  const approval = checkApproval(approvalPath);
  if (!approval.ok) {
    for (const reason of approval.reasons) failures.push(`approval: ${reason}`);
    return { failures, warnings };
  }
  const record = readApprovalRecord(approvalPath);
  if (record === null) return { failures: ["approval: record unreadable"], warnings };
  try {
    const result = validatePlan({
      specMarkdown: readFileSync(record.specPath, "utf8"),
      tickets: toPlanTickets(JSON.parse(readFileSync(record.ticketsPath, "utf8"))),
      inlineMaxLines: options.inlineMaxLines,
    });
    for (const finding of result.findings) {
      const line = `validate: ${finding.message}`;
      if (finding.severity === "error") failures.push(line);
      else warnings.push(line);
    }
  } catch (error) {
    failures.push(`validate: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { failures, warnings };
}

/** S2: the harness must fork worker worktrees from the coordinator's HEAD. */
export async function collectForkBaseFailures(
  repoRoot: string,
  remote: string,
  trunk: string,
  probes: EnvironmentProbes,
  landingMode: LandingMode = "pr",
): Promise<string[]> {
  const harnessBaseRef = landingMode === "merge" ? trunk : `${remote}/${trunk}`;
  return checkWorktreeForkBase({
    coordinatorHead: await probes.resolveRef(repoRoot, "HEAD"),
    harnessBase: await probes.resolveRef(repoRoot, harnessBaseRef),
    baseRefSetting: await probes.worktreeBaseRef(repoRoot),
    harnessBaseRef,
  });
}

/** Result of {@link checkHeadDescendsFromTrunk}. */
export type HeadDescendsFromTrunkResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly branch: string; readonly fix: string };

/** Single-quotes `value` for a copy-pasteable shell command unless it is plainly safe. */
function shellQuote(value: string): string {
  return /^[\w./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * S11: HEAD must equal `trunkRef` or descend from it, so workers branch from
 * a trunk that already holds the records their tickets cite. On failure
 * names the current branch and the exact command that fixes it; `localTrunk`
 * is the plain trunk branch name the fix switches to.
 */
export async function checkHeadDescendsFromTrunk(
  headSha: string,
  trunkRef: string,
  localTrunk: string = trunkRef,
  remote: string = "origin",
): Promise<HeadDescendsFromTrunkResult> {
  const ancestry = await Bun.$`git merge-base --is-ancestor ${trunkRef} ${headSha}`
    .quiet()
    .nothrow();
  if (ancestry.exitCode === 0) return { ok: true };
  const branchName = (await Bun.$`git rev-parse --abbrev-ref HEAD`.quiet().nothrow().text()).trim();
  const branch =
    branchName === "HEAD" || branchName === "" ? `detached HEAD at ${headSha}` : branchName;
  const fix =
    trunkRef === localTrunk
      ? `git switch ${shellQuote(localTrunk)}`
      : `git fetch ${shellQuote(remote)} ${shellQuote(localTrunk)} && git switch ${shellQuote(localTrunk)} && git merge --ff-only ${shellQuote(trunkRef)}`;
  return { ok: false, branch, fix };
}

/** Paths Phase 5 defers, which must already be on trunk before dispatch. */
const PHASE_FIVE_RECORD_PATHS = ["GLOSSARY.md", "docs/adr/"] as const;

/**
 * S10: `GLOSSARY.md` and `docs/adr/` must match `trunkRef`, in commits and in
 * the working tree, so a worker branching from trunk sees every record a
 * ticket cites. Lists the differing or untracked paths on failure.
 */
export async function checkPhaseFiveRecordsLanded(
  trunkRef: string,
  repoRoot: string = process.cwd(),
): Promise<{ ok: true } | { ok: false; paths: string[] }> {
  const changed = await Bun.$`git diff --name-only ${trunkRef} -- ${PHASE_FIVE_RECORD_PATHS}`
    .cwd(repoRoot)
    .quiet()
    .nothrow()
    .text();
  const untracked =
    await Bun.$`git ls-files --others --exclude-standard -- ${PHASE_FIVE_RECORD_PATHS}`
      .cwd(repoRoot)
      .quiet()
      .nothrow()
      .text();
  const paths = [...new Set(`${changed}\n${untracked}`.split("\n").filter(Boolean))];
  return paths.length === 0 ? { ok: true } : { ok: false, paths };
}

/** The S11 preflight failure line, or `null` when HEAD descends from trunk. */
async function collectHeadTrunkFailure(
  repoRoot: string,
  remote: string,
  trunk: string,
  probes: EnvironmentProbes,
  landingMode: LandingMode = "pr",
): Promise<string | null> {
  const trunkRef = trunkReference(remote, trunk, landingMode === "merge");
  const headSha = await probes.resolveRef(repoRoot, "HEAD");
  if (headSha === null) return null;
  const verdict = await checkHeadDescendsFromTrunk(headSha, trunkRef, trunk, remote);
  if (verdict.ok) {
    const records = await checkPhaseFiveRecordsLanded(trunkRef, repoRoot);
    if (records.ok) return null;
    return `Phase 5 records are not on ${trunkRef}: ${records.paths.join(", ")} — land them on trunk (PR, or local merge) before dispatch.`;
  }
  return `HEAD (${verdict.branch}) is not ${trunkRef} or a descendant of it — dispatch from trunk so workers contain Phase 5's landed records. Fix: ${verdict.fix}`;
}

const MAP_STALE_MAX_COMMITS = 10;

/** S18: a stale or missing codebase map only warns, never blocks. */
export async function collectMapStaleWarning(
  repoRoot: string,
  mapRelativePath: string,
): Promise<string | null> {
  const verdict = await checkStale(repoRoot, mapRelativePath, MAP_STALE_MAX_COMMITS);
  return verdict.stale ? `codebase map is stale — ${verdict.reason}; run "emet map"` : null;
}

/** The run ids among `owners` whose closed marker exists. */
async function collectClosedRunIds(
  owners: readonly (WorktreeOwner | null)[],
): Promise<ReadonlySet<string>> {
  const runIds = new Set<string>();
  for (const owner of owners) {
    if (owner !== null) runIds.add(owner.runId);
  }
  const closed = new Set<string>();
  await Promise.all(
    [...runIds].map(async (runId) => {
      if (await isRunClosed(runId)) closed.add(runId);
    }),
  );
  return closed;
}

async function main(config: ForgeConfig, repoRoot: string) {
  const currentRunId = readFlagValue("--run");
  const failures: string[] = [];
  const infoLines: string[] = [];
  const warnLines: string[] = [];
  const dependencyWarnLines: string[] = [];
  const gateWarnLines: string[] = [];

  /**
   * Kicked off first so these probes (each capped at
   * DEPENDENCY_PROBE_TIMEOUT_MS) run concurrently with the git/filesystem
   * work below rather than adding their own latency on top of it.
   */
  const dependencyChecksPromise = collectDependencyChecks(
    config,
    repoRoot,
    createDependencyProbes(),
  );

  for (const required of config.preflight.requiredFiles) {
    if (!existsSync(path.join(repoRoot, required.path))) {
      failures.push(`${required.path} is missing at the repo root — ${required.why}`);
    }
  }

  const approvalRunId = readFlagValue("--approval");
  if (approvalRunId !== undefined) {
    const gate = evaluateRunGate(await resolveApprovalDirectory(approvalRunId, repoRoot), {
      inlineMaxLines: config.sizing.inlineMaxLines,
    });
    failures.push(...gate.failures);
    gateWarnLines.push(...gate.warnings);
  }

  failures.push(
    ...(await collectForkBaseFailures(
      repoRoot,
      config.repo.remote,
      config.repo.trunk,
      createEnvironmentProbes(),
      config.landing.mode,
    )),
  );

  const headTrunkFailure = await collectHeadTrunkFailure(
    repoRoot,
    config.repo.remote,
    config.repo.trunk,
    createEnvironmentProbes(),
    config.landing.mode,
  );
  if (headTrunkFailure !== null) failures.push(headTrunkFailure);

  const mapWarning = await collectMapStaleWarning(repoRoot, config.map.path);
  if (mapWarning !== null) gateWarnLines.push(mapWarning);

  const todoMarkers = await findTodoMarkersInDocsAgents(repoRoot);
  if (todoMarkers.length > 0) {
    failures.push(
      `docs/agents/ still has ${todoMarkers.length} ${TODO_MARKER} marker(s) — fill these in (or run "emet init --force" after resolving them) before dispatching:\n${todoMarkers.map((m) => `  ${m}`).join("\n")}`,
    );
  }

  const liveWorktreeDirectoryNames = await listLiveWorktreeDirectoryNames();

  const worktreeAgentBranches = await listBranches("worktree-agent-*");
  const orphanedScaffoldBranches = worktreeAgentBranches.filter(
    (branch) => !isWorktreeAgentBranchLive(branch.name, liveWorktreeDirectoryNames),
  );
  if (orphanedScaffoldBranches.length > 0) {
    /**
     * Always safe to delete, per this repo's own message below — a sibling
     * coordinator's own leftover residue is never a reason to fail *this*
     * coordinator's dispatch.
     */
    warnLines.push(
      `Orphaned worktree-agent-* scaffold branches (their worktree is already gone) — run "emet cleanup" (it deletes only those already merged into trunk):\n${orphanedScaffoldBranches.map((b) => `  ${b.name}`).join("\n")}`,
    );
  }

  const allWorktreeEntries = await listWorktreeEntries();
  const worktreeEntries = allWorktreeEntries.filter((entry) => isAgentWorktree(entry.directory));
  if (worktreeEntries.length > 0) {
    const local = config.landing.mode === "merge";
    const mainTree = await resolveMainTree(config.repo.remote, config.repo.trunk, { local });
    const idleThresholdMs = resolveIdleThresholdMs(config);
    const worktreeFailLines: string[] = [];
    /**
     * The harness's own `Agent({isolation: "worktree"})` unlocks a worker's
     * worktree the moment its agent process exits, dropping the `/forge`
     * lock reason `resolveWorktreeOwner` needs (see `reference/incidents.md`
     * — "the harness drops the forge lock when an agent exits"). Ticket
     * reservations (`claims.ts`) outlive that lock, so an unlocked worktree
     * still gets attributed to its real owning run instead of falling
     * through to the unowned `content-fallback` path.
     */
    const reservations = await listReservations();
    const resolveOwnerForEntry = (candidate: WorktreeEntry) =>
      resolveWorktreeOwnerWithReservations(candidate, reservations, config.ticket.branchPrefix);
    const closedRunIds = await collectClosedRunIds(
      worktreeEntries.map((candidate) => resolveOwnerForEntry(candidate)),
    );
    const resolveLanded = (branch: string): Promise<LandedVerdict> => {
      const ticket = ticketFromWorkerBranch(branch, config.ticket.branchPrefix);
      return ticket === null
        ? Promise.resolve("unknown")
        : resolveLandedVerdict({ ticket, branch }, { config });
    };

    for (const entry of worktreeEntries) {
      const verdict = classifyWorktreeEntry(
        entry,
        currentRunId,
        (owner) =>
          classifyRun(
            owner.anchorPid,
            /**
             * The coordinator's transcript lives under *its own* project
             * slug, not this worktree's directory — see `WorktreeOwner`'s doc
             * comment (worktrees.ts). Fall back to the directory-derived guess
             * only for a lock reason written before `slug=` existed.
             */
            owner.coordinatorSlug ?? resolveSessionSlug(entry.directory),
            owner.runId,
            { idleThresholdMs },
          ),
        resolveOwnerForEntry,
        {
          branchPrefix: config.ticket.branchPrefix,
          isRunClosed: (runId) => closedRunIds.has(runId),
        },
      );
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
      const report = await describeWorktreeEntryVerdict(
        entry,
        verdict,
        mainTree,
        config.repo.remote,
        config.repo.trunk,
        local,
        resolveLanded,
      );
      if (report.bucket === "fail") worktreeFailLines.push(report.line);
      else if (report.bucket === "info") infoLines.push(report.line);
      else warnLines.push(report.line);
    }

    if (worktreeFailLines.length > 0) {
      failures.push(
        `.claude/worktrees/ has entries needing attention:\n${worktreeFailLines.join("\n")}`,
      );
    }
  }

  const slotsDirectory = await resolveSlotsDirectory();
  const capacityCheck = checkSlotCapacity(
    resolveMaxLiveWorkers(config),
    resolveWaveSize(config),
    (index) => isSlotStale(slotsDirectory, index),
  );
  const capacityWarnLines: string[] = [];
  if (!capacityCheck.ok) {
    failures.push(
      `No free worker slots at all: 0 free out of ${capacityCheck.cap} — every slot is held by a live or idle run. Wait for one to free up, or "emet cleanup" to reclaim finished runs ("emet slots --list" shows who holds each slot).`,
    );
  } else if (capacityCheck.degraded) {
    capacityWarnLines.push(
      `  only ${capacityCheck.freeCount}/${capacityCheck.cap} worker slot(s) free — this wave can dispatch at most ${capacityCheck.freeCount} of its usual ${capacityCheck.waveSize}; the rest drop from this wave the same way a single denied "emet slots --acquire" already does.`,
    );
  }

  const dependencyChecks = await dependencyChecksPromise;
  const dependencyGate = evaluateDependencyGate(dependencyChecks, {
    skip: dependencyChecksSkipped(),
  });
  failures.push(...dependencyGate.failures);
  dependencyWarnLines.push(...dependencyGate.warnings);

  const coveredByDependencyChecks = new Set(
    dependencyChecks.some((check) => check.dependency === "github-cli") ? ["gh"] : [],
  );
  const missingRequiredCommands = await findMissingRequiredCommands(
    config.preflight.requiredCommands,
    coveredByDependencyChecks,
  );
  if (missingRequiredCommands.length > 0) {
    failures.push(`preflight.requiredCommands not on PATH: ${missingRequiredCommands.join(", ")}.`);
  }

  if (infoLines.length > 0) {
    console.log(
      `Info — live/reclaimable /emet worktrees (not blocking dispatch):\n${infoLines.join("\n")}\n`,
    );
  }
  if (warnLines.length > 0) {
    console.log(
      `Warning — idle /emet worktrees (not blocking dispatch):\n${warnLines.join("\n")}\n`,
    );
  }
  if (gateWarnLines.length > 0) {
    console.log(
      `Warning — plan/map (not blocking dispatch):\n${gateWarnLines.map((line) => `  ${line}`).join("\n")}\n`,
    );
  }
  if (dependencyWarnLines.length > 0) {
    console.log(
      `Warning — dependencies (not blocking dispatch):\n${dependencyWarnLines.join("\n")}\n`,
    );
  }
  if (capacityWarnLines.length > 0) {
    console.log(
      `Warning — worker capacity (not blocking dispatch):\n${capacityWarnLines.join("\n")}\n`,
    );
  }

  if (failures.length > 0) {
    console.error("emet preflight failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const requiredFilesSummary =
    config.preflight.requiredFiles.length > 0
      ? `${config.preflight.requiredFiles.map((f) => f.path).join(", ")} present`
      : "no required files configured";

  const satisfiedDependencyCount = dependencyChecks.filter(
    (check) => check.status === "satisfied",
  ).length;
  const dependenciesSummary = `${satisfiedDependencyCount}/${dependencyChecks.length} dependency check(s) satisfied`;

  console.log(
    `emet preflight OK — ${requiredFilesSummary}, .claude/worktrees/ clean (or owned by a live/reclaimable /emet run; see any warnings above for leftover worktree-agent-* branches), ${capacityCheck.freeCount}/${capacityCheck.cap} worker slots free, ${dependenciesSummary}.`,
  );
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/emet.ts`) for the
 * `preflight` subcommand. See `claims.ts`'s `run()` for why this stages
 * `argv` onto `process.argv` rather than threading it through `main()`/
 * `mainPostDispatch()` directly. Unlike `claims.ts --list`, preflight has no
 * read-only carve-out — it's the dispatch gate itself, so a missing or
 * malformed `forge.config.json` is always fatal (exit 2) here.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError("emet preflight: not inside a git repository");
    }
    const config = await requireForgeConfig(repoRoot);
    if (argv.includes("--post-dispatch")) {
      await mainPostDispatch(config);
    } else {
      await main(config, repoRoot);
    }
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

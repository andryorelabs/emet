import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  requireForgeConfig,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import {
  didAcquireLock,
  type LockHolder,
  isLockHolder,
  readLockHolderAs,
  releaseLock,
} from "./locks";
import {
  checkMemoryHeadroom,
  computeAutoMaxLiveWorkers,
  readHostResources,
  resolveAutoCapOptionsFromEnvironment,
  resolveMemReserveBytesFromEnvironment,
} from "./resources";
import { classifyRun, resolveSessionSlug, type RunVerdict } from "./runs";

/**
 * Concurrency-cap slots under `~/.local/state/forge/slots/<index>` — the
 * missing half of `FORGE_MAX_LIVE_WORKERS` (see `docs/agents/forge.md`'s
 * "Concurrency" section). `preflight.ts`'s `checkSlotCapacity` has always
 * *counted* free slots, but nothing ever wrote one, so the cap was
 * aspirational — every slot always read as free no matter how many workers
 * were actually running.
 *
 * **Why host-wide, not `<git-common-dir>/forge/slots` like `locks.ts`'s
 * other lock directories.** Every other lock in this CLI protects a
 * *repo*-scoped resource (a ticket, a branch), so it correctly lives under
 * that repo's own `.git`. A worker slot protects something host-wide — the
 * cpu/RAM this machine actually has — so two different repos being worked on
 * concurrently must draw from the *same* pool, not each get their own
 * independent 8 (or "auto") slots. Before this, running `/forge` in two
 * repos on one host had no shared budget at all; running it from two Orca
 * worktrees of *one* repo (which do share one `--git-common-dir`) happened
 * to share a pool only by accident of that repo's own layout, not by design.
 * `$FORGE_STATE_DIR`, then `$XDG_STATE_HOME/forge`, then
 * `~/.local/state/forge` is the resolution order — the same
 * XDG-base-dir-first, home-fallback shape every other host-wide (not
 * repo-wide) piece of state on this machine already follows.
 *
 * **Why this isn't built on `locks.ts`'s own {@link isLockStale}.**
 * That function treats a holder as stale the instant its literal OS `pid`
 * exits — correct for a lock held by one continuously-running process for
 * its whole lifetime. A dispatch slot instead
 * represents one worker's occupancy across an entire wave — hours, spanning
 * many separate short-lived tool-call processes, none of which is the thing
 * actually alive. The right liveness signal is the same one
 * `claims.ts`'s reservations already use: `classifyRun`'s
 * `runId`/`anchorPid` anchor-process model. This module reuses
 * `locks.ts`'s `mkdirSync`/EEXIST directory primitive — still the
 * right atomic acquire mechanism, since two coordinators racing for the same
 * slot index still need exactly one to win — but replaces its
 * pid-liveness-based staleness check with one built on `classifyRun`
 * instead.
 *
 * **Call this through `forge slots`, never through an inline `bun
 * -e` snippet** — same rationale as `claims.ts`'s file-level doc
 * comment (AO-285): an untypechecked positional call is how that incident's
 * reservation got corrupted, and a slot holder has the same
 * `runId`/`anchorPid`/`ticket` shape.
 */

/** Whether `value` is a lock holder carrying every slot-specific field. */
function isSlotHolder(value: unknown): value is SlotHolder {
  return (
    isLockHolder(value) &&
    "runId" in value &&
    typeof value.runId === "string" &&
    "anchorPid" in value &&
    typeof value.anchorPid === "number" &&
    "ticket" in value &&
    typeof value.ticket === "string" &&
    "sessionSlug" in value &&
    typeof value.sessionSlug === "string"
  );
}

export interface SlotHolder extends LockHolder {
  readonly runId: string;
  readonly anchorPid: number;
  readonly ticket: string;
  readonly sessionSlug: string;
  /** Which repo's dispatch this slot belongs to (`git rev-parse
   * --show-toplevel` at acquire time) — informational only, so `--list` and
   * `forge doctor` can say whose wave is holding a slot on a shared,
   * host-wide pool. Never used to scope acquisition or release; a repo has
   * no special claim over "its own" slots on a pool it doesn't own. */
  readonly repoRoot: string;
}

/** `$FORGE_STATE_DIR` (an explicit override, e.g. for a test or an
 * unusual install), else `$XDG_STATE_HOME/forge`, else `~/.local/state/forge`
 * — resolved once, host-wide, never against any repo's own `.git`. */
function resolveForgeStateDirectory(): string {
  const explicit = process.env.FORGE_STATE_DIR;
  if (explicit) return explicit;
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome) return path.join(xdgStateHome, "forge");
  return path.join(os.homedir(), ".local", "state", "forge");
}

export async function resolveSlotsDirectory(): Promise<string> {
  const slotsDirectory = path.join(resolveForgeStateDirectory(), "slots");
  /**
   * Recursive on purpose, unlike {@link didAcquireLock}'s own `mkdirSync`:
   * this creates the shared *container* (`forge/slots/`), never the atomic
   * per-index lock itself (`forge/slots/<index>/`), so there is no mutual
   * exclusion to break here — only whether the parent exists at all before
   * the first `acquireSlot` call ever made on this host.
   */
  mkdirSync(slotsDirectory, { recursive: true });
  return slotsDirectory;
}

/**
 * The legacy per-repo pool a repo may still have under its own
 * `--git-common-dir` from before slots moved host-wide — never read from or
 * written to by {@link acquireSlot}/{@link releaseSlot}, only surfaced by
 * `forge doctor`/`slots --list` as a "safe to remove once no wave is
 * running" note. Resolves to `null` outside a git repo, or if
 * `--git-common-dir` can't be resolved, rather than throwing — this is a
 * best-effort informational check, never one that should block anything.
 */
export async function resolveLegacySlotsDirectory(): Promise<string | null> {
  const output = await Bun.$`git rev-parse --path-format=absolute --git-common-dir`
    .nothrow()
    .quiet();
  if (output.exitCode !== 0) return null;
  const gitCommonDirectory = output.stdout.toString().trim();
  if (!gitCommonDirectory || !path.isAbsolute(gitCommonDirectory)) return null;
  return path.join(gitCommonDirectory, "forge", "slots");
}

function slotDirectory(slotsDirectory: string, index: number): string {
  return path.join(slotsDirectory, String(index));
}

/**
 * `'idle'` is deliberately treated the same as `'live'` here — the same
 * ambiguity `shouldWriteReservation` (`claims.ts`) refuses to
 * auto-reclaim: a restart mid-run looks identical to a genuinely gone
 * process from the outside, so a slot only frees up once its owner
 * classifies unambiguously `'dead'`.
 */
export function isSlotStale(
  slotsDirectory: string,
  index: number,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): boolean {
  const holder = readLockHolderAs(slotDirectory(slotsDirectory, index), isSlotHolder);
  if (!holder) return true;
  return (
    classifyRun(holder.anchorPid, holder.sessionSlug, holder.runId, classifyRunOptions) === "dead"
  );
}

/**
 * Async only for {@link resolveRepoRoot}'s own `git rev-parse` call — a
 * small, one-off cost per {@link acquireSlot} call (once per worker, never a
 * hot loop) in exchange for not having to widen `acquireSlot`'s own
 * long-stable, heavily-tested signature just to thread a repoRoot through.
 * Falls back to `process.cwd()` on the (unexpected) chance this runs outside
 * a git repo at all — `repoRoot` is informational only, never load-bearing.
 */
async function buildSlotHolder(
  runId: string,
  anchorPid: number,
  ticket: string,
): Promise<SlotHolder> {
  return {
    pid: process.pid,
    worktree: process.cwd(),
    acquiredAt: Date.now(),
    runId,
    anchorPid,
    ticket,
    sessionSlug: resolveSessionSlug(),
    repoRoot: (await resolveRepoRoot()) ?? process.cwd(),
  };
}

function didAcquireSlotIndex(
  slotsDirectory: string,
  index: number,
  holder: SlotHolder,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): boolean {
  const directory = slotDirectory(slotsDirectory, index);
  if (didAcquireLock(directory, holder)) return true;
  if (isSlotStale(slotsDirectory, index, classifyRunOptions)) {
    releaseLock(directory);
    return didAcquireLock(directory, holder);
  }
  return false;
}

/**
 * Claims the first free (or reclaimably-`'dead'`) slot in `[0, cap)` for
 * `runId`/`anchorPid`/`ticket`, returning the index it took or `null` if
 * every slot is genuinely occupied by a `'live'` or `'idle'` owner. One
 * worker, one slot, one call — a coordinator dispatching a wave of N workers
 * calls this N times, once immediately before each worker's `Agent` call
 * (mirroring `didReserveTicket`'s own "reserve immediately before dispatch"
 * placement).
 */
export async function acquireSlot(
  cap: number,
  runId: string,
  anchorPid: number,
  ticket: string,
  slotsDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): Promise<number | null> {
  const resolvedSlotsDirectory = slotsDirectory ?? (await resolveSlotsDirectory());
  const holder = await buildSlotHolder(runId, anchorPid, ticket);
  for (let index = 0; index < cap; index++) {
    if (didAcquireSlotIndex(resolvedSlotsDirectory, index, holder, classifyRunOptions)) {
      return index;
    }
  }
  return null;
}

export function releaseSlot(slotsDirectory: string, index: number): void {
  releaseLock(slotDirectory(slotsDirectory, index));
}

export type ReleaseSlotResult =
  | { readonly outcome: "released"; readonly previousOwnerRunId?: string }
  | { readonly outcome: "not-occupied" }
  | { readonly outcome: "owned-by-another"; readonly ownerRunId: string };

/**
 * Releases slot `index`, but only on behalf of `expectedRunId` — mirrors
 * `claims.ts`'s {@link releaseTicket} ownership check. Before this existed,
 * `forge slots --release-index <i>` freed any slot unconditionally, unlike
 * `--release --run <id>` ({@link releaseAllSlotsForRun}), which already
 * filtered on `holder.runId` — so the single-index path let one coordinator
 * free a slot a different, still-live coordinator legitimately holds. `force`
 * is the deliberate escape hatch for a human clearing a stuck slot by hand.
 */
export function releaseSlotIfOwned(
  slotsDirectory: string,
  index: number,
  expectedRunId: string,
  force = false,
): ReleaseSlotResult {
  const holder = readLockHolderAs(slotDirectory(slotsDirectory, index), isSlotHolder);
  if (!holder) return { outcome: "not-occupied" };
  if (holder.runId !== expectedRunId && !force) {
    return { outcome: "owned-by-another", ownerRunId: holder.runId };
  }
  releaseSlot(slotsDirectory, index);
  return { outcome: "released", previousOwnerRunId: holder.runId };
}

/**
 * Releases every slot `runId` currently holds — used by
 * `forge cleanup --run <runId>` at wave close-out, so a coordinator
 * never has to remember which indices it took across N {@link acquireSlot}
 * calls, and by `forge:slots --release --run <runId>` for the same purpose
 * when a dispatch aborts before reaching cleanup.
 *
 * `ticket`, when given, additionally scopes the release to the one slot
 * matching `holder.ticket` — this is what lets a worker's own slot free up
 * the moment *that* worker's completion notification arrives (Phase 7/8;
 * see `reference/phases-8-closeout.md`), instead of every slot the whole run holds
 * staying occupied until the entire wave's `forge cleanup --run` at
 * close-out.
 */
export async function releaseAllSlotsForRun(
  runId: string,
  slotsDirectory?: string,
  ticket?: string,
): Promise<number[]> {
  const resolvedSlotsDirectory = slotsDirectory ?? (await resolveSlotsDirectory());
  if (!existsSync(resolvedSlotsDirectory)) return [];

  const released: number[] = [];
  for (const name of readdirSync(resolvedSlotsDirectory)) {
    const index = Number(name);
    if (!Number.isSafeInteger(index)) continue;
    const holder = readLockHolderAs(slotDirectory(resolvedSlotsDirectory, index), isSlotHolder);
    if (holder?.runId === runId && (ticket === undefined || holder.ticket === ticket)) {
      releaseSlot(resolvedSlotsDirectory, index);
      released.push(index);
    }
  }
  return released;
}

export type SlotListEntry = {
  readonly index: number;
  readonly holder: SlotHolder;
  readonly verdict: RunVerdict;
};

export async function listOccupiedSlots(
  slotsDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): Promise<SlotListEntry[]> {
  const resolvedSlotsDirectory = slotsDirectory ?? (await resolveSlotsDirectory());
  if (!existsSync(resolvedSlotsDirectory)) return [];

  const entries: SlotListEntry[] = [];
  for (const name of readdirSync(resolvedSlotsDirectory)) {
    const index = Number(name);
    if (!Number.isSafeInteger(index)) continue;
    const holder = readLockHolderAs(slotDirectory(resolvedSlotsDirectory, index), isSlotHolder);
    if (!holder) continue;
    entries.push({
      index,
      holder,
      verdict: classifyRun(holder.anchorPid, holder.sessionSlug, holder.runId, classifyRunOptions),
    });
  }
  return entries.toSorted((a, b) => a.index - b.index);
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function requireFlagValue(argv: readonly string[], flag: string): string {
  const value = readFlagValue(argv, flag);
  if (!value) {
    throw new Error(`forge:slots — ${flag} requires a value`);
  }
  return value;
}

/**
 * `FORGE_MAX_LIVE_WORKERS` still overrides `forge.config.json`'s
 * `concurrency.maxLiveWorkers` when set — same precedence `preflight.ts`
 * honors, kept so the existing escape hatch never breaks. Accepts the
 * literal `"auto"` too (matching what a config's own `maxLiveWorkers` field
 * accepts), in which case it's resolved the same way `"auto"` in the config
 * itself is: {@link computeAutoMaxLiveWorkers} over this host's own
 * cpu/RAM. A config value of `"auto"` resolves the same way when the env
 * var is unset.
 */
export function resolveMaxLiveWorkers(config: ForgeConfig): number {
  const raw = process.env.FORGE_MAX_LIVE_WORKERS;
  if (raw !== undefined) {
    if (raw === "auto") {
      return computeAutoMaxLiveWorkers(readHostResources(), resolveAutoCapOptionsFromEnvironment());
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (config.concurrency.maxLiveWorkers === "auto") {
    return computeAutoMaxLiveWorkers(readHostResources(), resolveAutoCapOptionsFromEnvironment());
  }
  return config.concurrency.maxLiveWorkers;
}

/**
 * CLI entry point — the only supported calling convention (see the
 * file-level doc comment for why an inline `bun -e` snippet is not).
 *
 * ```
 * forge slots --acquire --run <runId> --anchor <pid> --ticket <ticket>
 * forge slots --release --run <runId> [--ticket <ticket>]
 * forge slots --release-index <index> --run <runId> [--force]
 * forge slots --list
 * ```
 */
async function main(config: ForgeConfig): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--acquire")) {
    const runId = requireFlagValue(argv, "--run");
    const anchorPid = Number(requireFlagValue(argv, "--anchor"));
    const ticket = requireFlagValue(argv, "--ticket");
    const maxLiveWorkers = resolveMaxLiveWorkers(config);

    /**
     * The admission brake runs before ever scanning a slot index — with no
     * swap, exhausting RAM is an OOM kill, not a slowdown, so this is
     * checked fresh on every acquire rather than folded into the cap
     * computed once at `forge init`/`forge doctor` time. See
     * `resources.ts`'s `checkMemoryHeadroom` doc comment.
     */
    const headroom = checkMemoryHeadroom(
      readHostResources(),
      resolveMemReserveBytesFromEnvironment(),
    );
    if (!headroom.ok) {
      console.error(
        `forge:slots — denied by the memory brake: ${headroom.reason}. Not a capacity issue (slots may still be free) — wait for memory to free up, or raise FORGE_MEM_RESERVE_GIB if this repo's workers genuinely need less headroom than the default.`,
      );
      process.exitCode = 1;
      return;
    }

    const index = await acquireSlot(maxLiveWorkers, runId, anchorPid, ticket);
    if (index === null) {
      console.error(
        `forge:slots — no free slot (all ${maxLiveWorkers} occupied by a live or idle run).`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`forge:slots — acquired slot ${index} for ${ticket}.`);
    return;
  }

  if (argv.includes("--release")) {
    const runId = requireFlagValue(argv, "--run");
    const ticket = readFlagValue(argv, "--ticket") ?? undefined;
    const released = await releaseAllSlotsForRun(runId, undefined, ticket);
    console.log(
      `forge:slots — released ${released.length} slot(s) for run ${runId}${ticket ? ` (ticket ${ticket})` : ""}${released.length > 0 ? `: ${released.join(", ")}` : ""}.`,
    );
    return;
  }

  if (argv.includes("--release-index")) {
    const index = Number(requireFlagValue(argv, "--release-index"));
    const runId = requireFlagValue(argv, "--run");
    const force = argv.includes("--force");
    const slotsDirectory = await resolveSlotsDirectory();
    const result = releaseSlotIfOwned(slotsDirectory, index, runId, force);
    if (result.outcome === "owned-by-another") {
      console.error(
        `forge:slots — slot ${index} is held by run ${result.ownerRunId}, not ${runId} — pass --force to release it anyway.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`forge:slots — released slot ${index}.`);
    return;
  }

  if (argv.includes("--list")) {
    const maxLiveWorkers = resolveMaxLiveWorkers(config);
    const capSource =
      process.env.FORGE_MAX_LIVE_WORKERS !== undefined
        ? "FORGE_MAX_LIVE_WORKERS"
        : config.concurrency.maxLiveWorkers === "auto"
          ? "auto"
          : "forge.config.json";
    const entries = await listOccupiedSlots();
    if (entries.length === 0) {
      console.log(`forge:slots — no slots occupied (0/${maxLiveWorkers}, cap=${capSource}).`);
    } else {
      for (const { index, holder, verdict } of entries) {
        console.log(
          `${index}  run=${holder.runId}  anchor=${holder.anchorPid}  ticket=${holder.ticket}  repo=${holder.repoRoot}  ${verdict}  since=${new Date(holder.acquiredAt).toISOString()}`,
        );
      }
      console.log(`(${entries.length}/${maxLiveWorkers} occupied, cap=${capSource})`);
    }

    const legacyDirectory = await resolveLegacySlotsDirectory();
    if (legacyDirectory && existsSync(legacyDirectory) && readdirSync(legacyDirectory).length > 0) {
      console.log(
        `note: ${legacyDirectory} still has entries — leftover from the pre-host-wide per-repo pool, safe to remove once no wave is running.`,
      );
    }
    return;
  }

  console.error(
    "usage: forge slots --acquire --run <runId> --anchor <pid> --ticket <ticket> | --release --run <runId> [--ticket <ticket>] | --release-index <index> --run <runId> [--force] | --list",
  );
  process.exitCode = 1;
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/forge.ts`) for the
 * `slots` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly, and
 * for why `--list` alone tolerates a missing `forge.config.json` (falls back
 * to {@link DEFAULT_FORGE_CONFIG}) while every mutating mode
 * (`--acquire`/`--release`/`--release-index`) requires a real one.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError("forge slots: not inside a git repository");
    }
    const config = argv.includes("--list")
      ? (await loadForgeConfigWithDefaults(repoRoot)).config
      : await requireForgeConfig(repoRoot);
    await main(config);
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

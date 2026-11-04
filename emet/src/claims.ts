import { optionalProperty } from "./optional";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  DEFAULT_FORGE_CONFIG,
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  requireForgeConfig,
  resolveRepoRoot,
} from "./config";
import {
  didAcquireLock,
  isLockStale,
  type LockHolder,
  releaseLock,
  resolveLockDirectory,
} from "./locks";
import { classifyRun, readProcessStartToken, resolveSessionSlug, type RunVerdict } from "./runs";
import { errnoCode, isObject } from "./narrow";

/**
 * Per-ticket reservations under `<git-common-dir>/forge/tickets/` — the
 * registry two `/forge` coordinators race against so the same ticket never
 * gets dispatched twice at once. See PROJ-256/PROJ-258. `<git-common-dir>`
 * (resolved via `git rev-parse --git-common-dir`) rather than `.git`
 * directly, because every worktree of a repo shares one `.git` and what this
 * protects is host-wide, not per-worktree.
 *
 * Worktree ownership itself is *not* tracked here — that rides on git's own
 * `git worktree lock` primitive (written via `lockreason.ts`, parsed by
 * `worktrees.ts`'s `resolveWorktreeOwner`), not a parallel JSON registry
 * that could disagree with git about which worktrees exist.
 *
 * **Call this through `forge claims`, never through an inline `bun
 * -e` snippet.** A coordinator once called the positional
 * {@link didReserveTicket} with its arguments in the wrong order —
 * `(ticket, runId, anchorPid)` instead of `(runId, anchorPid, ticket)`, three
 * positional parameters where two are `string` — and since ad-hoc snippets
 * never pass through `typecheck`, the malformed reservation
 * (`{runId:"PROJ-285", anchorPid:"session_...", ticket:1090684}`) was written
 * to disk without a single error surfacing. That ticket (PROJ-285) never had a
 * real reservation, and its worker went on to lose worktree isolation
 * entirely — the dispatch mutex hadn't failed, it had never existed for that
 * ticket. {@link didReserveTicket} and {@link releaseTicket} now validate
 * their inputs and throw immediately on a malformed call instead of writing
 * it through; the CLI below (`if (import.meta.main)`) is the supported
 * calling convention.
 */

export type Reservation = {
  readonly runId: string;
  readonly anchorPid: number;
  readonly anchorStartToken?: string;
  readonly ticket: string;
  readonly reservedAt: number;
  /**
  The reserving run's own `resolveSessionSlug()` at write time — captured
  here rather than re-derived from the *checking* caller's `cwd` when a
  reservation is later read back, since a worktree worker's `cwd` differs
  from the coordinator's (or a sibling worker's), and `classifyRun`'s
  transcript lookup only finds the right file under the *owner's* slug.
  */
  readonly sessionSlug: string;
};

/**
 * The ticket-id shape this module enforces — historically hardcoded to
 * `AO-<digits>` (a Linear team key), now sourced from
 * `forge.config.json`'s `ticket.idPattern` via {@link configureTicketPattern}
 * so this module works against any repo's ticket ids, not only one Linear
 * team's. Defaults to a generic `<UPPERCASE-PREFIX>-<digits>` shape (still
 * matching `AO-<digits>`) until `run()` configures it from the repo's own
 * config. Rejecting anything outside the configured shape at the door is
 * what would have caught the PROJ-285 incident (see the file-level doc
 * comment): a `ticket` argument that's actually a `runId` or a bare number
 * never matches a well-formed pattern.
 */
let TICKET_PATTERN = new RegExp(DEFAULT_FORGE_CONFIG.ticket.idPattern);

/**
 * Overrides {@link TICKET_PATTERN} from a repo's own `forge.config.json`.
 * Called once, by `run()`, before any reservation logic executes — every
 * function below reads the module-level `TICKET_PATTERN` rather than taking
 * it as a parameter, so this is the single point of configuration and every
 * call site (including this file's own tests) stays untouched.
 */
export function configureTicketPattern(source: string): void {
  TICKET_PATTERN = new RegExp(source);
}

/**
 * Throws with a message naming the exact bad argument and its position,
 * rather than letting a malformed call silently write a corrupt reservation
 * — the PROJ-285 failure mode this whole module exists to close off. Called at
 * the top of every function that accepts `runId`/`anchorPid`/`ticket`, before
 * any lock is acquired or any file is touched.
 */
function assertValidReservationArguments(runId: string, anchorPid: number, ticket: string): void {
  if (typeof runId !== "string" || runId.length === 0) {
    throw new TypeError(
      `forge-claims: runId must be a non-empty string, got ${JSON.stringify(runId)}. Check argument order — the signature is (runId, anchorPid, ticket).`,
    );
  }
  if (!Number.isSafeInteger(anchorPid) || anchorPid <= 0) {
    throw new TypeError(
      `forge-claims: anchorPid must be a positive integer, got ${JSON.stringify(anchorPid)}. Check argument order — the signature is (runId, anchorPid, ticket).`,
    );
  }
  if (!TICKET_PATTERN.test(ticket)) {
    throw new TypeError(
      `forge-claims: ticket must match ${TICKET_PATTERN} (e.g. "PROJ-321"), got ${JSON.stringify(ticket)}. Check argument order — the signature is (runId, anchorPid, ticket).`,
    );
  }
}

function assertValidTicket(ticket: string): void {
  if (!TICKET_PATTERN.test(ticket)) {
    throw new TypeError(
      `forge-claims: ticket must match ${TICKET_PATTERN} (e.g. "PROJ-321"), got ${JSON.stringify(ticket)}.`,
    );
  }
}

/**
Resolves `<git-common-dir>/forge`, the shared root every worktree of this repo agrees on. Reuses `locks.ts`'s own `--git-common-dir` resolution rather than a second copy of it.
*/
async function resolveForgeDirectory(): Promise<string> {
  return resolveLockDirectory("forge");
}

function ticketsDirectory(forgeDirectory: string): string {
  return path.join(forgeDirectory, "tickets");
}

function reservationFilePath(forgeDirectory: string, ticket: string): string {
  return path.join(ticketsDirectory(forgeDirectory), `${ticket}.json`);
}

function reservationLockPath(forgeDirectory: string, ticket: string): string {
  return path.join(ticketsDirectory(forgeDirectory), `${ticket}.lock`);
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function readReservationFile(filePath: string): Reservation | undefined {
  const raw = readJsonFile(filePath);
  return isValidReservationShape(raw) ? raw : undefined;
}

function listReservationFiles(directory: string): Reservation[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readReservationFile(path.join(directory, name)))
    .filter((entry): entry is Reservation => entry !== undefined);
}

/**
 * How long a reservation-write lock may sit before its holder is considered
 * a pid-reuse victim rather than a genuinely slow writer — see
 * `isLockStale`'s own doc comment for why the age check only ever fires
 * once the pid is *also* confirmed dead. The write this lock guards
 * (read one small JSON file, decide, write one small JSON file) is
 * sub-millisecond, so this only exists as a defensive ceiling, not a
 * realistic wait.
 */
const RESERVATION_LOCK_MAX_AGE_MS = 5 * 60_000;

function buildReservationLockHolder(): LockHolder {
  return { pid: process.pid, worktree: process.cwd(), acquiredAt: Date.now() };
}

/**
 * Atomic acquire via `locks.ts`'s `didAcquireLock`/`isLockStale` —
 * unlike a bare `mkdirSync`, this reclaims immediately if the process that
 * held the lock died mid-reservation (killed between acquiring this lock
 * and its `finally` release below), rather than leaving `<ticket>.lock`
 * behind forever and permanently blocking that ticket from ever being
 * reserved again.
 */
function didAcquireReservationLock(lockPath: string): boolean {
  if (didAcquireLock(lockPath, buildReservationLockHolder())) return true;
  if (isLockStale(lockPath, RESERVATION_LOCK_MAX_AGE_MS)) {
    releaseLock(lockPath);
    return didAcquireLock(lockPath, buildReservationLockHolder());
  }
  return false;
}

/**
 * Pure decision at the heart of {@link didReserveTicket}, split out so the
 * "only one wins" semantics are unit-testable without real concurrency or a
 * `/proc`/git dependency. `runId` may (re)write the reservation when there
 * is none yet, when it already owns it (idempotent re-reservation), or when
 * the current owner's run has been classified `'dead'` — never on `'live'`
 * or `'idle'`, since idle is deliberately ambiguous and must never be
 * auto-reclaimed.
 */
export function shouldWriteReservation(
  runId: string,
  existing: Reservation | undefined,
  existingOwnerVerdict: RunVerdict,
): boolean {
  if (!existing) return true;
  if (existing.runId === runId) return true;
  return existingOwnerVerdict === "dead";
}

/**
 * Attempts to reserve `ticket` for `runId`/`anchorPid`. Returns `false`
 * both when the lock itself is contested right now (another reservation
 * attempt for the same ticket is mid-flight — vanishingly short window,
 * retry later) and when the ticket is genuinely already held by a live or
 * idle run; returns `true` once the reservation file is written.
 *
 * `classifyRunOptions` is an escape hatch for tests only — it threads
 * straight through to the internal `classifyRun` call so a test can inject
 * a fake `isAnchorAliveFn`/`transcriptMtimeFn` instead of depending on a
 * real `claude`-ancestor process, which does not exist on a plain CI
 * runner. Production callers never pass this.
 */
export async function didReserveTicket(
  runId: string,
  anchorPid: number,
  ticket: string,
  forgeDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
): Promise<boolean> {
  assertValidReservationArguments(runId, anchorPid, ticket);
  const resolvedForgeDirectory = forgeDirectory ?? (await resolveForgeDirectory());
  mkdirSync(ticketsDirectory(resolvedForgeDirectory), { recursive: true });

  const lockPath = reservationLockPath(resolvedForgeDirectory, ticket);
  if (!didAcquireReservationLock(lockPath)) return false;

  try {
    const filePath = reservationFilePath(resolvedForgeDirectory, ticket);
    const existing = readReservationFile(filePath);
    const existingOwnerVerdict = existing
      ? classifyRun(
          existing.anchorPid,
          existing.sessionSlug,
          existing.runId,
          withAnchorStartToken(classifyRunOptions, existing),
        )
      : "dead";

    if (!shouldWriteReservation(runId, existing, existingOwnerVerdict)) return false;

    const reservation: Reservation = {
      runId,
      anchorPid,
      ...optionalProperty("anchorStartToken", readProcessStartToken(anchorPid)),
      ticket,
      reservedAt: Date.now(),
      sessionSlug: resolveSessionSlug(),
    };
    writeJsonAtomically(filePath, reservation);
    return true;
  } finally {
    releaseLock(lockPath);
  }
}

export type ReleaseTicketResult =
  | { readonly outcome: "released"; readonly previousOwnerRunId?: string }
  | { readonly outcome: "not-reserved" }
  | { readonly outcome: "owned-by-another"; readonly ownerRunId: string };

/**
 * Releases `ticket`'s reservation, but only on behalf of `expectedRunId` —
 * the run this caller believes currently owns it. Before this ownership
 * check existed, `releaseTicket(ticket)` deleted the reservation file
 * unconditionally: `forge claims --release PROJ-321` from run B could free run
 * A's still-live reservation with no error at all, reopening the exact
 * double-dispatch race `didReserveTicket` exists to prevent — a real risk
 * once two coordinators (e.g. two Orca worktrees of the same repo) can both
 * reach for the same ticket id.
 *
 * Three outcomes rather than a boolean: `'not-reserved'` (nothing to
 * release — same no-op the old unconditional `rmSync` produced when the file
 * never existed) and `'owned-by-another'` (a real reservation exists, but for
 * a different run — refused unless `force`) are distinguishable so a caller
 * can tell "already clean" from "blocked." `force` is the deliberate escape
 * hatch for a human clearing a genuinely stuck reservation by hand.
 */
export async function releaseTicket(
  ticket: string,
  expectedRunId: string,
  options?: { readonly forgeDirectory?: string; readonly force?: boolean },
): Promise<ReleaseTicketResult> {
  assertValidTicket(ticket);
  const resolvedForgeDirectory = options?.forgeDirectory ?? (await resolveForgeDirectory());
  const filePath = reservationFilePath(resolvedForgeDirectory, ticket);
  const existing = readReservationFile(filePath);
  if (!existing) return { outcome: "not-reserved" };
  if (existing.runId !== expectedRunId && !options?.force) {
    return { outcome: "owned-by-another", ownerRunId: existing.runId };
  }
  rmSync(filePath, { force: true });
  return { outcome: "released", previousOwnerRunId: existing.runId };
}

export async function listReservations(forgeDirectory?: string): Promise<Reservation[]> {
  const resolvedForgeDirectory = forgeDirectory ?? (await resolveForgeDirectory());
  return listReservationFiles(ticketsDirectory(resolvedForgeDirectory));
}

function withAnchorStartToken(
  classifyRunOptions: Parameters<typeof classifyRun>[3],
  reservation: Reservation,
): Parameters<typeof classifyRun>[3] {
  return {
    ...classifyRunOptions,
    ...optionalProperty("anchorStartToken", reservation.anchorStartToken),
  };
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  renameSync(temporaryPath, filePath);
}

function isValidReservationShape(value: unknown): value is Reservation {
  if (!isObject(value)) return false;
  const record = value;
  return (
    typeof record.runId === "string" &&
    record.runId.length > 0 &&
    typeof record.anchorPid === "number" &&
    Number.isSafeInteger(record.anchorPid) &&
    record.anchorPid > 0 &&
    typeof record.ticket === "string" &&
    TICKET_PATTERN.test(record.ticket) &&
    typeof record.reservedAt === "number" &&
    typeof record.sessionSlug === "string"
  );
}

export type PruneResult = {
  readonly releasedTickets: string[];
  /**
  Files whose content doesn't pass {@link isValidReservationShape} — e.g. a
  past call with `runId`/`anchorPid`/`ticket` in the wrong order (the PROJ-285
  incident this module's validation now prevents at write time, but an
  already-corrupted file predates that fix). Never auto-deleted: a sweep that
  can't classify a record's owner must never guess at whether it's safe to
  remove. Reported by name so a human can inspect and delete it by hand.
  */
  readonly malformedFiles: string[];
};

/**
 * Sweeps every reservation file directly (not through {@link listReservations
 * }, which trusts its cast) and releases the ones whose owning run
 * classifies `'dead'` — the same verdict {@link shouldWriteReservation}
 * already treats as reclaimable on the next `didReserveTicket` call for that
 * ticket, exposed here as its own pass so a coordinator can clear the
 * registry without waiting for each ticket to be re-dispatched. `'live'` and
 * `'idle'` owners are left untouched. A file that fails
 * {@link isValidReservationShape} is skipped and reported separately rather
 * than passed to `classifyRun`, which expects well-typed fields it can't
 * defend against a corrupted record it never wrote.
 */
export async function pruneDeadReservations(
  forgeDirectory?: string,
  classifyRunOptions?: Parameters<typeof classifyRun>[3],
  isDryRun = false,
): Promise<PruneResult> {
  const resolvedForgeDirectory = forgeDirectory ?? (await resolveForgeDirectory());
  const directory = ticketsDirectory(resolvedForgeDirectory);
  const releasedTickets: string[] = [];
  const malformedFiles: string[] = [];

  if (!existsSync(directory)) {
    return { releasedTickets, malformedFiles };
  }

  for (const fileName of readdirSync(directory)) {
    if (!fileName.endsWith(".json")) continue;
    const filePath = path.join(directory, fileName);
    const raw: unknown = readJsonFile(filePath);
    if (!isValidReservationShape(raw)) {
      malformedFiles.push(fileName);
      continue;
    }
    const verdict = classifyRun(
      raw.anchorPid,
      raw.sessionSlug,
      raw.runId,
      withAnchorStartToken(classifyRunOptions, raw),
    );
    if (verdict === "dead") {
      if (!isDryRun) rmSync(filePath, { force: true });
      releasedTickets.push(raw.ticket);
    }
  }

  return { releasedTickets, malformedFiles };
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
    throw new Error(`forge:claims — ${flag} requires a value`);
  }
  return value;
}

/**
 * CLI entry point — the only supported calling convention (see the
 * file-level doc comment for why an inline `bun -e` snippet is not).
 *
 * ```
 * forge claims --reserve PROJ-321 --run <runId> --anchor <pid>
 * forge claims --release PROJ-321 --run <runId> [--force]
 * forge claims --list
 * forge claims --prune [--dry-run]
 * ```
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--reserve")) {
    const ticket = requireFlagValue(argv, "--reserve");
    const runId = requireFlagValue(argv, "--run");
    const anchorPid = Number(requireFlagValue(argv, "--anchor"));
    const isReserved = await didReserveTicket(runId, anchorPid, ticket);
    if (!isReserved) {
      console.error(`forge:claims — ${ticket} is already reserved by a live or idle run.`);
      process.exitCode = 1;
      return;
    }
    console.log(`forge:claims — reserved ${ticket} for run ${runId}.`);
    return;
  }

  if (argv.includes("--release")) {
    const ticket = requireFlagValue(argv, "--release");
    const runId = requireFlagValue(argv, "--run");
    const force = argv.includes("--force");
    const result = await releaseTicket(ticket, runId, { force });
    if (result.outcome === "owned-by-another") {
      console.error(
        `forge:claims — ${ticket} is reserved by run ${result.ownerRunId}, not ${runId} — pass --force to release it anyway.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`forge:claims — released ${ticket}.`);
    return;
  }

  if (argv.includes("--list")) {
    const reservations = await listReservations();
    if (reservations.length === 0) {
      console.log("forge:claims — no reservations.");
      return;
    }
    for (const reservation of reservations) {
      console.log(
        `${reservation.ticket}  run=${reservation.runId}  anchor=${reservation.anchorPid}  since=${new Date(reservation.reservedAt).toISOString()}`,
      );
    }
    return;
  }

  if (argv.includes("--prune")) {
    const isDryRun = argv.includes("--dry-run");
    const { releasedTickets, malformedFiles } = await pruneDeadReservations(
      undefined,
      undefined,
      isDryRun,
    );
    console.log(
      `forge:claims — ${isDryRun ? "would release" : "released"} ${releasedTickets.length} dead reservation(s)${releasedTickets.length > 0 ? `: ${releasedTickets.join(", ")}` : ""}.`,
    );
    if (malformedFiles.length > 0) {
      console.log(
        `forge:claims — ${malformedFiles.length} malformed reservation file(s), never auto-deleted, review by hand:\n${malformedFiles.map((name) => `  ${path.join("<git-common-dir>/forge/tickets", name)}`).join("\n")}`,
      );
    }
    return;
  }

  console.error(
    "usage: forge claims --reserve <ticket> --run <runId> --anchor <pid> | --release <ticket> --run <runId> [--force] | --list | --prune [--dry-run]",
  );
  process.exitCode = 1;
}

/**
 * Entry point invoked by the `forge` CLI dispatcher (`bin/emet.ts`) for the
 * `claims` subcommand. `main()` reads its arguments off `process.argv`
 * directly, so this wrapper stages `argv` onto `process.argv` before
 * delegating — safe because the dispatcher runs exactly one subcommand per
 * process.
 *
 * `--list` is read-only (falls back to {@link DEFAULT_FORGE_CONFIG} when a
 * repo has no `forge.config.json` yet); `--reserve`/`--release`/`--prune`
 * mutate the dispatch-mutex registry, so they require a real config — see
 * `config.ts`'s two loader tiers.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [process.argv[0]!, process.argv[1]!, ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) {
      throw new ForgeConfigError("forge claims: not inside a git repository");
    }
    const config = argv.includes("--list")
      ? (await loadForgeConfigWithDefaults(repoRoot)).config
      : await requireForgeConfig(repoRoot);
    configureTicketPattern(config.ticket.idPattern);
    await main();
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

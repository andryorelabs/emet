import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadForgeConfig, resolveRepoRoot } from "./config";
import { EmetError } from "./errors";
import { exitCodes } from "./exit-codes";
import { appendEvent } from "./journal";
import { didAcquireLock, didReclaimStaleLock, releaseLock, resolveLockDirectory } from "./locks";
import { PRODUCT } from "./names";
import { errnoCode, errorMessage } from "./narrow";
import {
  closeCompletedSpecs,
  closeGithubTickets,
  runGh,
  type CloseReason,
  type TicketCloseResult,
} from "./ticketclose";
import {
  appendComment,
  computeFrontier,
  listTickets,
  parseTicketId,
  parseTrackerFile,
  resolveTrackerRoot,
  setStatusLine,
  TRACKER_STATUSES,
  type TicketFile,
  type TrackerStatus,
} from "./tracker-files";

const USAGE = `usage: emet tracker <subcommand> [...args]

subcommands (JSON on stdout; exit 0 ok, 1 not found or refused, 2 usage):
  create-spec   --slug <s> --title <t> --body-file <f>
  create-ticket --spec <s> --title <t> --body-file <f> [--blocked-by NN,...]
  read          <id>  (spec slug or ticket id)
  frontier      --spec <s>
  set-state     <id> <status>
  comment       <id> --body-file <f> [--author <name>]
  close         <id> [--canceled]
                (tracker.kind github: <ticket>... [--pr <n>] [--reason completed|not_planned])
`;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_POLL_INTERVAL_MS = 25;
const LOCK_MAX_AGE_MS = 120_000;
const CLOSED_STATUSES: ReadonlySet<TrackerStatus> = new Set(["done", "canceled", "resolved"]);

class TrackerUsageError extends EmetError {
  constructor(message: string) {
    super("tracker-usage", message, "see `emet tracker --help`", exitCodes.usage);
  }
}

class TrackerRefusedError extends EmetError {
  constructor(message: string) {
    super("tracker-refused", message, "fix the tracker state and rerun", exitCodes.findings);
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (value === undefined || value.startsWith("--")) {
    throw new TrackerUsageError(`missing ${flag}\n\n${USAGE}`);
  }
  return value;
}

function requirePositional(argv: readonly string[], name: string): string {
  const value = argv[0];
  if (value === undefined || value.startsWith("--")) {
    throw new TrackerUsageError(`missing <${name}>\n\n${USAGE}`);
  }
  return value;
}

function requireSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw new TrackerUsageError(`invalid slug "${slug}": must match ${SLUG_PATTERN.source}`);
  }
  return slug;
}

async function readBodyFile(argv: readonly string[]): Promise<string> {
  const bodyFile = requireFlag(argv, "--body-file");
  try {
    return await readFile(bodyFile, "utf8");
  } catch (error) {
    throw new TrackerUsageError(`cannot read --body-file ${bodyFile}: ${errorMessage(error)}`);
  }
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug === "" ? "ticket" : slug;
}

function isTrackerStatus(value: string): value is TrackerStatus {
  return TRACKER_STATUSES.some((status) => status === value);
}

async function writeAtomically(file: string, content: string): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, content);
  await rename(temporary, file);
}

function specFile(root: string, slug: string): string {
  return path.join(root, ".scratch", slug, "spec.md");
}

async function acquireSpecLock(lockDirectory: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    const holder = { pid: process.pid, worktree: process.cwd(), acquiredAt: Date.now() };
    if (didAcquireLock(lockDirectory, holder)) {
      return;
    }
    if (!didReclaimStaleLock(lockDirectory, LOCK_MAX_AGE_MS)) {
      if (Date.now() >= deadline) {
        throw new Error(`emet:tracker: timed out waiting for ${lockDirectory}; retry`);
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- polling loop
      await Bun.sleep(LOCK_POLL_INTERVAL_MS);
    }
  }
}

async function withSpecLock<Result>(slug: string, action: () => Promise<Result>): Promise<Result> {
  const lockDirectory = await resolveLockDirectory(`tracker-${slug}.lock`);
  await acquireSpecLock(lockDirectory);
  try {
    return await action();
  } finally {
    releaseLock(lockDirectory);
  }
}

async function loadTickets(root: string, slug: string): Promise<TicketFile[]> {
  const tickets = await listTickets(root, slug);
  const seen = new Map<string, TicketFile>();
  for (const ticket of tickets) {
    const previous = seen.get(ticket.nn);
    if (previous) {
      throw new TrackerRefusedError(
        `spec "${slug}" has two tickets numbered ${ticket.nn}: ${path.basename(previous.file)} and ${path.basename(ticket.file)}`,
      );
    }
    seen.set(ticket.nn, ticket);
  }
  return tickets;
}

function requireSpec(root: string, slug: string): void {
  if (!existsSync(specFile(root, slug))) {
    throw new TrackerRefusedError(`spec "${slug}" not found`);
  }
}

type Target =
  | { kind: "spec"; id: string; slug: string; file: string }
  | { kind: "ticket"; id: string; slug: string; file: string; ticket: TicketFile };

async function resolveTarget(root: string, id: string): Promise<Target> {
  requireSlug(id);
  const parsed = parseTicketId(id);
  if (parsed) {
    const ticket = (await loadTickets(root, parsed.slug)).find(
      (candidate) => candidate.nn === parsed.nn,
    );
    if (ticket) {
      return { kind: "ticket", id, slug: parsed.slug, file: ticket.file, ticket };
    }
  }
  const file = specFile(root, id);
  if (existsSync(file)) {
    return { kind: "spec", id, slug: id, file };
  }
  throw new TrackerRefusedError(`"${id}" is neither a spec nor a ticket`);
}

function ticketSummary(ticket: TicketFile) {
  return {
    id: ticket.id,
    nn: ticket.nn,
    title: ticket.title,
    status: ticket.status,
    blockedBy: ticket.blockedBy,
  };
}

async function createSpec(root: string, argv: readonly string[]): Promise<unknown> {
  const slug = requireSlug(requireFlag(argv, "--slug"));
  const title = requireFlag(argv, "--title");
  const body = await readBodyFile(argv);
  return withSpecLock(slug, async () => {
    const file = specFile(root, slug);
    if (existsSync(file)) {
      throw new TrackerRefusedError(`spec "${slug}" already exists`);
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeAtomically(file, `# ${title}\n\nStatus: in-progress\n\n${body.trim()}\n`);
    return { id: slug, title, status: "in-progress", file };
  });
}

function parseBlockedByFlag(argv: readonly string[]): string[] {
  const raw = flagValue(argv, "--blocked-by");
  if (raw === undefined) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => {
      if (!/^\d+$/.test(part)) {
        throw new TrackerUsageError(`invalid --blocked-by entry "${part}": expected NN`);
      }
      return part.padStart(2, "0");
    });
}

async function createTicket(root: string, argv: readonly string[]): Promise<unknown> {
  const slug = requireSlug(requireFlag(argv, "--spec"));
  const title = requireFlag(argv, "--title");
  const body = await readBodyFile(argv);
  const blockedBy = parseBlockedByFlag(argv);
  return withSpecLock(slug, async () => {
    requireSpec(root, slug);
    const tickets = await loadTickets(root, slug);
    const highest = tickets.reduce((maximum, ticket) => Math.max(maximum, Number(ticket.nn)), 0);
    const nn = String(highest + 1).padStart(2, "0");
    const file = path.join(root, ".scratch", slug, "issues", `${nn}-${slugifyTitle(title)}.md`);
    await mkdir(path.dirname(file), { recursive: true });
    const blockedLine = blockedBy.length === 0 ? "None" : blockedBy.join(", ");
    await writeAtomically(
      file,
      `# ${title}\n\nStatus: ready-for-agent\nBlocked by: ${blockedLine}\n\n${body.trim()}\n`,
    );
    return { id: `${slug}-${nn}`, nn, title, status: "ready-for-agent", blockedBy, file };
  });
}

async function readItem(root: string, argv: readonly string[]): Promise<unknown> {
  const target = await resolveTarget(root, requirePositional(argv, "id"));
  const parsed = parseTrackerFile(await readFile(target.file, "utf8"));
  return {
    id: target.id,
    kind: target.kind,
    spec: target.slug,
    title: parsed.title,
    status: parsed.status,
    blockedBy: parsed.blockedBy,
    body: parsed.body,
    comments: parsed.comments,
  };
}

async function frontier(root: string, argv: readonly string[]): Promise<unknown> {
  const slug = requireSlug(requireFlag(argv, "--spec"));
  requireSpec(root, slug);
  const tickets = await loadTickets(root, slug);
  return computeFrontier(tickets).map(ticketSummary);
}

async function applyStatus(
  root: string,
  target: Target,
  status: TrackerStatus,
): Promise<{ id: string; status: TrackerStatus; specStatus?: TrackerStatus }> {
  const text = await readFile(target.file, "utf8");
  await writeAtomically(target.file, setStatusLine(text, status));
  if (target.kind !== "ticket" || !CLOSED_STATUSES.has(status)) {
    return { id: target.id, status };
  }
  const tickets = await loadTickets(root, target.slug);
  const everyClosed = tickets.every((ticket) => {
    const current = ticket.id === target.id ? status : ticket.status;
    return current !== null && CLOSED_STATUSES.has(current);
  });
  if (!everyClosed) {
    return { id: target.id, status };
  }
  const specPath = specFile(root, target.slug);
  await writeAtomically(specPath, setStatusLine(await readFile(specPath, "utf8"), "done"));
  return { id: target.id, status, specStatus: "done" };
}

async function mutateStatus(
  root: string,
  id: string,
  status: TrackerStatus,
  requireTicket: boolean,
): Promise<unknown> {
  requireSlug(id);
  const slug = parseTicketId(id)?.slug ?? id;
  return withSpecLock(slug, async () => {
    const target = await resolveTarget(root, id);
    if (requireTicket && target.kind !== "ticket") {
      throw new TrackerRefusedError(`"${id}" is a spec, not a ticket`);
    }
    return applyStatus(root, target, status);
  });
}

async function setState(root: string, argv: readonly string[]): Promise<unknown> {
  const id = requirePositional(argv, "id");
  const status = argv[1];
  if (status === undefined || !isTrackerStatus(status)) {
    throw new TrackerUsageError(
      `invalid status "${status ?? ""}": expected one of ${TRACKER_STATUSES.join(", ")}`,
    );
  }
  return mutateStatus(root, id, status, false);
}

const CLOSE_VALUE_FLAGS: ReadonlySet<string> = new Set(["--pr", "--reason"]);

function positionalTickets(argv: readonly string[]): string[] {
  const tickets: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (CLOSE_VALUE_FLAGS.has(token)) index += 1;
    else if (!token.startsWith("--")) tickets.push(token);
  }
  return tickets;
}

function closeReason(argv: readonly string[]): CloseReason {
  const value = flagValue(argv, "--reason") ?? "completed";
  if (value === "completed" || value === "not_planned") return value;
  throw new TrackerUsageError(`invalid --reason "${value}": expected completed or not_planned`);
}

function closePullRequest(argv: readonly string[]): number | undefined {
  const value = flagValue(argv, "--pr");
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new TrackerUsageError(`invalid --pr "${value}"`);
  return Number(value);
}

async function isGithubTracker(): Promise<boolean> {
  const repoRoot = await resolveRepoRoot();
  if (repoRoot === null) return false;
  const loaded = await loadForgeConfig(repoRoot);
  return loaded.status === "ok" && loaded.config.tracker.kind === "github";
}

function recordTicketCloses(
  root: string,
  results: readonly TicketCloseResult[],
  pr: number | undefined,
  reason: CloseReason,
): void {
  for (const result of results) {
    if (result.outcome !== "closed") continue;
    appendEvent({
      kind: "ticket.close",
      repo: root,
      origin: "human",
      data: {
        ticket: result.ticket,
        issue: result.issue,
        ...(pr === undefined ? {} : { pr }),
        reason,
      },
    });
  }
}

async function closeGithub(root: string, argv: readonly string[]): Promise<unknown> {
  const tickets = positionalTickets(argv);
  if (tickets.length === 0) throw new TrackerUsageError(`missing <ticket>\n\n${USAGE}`);
  const pr = closePullRequest(argv);
  const reason = closeReason(argv);
  const results = await closeGithubTickets(
    tickets,
    { ...(pr === undefined ? {} : { pr }), reason },
    runGh,
  );
  recordTicketCloses(root, results, pr, reason);
  const specs = await closeCompletedSpecs(results, runGh);
  const anyFailed =
    results.some((result) => result.outcome === "failed") ||
    specs.some((spec) => spec.outcome === "failed");
  if (anyFailed) process.exitCode = EXIT_REFUSED;
  return { results, specs };
}

async function close(root: string, argv: readonly string[]): Promise<unknown> {
  if (await isGithubTracker()) return closeGithub(root, argv);
  const id = requirePositional(argv, "id");
  return mutateStatus(root, id, argv.includes("--canceled") ? "canceled" : "done", true);
}

async function comment(root: string, argv: readonly string[]): Promise<unknown> {
  const id = requirePositional(argv, "id");
  const body = await readBodyFile(argv);
  const author = flagValue(argv, "--author") ?? PRODUCT;
  requireSlug(id);
  const slug = parseTicketId(id)?.slug ?? id;
  return withSpecLock(slug, async () => {
    const target = await resolveTarget(root, id);
    const timestamp = new Date().toISOString();
    const text = await readFile(target.file, "utf8");
    await writeAtomically(target.file, appendComment(text, `${timestamp} — ${author}`, body));
    return { id: target.id, timestamp, author };
  });
}

async function dispatch(subcommand: string, argv: readonly string[]): Promise<unknown> {
  const root = await resolveTrackerRoot();
  switch (subcommand) {
    case "create-spec":
      return createSpec(root, argv);
    case "create-ticket":
      return createTicket(root, argv);
    case "read":
      return readItem(root, argv);
    case "frontier":
      return frontier(root, argv);
    case "set-state":
      return setState(root, argv);
    case "comment":
      return comment(root, argv);
    case "close":
      return close(root, argv);
    default:
      throw new TrackerUsageError(`unknown subcommand "${subcommand}"\n\n${USAGE}`);
  }
}

export async function run(argv: string[]): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined) {
    console.error(USAGE);
    process.exitCode = EXIT_USAGE;
    return;
  }
  try {
    console.log(JSON.stringify(await dispatch(subcommand, rest)));
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode =
      error instanceof TrackerUsageError
        ? EXIT_USAGE
        : error instanceof TrackerRefusedError || errnoCode(error) === "ENOENT"
          ? EXIT_REFUSED
          : EXIT_USAGE;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

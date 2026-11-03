import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { errnoCode } from "./narrow";

export const TRACKER_STATUSES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
  "in-progress",
  "in-review",
  "done",
  "canceled",
  "claimed",
  "resolved",
] as const;

export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

export interface ParsedTrackerFile {
  title: string;
  status: TrackerStatus | null;
  blockedBy: string[];
  body: string;
  comments: string[];
}

export interface TicketFile extends ParsedTrackerFile {
  id: string;
  slug: string;
  nn: string;
  file: string;
}

const STATUS_LINE = /^(\*\*)?status(?:\*\*:|:\*\*|:)\s*(.*)$/i;
const BLOCKED_LINE = /^(\*\*)?blocked[ -]by(?:\*\*:|:\*\*|:)\s*(.*)$/i;
const COMMENTS_HEADING = /^##\s+comments\s*$/i;
const SECOND_LEVEL_HEADING = /^##\s/;
const COMMENT_HEADING = /^###\s/;
const TICKET_ID = /^([a-z0-9][a-z0-9-]*)-(\d{2,})$/;
const TICKET_FILE = /^(\d{2,})-.+\.md$/;

/**
 * Resolves the tracker root: the main worktree's directory, found from
 * `git rev-parse --git-common-dir` so every linked worktree agrees on it.
 * `.scratch/` lives directly under the returned directory.
 */
export async function resolveTrackerRoot(cwd: string = process.cwd()): Promise<string> {
  const result = await Bun.$`git -C ${cwd} rev-parse --path-format=absolute --git-common-dir`
    .nothrow()
    .quiet();
  if (result.exitCode !== 0) {
    throw new Error(`not a git repository: ${cwd}`);
  }
  const commonDirectory = result.stdout.toString().trim();
  return path.basename(commonDirectory) === ".git"
    ? path.dirname(commonDirectory)
    : commonDirectory;
}

/** Builds a ticket id from a feature slug and a zero-padded ticket number. */
export function ticketId(slug: string, nn: string): string {
  return `${slug}-${nn}`;
}

/** Splits a ticket id into its feature slug and number, or null if it is not one. */
export function parseTicketId(id: string): { slug: string; nn: string } | null {
  const match = TICKET_ID.exec(id);
  const slug = match?.[1];
  const nn = match?.[2];
  return slug !== undefined && nn !== undefined ? { slug, nn } : null;
}

function parseStatusValue(value: string): TrackerStatus | null {
  const token = value.replace(/\*+/g, " ").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return TRACKER_STATUSES.find((status) => status === token) ?? null;
}

function parseBlockedByValue(value: string): string[] {
  const cleaned = value.replace(/\*+/g, "").trim();
  if (cleaned === "" || /^none\b/i.test(cleaned)) {
    return [];
  }
  const blockers: string[] = [];
  for (const segment of cleaned.split(/[,;]|\band\b/i)) {
    if (segment.trim() === "") {
      continue;
    }
    const number = /^\s*[[#]?(?:[a-z0-9-]*-)?(\d+)\b/i.exec(segment)?.[1];
    blockers.push(number ?? `unresolved:${segment.trim()}`);
  }
  return blockers;
}

function splitComments(lines: string[]): string[] {
  const comments: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (COMMENT_HEADING.test(line)) {
      if (current) {
        comments.push(current.join("\n").trim());
      }
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) {
    comments.push(current.join("\n").trim());
  }
  return comments;
}

/**
 * Parses a tracker markdown file. Metadata lines (`Status:`, `Blocked by:`,
 * plain or bold) are recognised only above the first `##` heading; the body
 * is everything between them and `## Comments`.
 */
export function parseTrackerFile(text: string): ParsedTrackerFile {
  const lines = text.split(/\r?\n/);
  const commentsIndex = lines.findIndex((line) => COMMENTS_HEADING.test(line));
  const contentLines = commentsIndex === -1 ? lines : lines.slice(0, commentsIndex);
  const commentLines = commentsIndex === -1 ? [] : lines.slice(commentsIndex + 1);

  let title = "";
  let status: TrackerStatus | null = null;
  let blockedBy: string[] = [];
  let inHeader = true;
  const bodyLines: string[] = [];
  for (const line of contentLines) {
    if (inHeader && SECOND_LEVEL_HEADING.test(line)) {
      inHeader = false;
    }
    if (inHeader) {
      const statusMatch = STATUS_LINE.exec(line);
      if (statusMatch) {
        status = parseStatusValue(statusMatch[2] ?? "");
        continue;
      }
      const blockedMatch = BLOCKED_LINE.exec(line);
      if (blockedMatch) {
        blockedBy = parseBlockedByValue(blockedMatch[2] ?? "");
        continue;
      }
      if (title === "" && /^#\s/.test(line)) {
        title = line.replace(/^#\s+/, "").trim();
        continue;
      }
    }
    bodyLines.push(line);
  }
  return {
    title,
    status,
    blockedBy,
    body: bodyLines.join("\n").trim(),
    comments: splitComments(commentLines),
  };
}

/**
 * Sets the `Status:` line, preserving its plain or bold form when one exists
 * and otherwise inserting `Status: <value>` right after the title.
 */
export function setStatusLine(text: string, status: TrackerStatus): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const commentsIndex = lines.findIndex((line) => COMMENTS_HEADING.test(line));
  const limit = commentsIndex === -1 ? lines.length : commentsIndex;
  for (let index = 0; index < limit; index += 1) {
    const line = lines[index] ?? "";
    if (SECOND_LEVEL_HEADING.test(line)) {
      break;
    }
    const match = STATUS_LINE.exec(line);
    if (match) {
      lines[index] = match[1] ? `**Status:** ${status}` : `Status: ${status}`;
      return lines.join(eol);
    }
  }
  const titleIndex = lines.findIndex((line) => /^#\s/.test(line));
  if (titleIndex === -1) {
    return `Status: ${status}${eol}${eol}${text}`;
  }
  lines.splice(titleIndex + 1, 0, "", `Status: ${status}`);
  return lines.join(eol);
}

/**
 * Appends a `### <header>` comment with `body` under `## Comments`, creating
 * the heading once.
 */
export function appendComment(text: string, header: string, body: string): string {
  const base = text.replace(/\s+$/, "");
  const hasHeading = text.split(/\r?\n/).some((line) => COMMENTS_HEADING.test(line));
  const prefix = hasHeading ? `${base}\n\n` : `${base}\n\n## Comments\n\n`;
  return `${prefix}### ${header}\n\n${body.trim()}\n`;
}

/**
 * Lists a spec's tickets from `<root>/.scratch/<slug>/issues/`, ordered by
 * ticket number ascending. A missing directory yields an empty list.
 */
export async function listTickets(root: string, slug: string): Promise<TicketFile[]> {
  const directory = path.join(root, ".scratch", slug, "issues");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") {
      return [];
    }
    throw error;
  }
  const tickets = await Promise.all(
    names.flatMap((name) => {
      const nn = TICKET_FILE.exec(name)?.[1];
      if (nn === undefined) {
        return [];
      }
      const file = path.join(directory, name);
      return [
        readFile(file, "utf8").then((text): TicketFile => ({
          ...parseTrackerFile(text),
          id: ticketId(slug, nn),
          slug,
          nn,
          file,
        })),
      ];
    }),
  );
  return tickets.toSorted((left, right) => Number(left.nn) - Number(right.nn));
}

/**
 * The dispatchable tickets: `ready-for-agent` with every blocker present and
 * `done` or `resolved`, ordered by number ascending. A blocker naming a
 * nonexistent ticket keeps its dependant out.
 */
export function computeFrontier(tickets: TicketFile[]): TicketFile[] {
  const statusByNumber = new Map<number, TrackerStatus | null>(
    tickets.map((ticket) => [Number(ticket.nn), ticket.status]),
  );
  return tickets
    .filter(
      (ticket) =>
        ticket.status === "ready-for-agent" &&
        ticket.blockedBy.every((blocker) => {
          const blockerStatus = statusByNumber.get(Number(blocker));
          return blockerStatus === "done" || blockerStatus === "resolved";
        }),
    )
    .toSorted((left, right) => Number(left.nn) - Number(right.nn));
}

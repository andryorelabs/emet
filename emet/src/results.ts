import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveRepoRoot } from "./config";
import { errorMessage, isObject, isOneOf } from "./narrow";
import { resolveRunDir } from "./names";

async function resolveSharedRoot(): Promise<string> {
  const output = await Bun.$`git rev-parse --path-format=absolute --git-common-dir`
    .nothrow()
    .quiet();
  const commonDirectory = output.stdout.toString().trim();
  if (output.exitCode === 0 && commonDirectory.length > 0) return commonDirectory;
  return (await resolveRepoRoot()) ?? process.cwd();
}

const USAGE = `usage: emet results --run <id> --write <ticket> --status <status> --report <path> --risk "<Risk: ...>" [--root <dir>]
       emet results --run <id> --read <ticket> [--root <dir>]

status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Files live in <git-common-dir>/.emet/runs/<id>/results/<ticket>.json, shared by every worktree
(local; only the coordinator writes the tracker).`;

const RESULT_STATUSES = ["DONE", "DONE_WITH_CONCERNS", "BLOCKED", "NEEDS_CONTEXT"] as const;

type ResultStatus = (typeof RESULT_STATUSES)[number];

export interface WorkerResult {
  readonly status: ResultStatus;
  readonly reportPath: string;
  readonly risk: string;
}

function resultPath(resultsDirectory: string, ticket: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ticket) || ticket.includes("..")) {
    throw new Error(`invalid ticket id: ${ticket}`);
  }
  return path.join(resultsDirectory, `${ticket}.json`);
}

function validateResult(result: WorkerResult): void {
  if (!RESULT_STATUSES.includes(result.status)) {
    throw new Error(`invalid status "${result.status}" (expected ${RESULT_STATUSES.join("|")})`);
  }
  if (result.reportPath.trim().length === 0) throw new Error("report path is empty");
  if (!/^Risk: \S/.test(result.risk)) {
    throw new Error('risk line must be "Risk: none" or "Risk: item N (reason)"');
  }
}

export function writeResult(resultsDirectory: string, ticket: string, result: WorkerResult): void {
  const target = resultPath(resultsDirectory, ticket);
  validateResult(result);
  mkdirSync(resultsDirectory, { recursive: true });
  const { status, reportPath, risk } = result;
  writeFileSync(target, `${JSON.stringify({ status, reportPath, risk }, null, 2)}\n`);
}

export function readResult(resultsDirectory: string, ticket: string): WorkerResult | null {
  const target = resultPath(resultsDirectory, ticket);
  if (!existsSync(target)) return null;
  const parsed: unknown = JSON.parse(readFileSync(target, "utf8"));
  if (!isObject(parsed)) throw new Error("result is not a JSON object");
  const { status, reportPath, risk } = parsed;
  if (!isOneOf(RESULT_STATUSES, status)) {
    throw new Error(`invalid status "${String(status)}" (expected ${RESULT_STATUSES.join("|")})`);
  }
  if (typeof reportPath !== "string" || typeof risk !== "string") {
    throw new Error("report path and risk must be strings");
  }
  const result: WorkerResult = { status, reportPath, risk };
  validateResult(result);
  return result;
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export async function run(argv: string[]): Promise<void> {
  const runId = readFlag(argv, "--run");
  if (runId === undefined || runId.length === 0 || /[\\/]|^\.\.?$/.test(runId)) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const root = readFlag(argv, "--root") ?? (await resolveSharedRoot());
  const resultsDirectory = path.join(resolveRunDir(root).path, "runs", runId, "results");
  const writeTicket = readFlag(argv, "--write");
  const readTicket = readFlag(argv, "--read");

  try {
    if (writeTicket !== undefined) {
      const status = readFlag(argv, "--status");
      const reportPath = readFlag(argv, "--report");
      const risk = readFlag(argv, "--risk");
      if (status === undefined || reportPath === undefined || risk === undefined) {
        console.error(USAGE);
        process.exitCode = 2;
        return;
      }
      if (!isOneOf(RESULT_STATUSES, status)) {
        throw new Error(`invalid status "${status}" (expected ${RESULT_STATUSES.join("|")})`);
      }
      writeResult(resultsDirectory, writeTicket, {
        status,
        reportPath,
        risk,
      });
      return;
    }
    if (readTicket !== undefined) {
      const result = readResult(resultsDirectory, readTicket);
      if (result === null) {
        console.error(`emet results: no result for ${readTicket}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(result));
      return;
    }
    console.error(USAGE);
    process.exitCode = 2;
  } catch (error) {
    console.error(`emet results: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

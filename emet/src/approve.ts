import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveRepoRoot } from "./config";
import { errorMessage, isObject } from "./narrow";
import { resolveRunArtifactPath } from "./runs";

const USAGE = `usage: emet approve --run <id> --spec <file> [--tickets <file>] [--root <dir>]
       emet approve --run <id> --check [--root <dir>]

Writes <git-common-dir>/.emet/runs/<id>/approval.json (spec hash, tickets hash, timestamp).
--tickets defaults to <git-common-dir>/.emet/runs/<id>/tickets.json, falling back to
<root>/.emet/runs/<id>/tickets.json.
--check exits 1 when the spec or tickets changed since approval.`;

export interface ApprovalRecord {
  readonly specPath: string;
  readonly ticketsPath: string;
  readonly specHash: string;
  readonly ticketsHash: string;
  readonly approvedAt: string;
}

export interface ApprovalCheck {
  readonly ok: boolean;
  readonly reasons: string[];
}

export function hashFile(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function writeApproval(input: {
  approvalPath: string;
  specPath: string;
  ticketsPath: string;
  now?: Date;
}): ApprovalRecord {
  const specPath = path.resolve(input.specPath);
  const ticketsPath = path.resolve(input.ticketsPath);
  const record: ApprovalRecord = {
    specPath,
    ticketsPath,
    specHash: hashFile(specPath),
    ticketsHash: hashFile(ticketsPath),
    approvedAt: (input.now ?? new Date()).toISOString(),
  };
  mkdirSync(path.dirname(input.approvalPath), { recursive: true });
  writeFileSync(input.approvalPath, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function readApproval(approvalPath: string): ApprovalRecord | string {
  if (!existsSync(approvalPath)) return `no approval record at ${approvalPath}`;
  try {
    const parsed: unknown = JSON.parse(readFileSync(approvalPath, "utf8"));
    if (!isObject(parsed)) return `approval record at ${approvalPath} is missing fields`;
    const { specPath, ticketsPath, specHash, ticketsHash, approvedAt } = parsed;
    if (
      typeof specPath !== "string" ||
      typeof ticketsPath !== "string" ||
      typeof specHash !== "string" ||
      typeof ticketsHash !== "string" ||
      typeof approvedAt !== "string"
    ) {
      return `approval record at ${approvalPath} is missing fields`;
    }
    return { specPath, ticketsPath, specHash, ticketsHash, approvedAt };
  } catch (error) {
    return `approval record at ${approvalPath} is unreadable: ${errorMessage(error)}`;
  }
}

function currentHashMismatch(label: string, filePath: string, expected: string): string | null {
  if (!existsSync(filePath)) return `${label} file is missing: ${filePath}`;
  return hashFile(filePath) === expected ? null : `${label} changed since approval: ${filePath}`;
}

export function checkApproval(approvalPath: string): ApprovalCheck {
  const record = readApproval(approvalPath);
  if (typeof record === "string") return { ok: false, reasons: [record] };
  const reasons = [
    currentHashMismatch("spec", record.specPath, record.specHash),
    currentHashMismatch("tickets", record.ticketsPath, record.ticketsHash),
  ].filter((reason): reason is string => reason !== null);
  return { ok: reasons.length === 0, reasons };
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
  const root = readFlag(argv, "--root") ?? (await resolveRepoRoot()) ?? process.cwd();
  const approval = await resolveRunArtifactPath(runId, "approval.json", { repoRoot: root });

  if (argv.includes("--check")) {
    const result = checkApproval(approval.readPath ?? approval.writePath);
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  const specPath = readFlag(argv, "--spec");
  if (specPath === undefined) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const tickets = await resolveRunArtifactPath(runId, "tickets.json", { repoRoot: root });
  const ticketsPath = readFlag(argv, "--tickets") ?? tickets.readPath ?? tickets.writePath;
  try {
    console.log(
      JSON.stringify(writeApproval({ approvalPath: approval.writePath, specPath, ticketsPath })),
    );
  } catch (error) {
    console.error(`emet approve: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

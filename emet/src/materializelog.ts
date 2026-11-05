import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveRepoRoot } from "./config";
import { errorMessage, isObject } from "./narrow";
import { resolveRunArtifactPath } from "./runs";

const USAGE = `usage: emet materialize-log --run <id> --record <localKey> <trackerId> [--root <dir>]
       emet materialize-log --run <id> --lookup <localKey> [--root <dir>]

--record persists immediately to <git-common-dir>/.emet/runs/<id>/materialize.json.
--lookup prints the tracker id and exits 0, or exits 1 when the key was never recorded
(materialize re-runs skip recorded keys). Any other failure, including an unreadable
log, exits 2.`;

type MaterializeLog = Record<string, string>;

function readLog(logPath: string): MaterializeLog {
  if (!existsSync(logPath)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(logPath, "utf8"));
  } catch (error) {
    throw new Error(`materialize log ${logPath} is unreadable: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new Error(`materialize log ${logPath} is not a key/ticket map`);
  }
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function lookupTicket(logPath: string, localKey: string): string | null {
  const log = readLog(logPath);
  return Object.hasOwn(log, localKey) ? log[localKey]! : null;
}

export function recordTicket(
  logPath: string,
  localKey: string,
  trackerId: string,
  readPath: string = logPath,
): void {
  const log = readLog(readPath);
  if (Object.hasOwn(log, localKey)) {
    if (log[localKey] === trackerId) return;
    throw new Error(
      `${localKey} already recorded as ${log[localKey]}; refusing to record ${trackerId}`,
    );
  }
  log[localKey] = trackerId;
  mkdirSync(path.dirname(logPath), { recursive: true });
  const temporaryPath = `${logPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(log, null, 2)}\n`);
  renameSync(temporaryPath, logPath);
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
  const artifact = await resolveRunArtifactPath(runId, "materialize.json", { repoRoot: root });
  const logPath = artifact.writePath;
  const readPath = artifact.readPath ?? logPath;
  const recordIndex = argv.indexOf("--record");
  const lookupKey = readFlag(argv, "--lookup");

  try {
    if (recordIndex !== -1) {
      const localKey = argv[recordIndex + 1];
      const trackerId = argv[recordIndex + 2];
      if (localKey === undefined || trackerId === undefined) {
        console.error(USAGE);
        process.exitCode = 2;
        return;
      }
      recordTicket(logPath, localKey, trackerId, readPath);
      return;
    }
    if (lookupKey !== undefined) {
      const trackerId = lookupTicket(readPath, lookupKey);
      if (trackerId === null) {
        process.exitCode = 1;
        return;
      }
      console.log(trackerId);
      return;
    }
    console.error(USAGE);
    process.exitCode = 2;
  } catch (error) {
    console.error(`emet materialize-log: ${errorMessage(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

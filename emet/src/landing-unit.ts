import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ForgeConfig, LandingUnit } from "./config";
import { EmetError } from "./errors";
import { errorMessage, isObject } from "./narrow";
import { runDirectory } from "./runs";

const APPROVAL_FILE = "approval.json";

function resolveCommonDirectorySync(root: string): string | null {
  try {
    const output = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return path.isAbsolute(output) ? output : null;
  } catch {
    return null;
  }
}

function findApprovalPath(runId: string, root: string): string | null {
  const commonDirectory = resolveCommonDirectorySync(root);
  const candidates = [
    ...(commonDirectory === null
      ? []
      : [path.join(runDirectory(commonDirectory, runId), APPROVAL_FILE)]),
    path.join(runDirectory(root, runId), APPROVAL_FILE),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function malformedApproval(approvalPath: string, detail: string): EmetError {
  return new EmetError(
    "internal",
    `approval record at ${approvalPath} is malformed: ${detail}`,
    "re-run `emet approve` for this run to rewrite approval.json",
  );
}

function readApprovalMode(approvalPath: string): "quick" | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(approvalPath, "utf8"));
  } catch (error) {
    throw malformedApproval(approvalPath, errorMessage(error));
  }
  if (!isObject(parsed) || Array.isArray(parsed))
    throw malformedApproval(approvalPath, "not a JSON object");
  const { mode } = parsed;
  if (mode === undefined) return null;
  if (mode === "quick") return "quick";
  throw malformedApproval(approvalPath, `unknown mode ${JSON.stringify(mode)}`);
}

/**
 * The landing unit that applies to a run: `wave` when its `approval.json`
 * says `mode: "quick"`, so a Quick run never expects a spec branch, and
 * `config.landing.unit` otherwise (no run, no record, or no mode).
 * @throws {EmetError} When the run's `approval.json` exists but is malformed.
 */
export function resolveLandingUnit(
  config: ForgeConfig,
  runId: string | null,
  root: string,
): LandingUnit {
  if (runId === null) return config.landing.unit;
  const approvalPath = findApprovalPath(runId, root);
  if (approvalPath === null) return config.landing.unit;
  return readApprovalMode(approvalPath) === "quick" ? "wave" : config.landing.unit;
}

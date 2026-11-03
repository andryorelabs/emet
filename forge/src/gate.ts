/**
 * `forge gate <ticket>` — one decision for auto-merge and autoChain.
 *
 * Prints `{decision, reasons[], chargeAttempt, label?}` as JSON, where
 * decision is merge | hold | chain | stop | defer.
 *
 * Inputs: verify record (`.forge/runs/<run>/verify/<ticket>.json`), review
 * ledger (`.forge/review/<ticket>.json`), attempt counter
 * (`.forge/runs/<run>/attempts/<ticket>.json` = {count}), risk tier, CI and
 * integration-suite results (flags), budgets from forge.config.json.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { isObject, isOneOf } from "./narrow";

const USAGE = `usage: forge gate <ticket> [--run <id>] [--tier passive|medium|high]
       [--ci pass|fail|pending|none] [--integration pass|fail|pending|none]
       [--env-exit <code>] [--env-output <file>] [--attempts <n>] [--waves-remaining <n>] [--no-record]`;

export const DEFERRED_LABEL = "forge:deferred";

export type Decision = "merge" | "hold" | "chain" | "stop" | "defer";
export type CheckState = "pass" | "fail" | "pending" | "none";
const GATE_TIERS = ["passive", "medium", "high"] as const;
export type GateTier = (typeof GATE_TIERS)[number];
const FINDING_SEVERITIES = ["blocker", "critical", "major", "minor", "nit"] as const;
type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export interface GateInput {
  /** null = no verify record exists. */
  readonly verifyOk: boolean | null;
  readonly tier: GateTier;
  readonly openFindings: readonly { readonly severity: FindingSeverity }[];
  readonly reviewRoundsUsed: number;
  readonly reviewRoundsCap: number;
  readonly ci: CheckState;
  readonly integration: CheckState;
  readonly attemptsUsed: number;
  readonly workerAttempts: number;
  readonly envFault: boolean;
  readonly autoChain: boolean;
  readonly wavesRemaining: number;
}

export interface GateResult {
  readonly decision: Decision;
  readonly reasons: readonly string[];
  readonly chargeAttempt: boolean;
  readonly label?: string;
}

const OUTAGE_PATTERN =
  /overloaded_error|\b(?:429|500|502|503|504|529)\b.*(?:error|status)|rate.?limit|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|service unavailable|provider outage/i;

export function isEnvFault(exitCode: number, output: string): boolean {
  return exitCode === 126 || exitCode === 127 || OUTAGE_PATTERN.test(output);
}

function blockingSeverities(tier: GateTier): readonly FindingSeverity[] {
  return tier === "high" ? ["blocker", "critical", "major"] : ["blocker", "critical"];
}

function hold(reasons: string[], chargeAttempt = false): GateResult {
  return { decision: "hold", reasons, chargeAttempt };
}

export function decide(input: GateInput): GateResult {
  if (input.integration === "fail") {
    return {
      decision: "stop",
      reasons: ["integration suite is red; nothing merges or chains until it is green"],
      chargeAttempt: false,
    };
  }
  if (input.envFault) {
    return hold([
      "environment fault (exit 126/127 or provider outage); pausing without charging an attempt",
    ]);
  }
  if (input.verifyOk === null) return hold(["no verify record; run forge verify first"]);
  if (!input.verifyOk) {
    if (input.attemptsUsed >= input.workerAttempts) {
      return {
        decision: "defer",
        reasons: [
          `worker attempts exhausted (${input.attemptsUsed}/${input.workerAttempts}); deferring the ticket`,
        ],
        chargeAttempt: false,
        label: DEFERRED_LABEL,
      };
    }
    return hold([`verify failed (attempt ${input.attemptsUsed}/${input.workerAttempts})`], true);
  }

  const blocking = blockingSeverities(input.tier);
  const openBlocking = input.openFindings.filter((finding) => blocking.includes(finding.severity));
  if (openBlocking.length > 0) {
    const summary = `${openBlocking.length} open ${blocking.join("/")} finding(s) at tier ${input.tier}`;
    if (input.reviewRoundsUsed >= input.reviewRoundsCap) {
      return {
        decision: "stop",
        reasons: [
          `${summary}; review rounds exhausted (${input.reviewRoundsUsed}/${input.reviewRoundsCap}), rule on them`,
        ],
        chargeAttempt: false,
      };
    }
    return hold([summary]);
  }
  if (input.ci !== "pass") {
    return hold([input.ci === "none" ? "no CI result yet" : `CI is ${input.ci}`]);
  }
  if (input.integration === "pending") return hold(["integration suite has not finished"]);

  if (input.autoChain && input.wavesRemaining > 0 && input.integration === "pass") {
    return {
      decision: "chain",
      reasons: ["verify, review and CI green; integration suite green; waves remain"],
      chargeAttempt: false,
    };
  }
  return { decision: "merge", reasons: ["verify, review and CI green"], chargeAttempt: false };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readJsonIfPresent(file: string): unknown {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

function readVerifyRecord(file: string): { ok?: boolean } | undefined {
  const raw = readJsonIfPresent(file);
  return isObject(raw) ? { ok: raw.ok === true } : undefined;
}

function readAttemptRecord(file: string): { count?: number } | undefined {
  const raw = readJsonIfPresent(file);
  if (!isObject(raw)) return undefined;
  return typeof raw.count === "number" ? { count: raw.count } : {};
}

function readReviewLedger(
  file: string,
): { rounds: number; findings: { status: string; severity: FindingSeverity }[] } | undefined {
  const raw = readJsonIfPresent(file);
  if (!isObject(raw)) return undefined;
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    rounds: typeof raw.rounds === "number" ? raw.rounds : 0,
    findings: findings.filter(
      (finding): finding is { status: string; severity: FindingSeverity } =>
        isObject(finding) &&
        typeof finding.status === "string" &&
        isOneOf(FINDING_SEVERITIES, finding.severity),
    ),
  };
}

function parseState(value: string | undefined, flag: string): CheckState {
  if (value === undefined) return "none";
  if (value === "pass" || value === "fail" || value === "pending" || value === "none") return value;
  throw new Error(`${flag} must be pass|fail|pending|none`);
}

function resolveRunId(runsDir: string, ticket: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  const candidates = existsSync(runsDir)
    ? readdirSync(runsDir).filter((id) =>
        existsSync(path.join(runsDir, id, "dispatch", `${ticket}.json`)),
      )
    : [];
  if (candidates.length !== 1) throw new Error(`cannot infer run for ${ticket}; pass --run <id>`);
  return candidates[0]!;
}

export async function run(argv: string[]): Promise<void> {
  const ticket = argv[0];
  if (!ticket || ticket.startsWith("--")) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  try {
    const repoRoot = (await resolveRepoRoot()) ?? process.cwd();
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const runsDir = path.join(repoRoot, ".forge", "runs");
    const runId = resolveRunId(runsDir, ticket, readFlag(argv, "--run"));
    if (!/^[\w-]+$/.test(runId) || !/^[\w-]+$/.test(ticket))
      throw new Error("invalid run or ticket id");
    const runDir = path.join(runsDir, runId);

    const verify = readVerifyRecord(path.join(runDir, "verify", `${ticket}.json`));
    const ledger = readReviewLedger(path.join(repoRoot, ".forge", "review", `${ticket}.json`));
    const stored = readAttemptRecord(path.join(runDir, "attempts", `${ticket}.json`));

    const tier = readFlag(argv, "--tier") ?? "medium";
    if (!isOneOf(GATE_TIERS, tier)) throw new Error("--tier must be passive|medium|high");
    const envExit = readFlag(argv, "--env-exit");
    const envOutputFile = readFlag(argv, "--env-output");
    const envOutput =
      envOutputFile && existsSync(envOutputFile) ? readFileSync(envOutputFile, "utf8") : "";

    const attemptsUsedBefore = Number(readFlag(argv, "--attempts") ?? stored?.count ?? 0);
    const result = decide({
      verifyOk: verify === undefined ? null : verify.ok === true,
      tier,
      openFindings: (ledger?.findings ?? []).filter((finding) => finding.status === "open"),
      reviewRoundsUsed: ledger?.rounds ?? 0,
      reviewRoundsCap: config.budgets.reviewRounds,
      ci: parseState(readFlag(argv, "--ci"), "--ci"),
      integration: parseState(readFlag(argv, "--integration"), "--integration"),
      attemptsUsed: attemptsUsedBefore,
      workerAttempts: config.budgets.workerAttempts,
      envFault: isEnvFault(envExit === undefined ? 0 : Number(envExit), envOutput),
      autoChain: config.handoff.autoChain,
      wavesRemaining: Number(readFlag(argv, "--waves-remaining") ?? 0),
    });
    if (result.chargeAttempt && !argv.includes("--no-record")) {
      const attemptsDir = path.join(runDir, "attempts");
      mkdirSync(attemptsDir, { recursive: true });
      writeFileSync(
        path.join(attemptsDir, `${ticket}.json`),
        JSON.stringify({ count: attemptsUsedBefore + 1 }),
      );
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`forge gate: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

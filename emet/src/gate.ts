/**
 * `emet gate <ticket>` — one decision for auto-merge and autoChain.
 *
 * Prints `{decision, reasons[], chargeAttempt, label?}` as JSON, where
 * decision is merge | hold | chain | stop | defer.
 *
 * Inputs: verify record (`.emet/runs/<run>/verify/<ticket>.json`), review
 * ledger (`.emet/review/<ticket>.json`), attempt counter
 * (`.emet/runs/<run>/attempts/<ticket>.json` = {count}), risk tier, CI and
 * integration-suite results (flags), budgets from emet.config.json.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { resolveRunDir } from "./names";
import { isObject, isOneOf } from "./narrow";
import { writePhase } from "./phase";
import { present } from "./present";
import type { FindingKind } from "./review";

const USAGE = `usage: emet gate <ticket> [--run <id>] [--tier passive|medium|high]
       [--ci pass|fail|pending|none|env-fault] [--integration pass|fail|pending|none]
       [--env-exit <code>] [--env-output <file>] [--attempts <n>] [--waves-remaining <n>] [--no-record]`;

export const DEFERRED_LABEL = "forge:deferred";

type Decision = "merge" | "hold" | "chain" | "stop" | "defer";
type CheckState = "pass" | "fail" | "pending" | "none";
type CiState = CheckState | "env-fault";
type GateOnHold = "fix-and-continue" | "stop";
type GateNext = "fix-findings" | "rerun-failed-specs" | "rerun-ci" | "report-infrastructure";
const FINDING_KINDS = ["intent_gap", "bad_plan", "patch", "defer"] as const;
const GATE_TIERS = ["passive", "medium", "high"] as const;
type GateTier = (typeof GATE_TIERS)[number];
const FINDING_SEVERITIES = ["blocker", "critical", "major", "minor", "nit"] as const;
type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export interface GateInput {
  /** null = no verify record exists. */
  readonly verifyOk: boolean | null;
  readonly tier: GateTier;
  readonly openFindings: readonly {
    readonly severity: FindingSeverity;
    readonly kind: FindingKind;
  }[];
  readonly reviewRoundsUsed: number;
  readonly reviewRoundsCap: number;
  readonly ci: CiState;
  readonly integration: CheckState;
  readonly onHold: GateOnHold;
  readonly fixRoundsUsed: number;
  readonly fixRoundsCap: number;
  /** Failures of the integration suite including the one being decided. */
  readonly integrationFailures: number;
  /** Consecutive CI environment faults including the one being decided. */
  readonly ciEnvFaults: number;
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
  readonly next?: GateNext;
}

const OUTAGE_PATTERN =
  /overloaded_error|\b(?:429|500|502|503|504|529)\b.*(?:error|status)|rate.?limit|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|service unavailable|provider outage/i;

export function isEnvFault(exitCode: number, output: string): boolean {
  return exitCode === 126 || exitCode === 127 || OUTAGE_PATTERN.test(output);
}

function blockingSeverities(tier: GateTier): readonly FindingSeverity[] {
  return tier === "high" ? ["blocker", "critical", "major"] : ["blocker", "critical"];
}

function hold(reasons: string[], chargeAttempt = false, next?: GateNext): GateResult {
  return next === undefined
    ? { decision: "hold", reasons, chargeAttempt }
    : { decision: "hold", reasons, chargeAttempt, next };
}

function stop(reason: string): GateResult {
  return { decision: "stop", reasons: [reason], chargeAttempt: false };
}

function decideIntegrationFailure(input: GateInput): GateResult {
  if (input.onHold === "fix-and-continue" && input.integrationFailures <= 1) {
    return hold(
      ["integration suite failed; rerun the failed specs in isolation"],
      false,
      "rerun-failed-specs",
    );
  }
  const reason =
    input.onHold === "fix-and-continue"
      ? "integration suite failed again after its failed specs were rerun; rule on it"
      : "integration suite is red; nothing merges or chains until it is green";
  return stop(reason);
}

function decideOpenFindings(input: GateInput, summary: string, hasIntentGap: boolean): GateResult {
  if (input.onHold === "stop") {
    if (input.reviewRoundsUsed >= input.reviewRoundsCap) {
      return stop(
        `${summary}; review rounds exhausted (${input.reviewRoundsUsed}/${input.reviewRoundsCap}), rule on them`,
      );
    }
    return hold([summary]);
  }
  if (hasIntentGap) return stop(`${summary}; an intent_gap finding needs a human ruling`);
  if (input.fixRoundsUsed >= input.fixRoundsCap) {
    return stop(
      `${summary}; fix rounds exhausted (${input.fixRoundsUsed}/${input.fixRoundsCap}), rule on them`,
    );
  }
  return hold(
    [`${summary}; fix round ${input.fixRoundsUsed + 1}/${input.fixRoundsCap} next`],
    false,
    "fix-findings",
  );
}

export function decide(input: GateInput): GateResult {
  if (input.integration === "fail") return decideIntegrationFailure(input);
  if (input.envFault) {
    return hold([
      "environment fault (exit 126/127 or provider outage); pausing without charging an attempt",
    ]);
  }
  if (input.verifyOk === null) return hold(["no verify record; run emet verify first"]);
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
  const hasIntentGap =
    input.onHold === "fix-and-continue" &&
    input.openFindings.some((finding) => finding.kind === "intent_gap");
  if (openBlocking.length > 0 || hasIntentGap) {
    const summary = `${openBlocking.length} open ${blocking.join("/")} finding(s) at tier ${input.tier}`;
    return decideOpenFindings(input, summary, hasIntentGap);
  }
  if (input.ci === "env-fault") {
    if (input.ciEnvFaults >= 2) {
      return hold(
        ["CI never ran twice in a row; report the infrastructure problem"],
        false,
        "report-infrastructure",
      );
    }
    return hold(["CI never ran (environment fault); rerun it"], false, "rerun-ci");
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

interface LedgerFinding {
  readonly status: string;
  readonly severity: FindingSeverity;
  readonly kind: FindingKind;
}

function readReviewLedger(
  file: string,
): { rounds: number; fixRounds: number; findings: LedgerFinding[] } | undefined {
  const raw = readJsonIfPresent(file);
  if (!isObject(raw)) return undefined;
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  return {
    rounds: typeof raw.rounds === "number" ? raw.rounds : 0,
    fixRounds: typeof raw.fixRounds === "number" ? raw.fixRounds : 0,
    findings: findings.flatMap((finding): LedgerFinding[] =>
      isObject(finding) &&
      typeof finding.status === "string" &&
      isOneOf(FINDING_SEVERITIES, finding.severity)
        ? [
            {
              status: finding.status,
              severity: finding.severity,
              kind: isOneOf(FINDING_KINDS, finding.kind) ? finding.kind : "patch",
            },
          ]
        : [],
    ),
  };
}

export function parseState(value: string | undefined, flag: string): CheckState {
  if (value === undefined) return "none";
  if (value === "pass" || value === "fail" || value === "pending" || value === "none") return value;
  throw new Error(`${flag} must be pass|fail|pending|none`);
}

function parseCiState(value: string | undefined): CiState {
  if (value === "env-fault") return "env-fault";
  try {
    return parseState(value, "--ci");
  } catch {
    throw new Error("--ci must be pass|fail|pending|none|env-fault");
  }
}

interface CheckCounters {
  readonly ciEnvFaults: number;
  readonly integrationFailures: number;
}

function count(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function readCounters(file: string): CheckCounters {
  const raw = readJsonIfPresent(file);
  return isObject(raw)
    ? { ciEnvFaults: count(raw.ciEnvFaults), integrationFailures: count(raw.integrationFailures) }
    : { ciEnvFaults: 0, integrationFailures: 0 };
}

function nextCounters(before: CheckCounters, ci: CiState, integration: CheckState): CheckCounters {
  let ciEnvFaults = before.ciEnvFaults;
  if (ci === "env-fault") ciEnvFaults += 1;
  else if (ci === "pass" || ci === "fail") ciEnvFaults = 0;
  let integrationFailures = before.integrationFailures;
  if (integration === "fail") integrationFailures += 1;
  else if (integration === "pass") integrationFailures = 0;
  return { ciEnvFaults, integrationFailures };
}

function resolveRunId(runsDir: string, ticket: string, explicit: string | undefined): string {
  if (explicit) return explicit;
  const candidates = existsSync(runsDir)
    ? readdirSync(runsDir).filter((id) =>
        existsSync(path.join(runsDir, id, "dispatch", `${ticket}.json`)),
      )
    : [];
  if (candidates.length !== 1) throw new Error(`cannot infer run for ${ticket}; pass --run <id>`);
  return present(candidates[0]);
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
    const runsDir = path.join(resolveRunDir(repoRoot).path, "runs");
    const runId = resolveRunId(runsDir, ticket, readFlag(argv, "--run"));
    if (!/^[\w-]+$/.test(runId) || !/^[\w-]+$/.test(ticket))
      throw new Error("invalid run or ticket id");
    const runDir = path.join(runsDir, runId);

    const verify = readVerifyRecord(path.join(runDir, "verify", `${ticket}.json`));
    const ledger = readReviewLedger(
      path.join(resolveRunDir(repoRoot).path, "review", `${ticket}.json`),
    );
    const stored = readAttemptRecord(path.join(runDir, "attempts", `${ticket}.json`));

    const tier = readFlag(argv, "--tier") ?? "medium";
    if (!isOneOf(GATE_TIERS, tier)) throw new Error("--tier must be passive|medium|high");
    const envExit = readFlag(argv, "--env-exit");
    const envOutputFile = readFlag(argv, "--env-output");
    const envOutput =
      envOutputFile && existsSync(envOutputFile) ? readFileSync(envOutputFile, "utf8") : "";

    const attemptsUsedBefore = Number(readFlag(argv, "--attempts") ?? stored?.count ?? 0);
    const ci = parseCiState(readFlag(argv, "--ci"));
    const integration = parseState(readFlag(argv, "--integration"), "--integration");
    const countersFile = path.join(runDir, "checks", `${ticket}.json`);
    const counters = nextCounters(readCounters(countersFile), ci, integration);
    const result = decide({
      verifyOk: verify === undefined ? null : verify.ok === true,
      tier,
      openFindings: (ledger?.findings ?? []).filter((finding) => finding.status === "open"),
      reviewRoundsUsed: ledger?.rounds ?? 0,
      reviewRoundsCap: config.budgets.reviewRounds,
      ci,
      integration,
      onHold: config.gate.onHold,
      fixRoundsUsed: ledger?.fixRounds ?? 0,
      fixRoundsCap: config.budgets.fixRounds,
      integrationFailures: counters.integrationFailures,
      ciEnvFaults: counters.ciEnvFaults,
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
    if (!argv.includes("--no-record")) {
      mkdirSync(path.dirname(countersFile), { recursive: true });
      writeFileSync(countersFile, JSON.stringify(counters));
    }
    writePhase(repoRoot, { phase: "checking", wave: null, spec: null, runId });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`emet gate: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

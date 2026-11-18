import { statfsSync } from "node:fs";
import os from "node:os";

import type { AgentHost } from "./agenthost";
import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type HandoffLauncher,
} from "./config";
import type { GateResult } from "./gate";
import { defaultRunner, launchSettingsFor, launchWave, type CommandRunner } from "./launch";
import { BINARY, LEGACY_PRODUCT, PRODUCT } from "./names";
import { errorMessage, isObject } from "./narrow";
import {
  checkMemoryHeadroom,
  readHostResources,
  resolveMemReserveBytesFromEnvironment,
  type HostResources,
} from "./resources";

/**
 * `emet chain`: runs `emet gate` as a subprocess and starts the next wave only
 * when the decision is `chain`, after a readiness check and with a
 * confirmation that the Agent host lists the child session afterwards.
 */

const BYTES_PER_GIB = 1024 ** 3;
const MIN_FREE_BYTES = 2 * BYTES_PER_GIB;
const MIN_FREE_INODES = 10_000;
const GATE_VALUE_FLAGS = [
  "--run",
  "--tier",
  "--ci",
  "--integration",
  "--env-exit",
  "--env-output",
  "--attempts",
  "--waves-remaining",
] as const;

export type ReadinessCode = "low-memory" | "low-disk" | "low-inodes" | "orca-unavailable";

export interface ReadinessIssue {
  readonly code: ReadinessCode;
  readonly blocking: boolean;
  readonly detail: string;
}

export interface DiskStats {
  readonly freeBytes: number;
  readonly freeInodes: number;
}

export interface ReadinessDeps {
  readonly runner: CommandRunner;
  readonly launcher: HandoffLauncher;
  readonly repoRoot: string;
  readonly tmpDir: string;
  readonly readResources: () => HostResources;
  readonly memReserveBytes: number;
  readonly readDiskStats: (directory: string) => DiskStats | null;
  readonly minFreeBytes: number;
  readonly minFreeInodes: number;
}

export interface ChainDeps extends ReadinessDeps {
  readonly host: AgentHost;
  readonly permissionMode: string;
}

export interface ChainRequest {
  readonly specId: string;
  readonly wave: number;
  readonly ticket: string;
  readonly gateArgs: readonly string[];
}

export type ChainGateResult = GateResult & { readonly next?: string };

export interface ChainOutcome {
  readonly launched: boolean;
  readonly verified: boolean;
  readonly name: string | null;
  readonly gate: ChainGateResult;
  readonly issues: readonly ReadinessIssue[];
}

function diskIssues(label: string, stats: DiskStats | null, deps: ReadinessDeps): ReadinessIssue[] {
  if (stats === null) return [];
  const issues: ReadinessIssue[] = [];
  if (stats.freeBytes < deps.minFreeBytes) {
    issues.push({
      code: "low-disk",
      blocking: true,
      detail: `${label}: ${(stats.freeBytes / BYTES_PER_GIB).toFixed(1)} GiB free, below the ${(deps.minFreeBytes / BYTES_PER_GIB).toFixed(1)} GiB minimum`,
    });
  }
  if (stats.freeInodes < deps.minFreeInodes) {
    issues.push({
      code: "low-inodes",
      blocking: true,
      detail: `${label}: ${stats.freeInodes} free inodes, below the ${deps.minFreeInodes} minimum`,
    });
  }
  return issues;
}

async function orcaIssue(deps: ReadinessDeps): Promise<ReadinessIssue[]> {
  if (deps.launcher === "bg") return [];
  const status = await deps.runner(["orca", "status", "--json"]);
  if (status.exitCode === 0) return [];
  return [
    {
      code: "orca-unavailable",
      blocking: deps.launcher === "orca",
      detail: `orca CLI unavailable (exit ${status.exitCode})`,
    },
  ];
}

/** Host memory headroom, free disk and inodes in the repo and the temp dir, and the `orca` CLI. */
export async function checkLaunchReadiness(deps: ReadinessDeps): Promise<ReadinessIssue[]> {
  const issues: ReadinessIssue[] = [];
  const headroom = checkMemoryHeadroom(deps.readResources(), deps.memReserveBytes);
  if (!headroom.ok) {
    issues.push({ code: "low-memory", blocking: true, detail: headroom.reason });
  }
  issues.push(
    ...diskIssues("repo", deps.readDiskStats(deps.repoRoot), deps),
    ...diskIssues("tmp", deps.readDiskStats(deps.tmpDir), deps),
    ...(await orcaIssue(deps)),
  );
  return issues;
}

function isGateResult(value: unknown): value is ChainGateResult {
  return isObject(value) && typeof value.decision === "string" && Array.isArray(value.reasons);
}

async function runGate(request: ChainRequest, runner: CommandRunner): Promise<ChainGateResult> {
  const result = await runner([BINARY, "gate", request.ticket, ...request.gateArgs]);
  if (result.exitCode !== 0) {
    throw new Error(`${BINARY} gate failed (exit ${result.exitCode}): ${result.stderr.trim()}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${BINARY} gate printed output that was not JSON`);
  }
  if (!isGateResult(parsed)) throw new Error(`${BINARY} gate printed an unexpected result`);
  return parsed;
}

async function findExistingSession(
  request: ChainRequest,
  deps: ChainDeps,
): Promise<string | undefined> {
  const names = new Set(
    [PRODUCT, LEGACY_PRODUCT].map((product) => `${product}-${request.specId}-w${request.wave}`),
  );
  const rows = await deps.host.sessions.list(deps.runner);
  return rows.map((row) => row.name ?? "").find((name) => names.has(name));
}

/**
 * Gates the wave, checks readiness, launches the next wave once and confirms
 * the host lists the child session. Any decision but `chain`, a blocking
 * readiness issue or an existing session for the same spec and wave launches
 * nothing.
 */
export async function chainNextWave(request: ChainRequest, deps: ChainDeps): Promise<ChainOutcome> {
  const gate = await runGate(request, deps.runner);
  if (gate.decision !== "chain") {
    return { launched: false, verified: false, name: null, gate, issues: [] };
  }
  const issues = await checkLaunchReadiness(deps);
  if (issues.some((issue) => issue.blocking)) {
    return { launched: false, verified: false, name: null, gate, issues };
  }
  const existing = await findExistingSession(request, deps);
  if (existing !== undefined) {
    return { launched: false, verified: false, name: existing, gate, issues };
  }
  const outcome = await launchWave(
    {
      specId: request.specId,
      wave: request.wave,
      repoRoot: deps.repoRoot,
      launcher: deps.launcher,
      permissionMode: deps.permissionMode,
    },
    deps.runner,
    deps.host,
  ).catch((error: unknown) => {
    throw error instanceof ForgeConfigError ? new Error(error.message, { cause: error }) : error;
  });
  const listed = await deps.host.sessions.list(deps.runner);
  const verified = listed.some((row) => row.name === outcome.name);
  return { launched: true, verified, name: outcome.name, gate, issues };
}

/** Free bytes and inodes of the filesystem holding `directory`, or null when unreadable. */
export function readDiskStats(directory: string): DiskStats | null {
  try {
    const stats = statfsSync(directory);
    return { freeBytes: stats.bavail * stats.bsize, freeInodes: stats.ffree };
  } catch {
    return null;
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseRequest(argv: readonly string[]): ChainRequest {
  const specId = readFlag(argv, "--spec");
  const ticket = readFlag(argv, "--ticket");
  const wave = Number(readFlag(argv, "--wave"));
  if (!specId || !ticket || !Number.isInteger(wave) || wave < 1) {
    throw new ForgeConfigError(
      `usage: ${BINARY} chain --spec <id> --wave <n> --ticket <id> [gate flags]`,
    );
  }
  const gateArgs = GATE_VALUE_FLAGS.flatMap((flag) => {
    const value = readFlag(argv, flag);
    return value === undefined ? [] : [flag, value];
  });
  return { specId, wave, ticket, gateArgs };
}

/** One human-readable line (or lines) for an outcome. */
export function describeOutcome(outcome: ChainOutcome): string {
  if (outcome.launched) {
    return `launched ${outcome.name}${outcome.verified ? "" : " (not yet listed by the host)"}`;
  }
  if (outcome.gate.decision !== "chain") {
    return `gate: ${outcome.gate.decision}: ${outcome.gate.reasons.join("; ")}`;
  }
  if (outcome.issues.length > 0) {
    return outcome.issues.map((issue) => `${issue.code}: ${issue.detail}`).join("\n");
  }
  return `session ${outcome.name ?? ""} already exists, not launching a second one`;
}

export async function run(argv: string[], runner: CommandRunner = defaultRunner): Promise<void> {
  try {
    const request = parseRequest(argv);
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) throw new ForgeConfigError(`${BINARY} chain: not inside a git repository`);
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const settings = launchSettingsFor(config);
    const outcome = await chainNextWave(request, {
      runner,
      host: settings.host,
      launcher: settings.launcher,
      permissionMode: settings.permissionMode,
      repoRoot,
      tmpDir: os.tmpdir(),
      readResources: readHostResources,
      memReserveBytes: resolveMemReserveBytesFromEnvironment(),
      readDiskStats,
      minFreeBytes: MIN_FREE_BYTES,
      minFreeInodes: MIN_FREE_INODES,
    });
    if (argv.includes("--json")) console.log(JSON.stringify(outcome));
    else console.log(describeOutcome(outcome));
    if (!outcome.launched) process.exitCode = 1;
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = error instanceof ForgeConfigError ? 2 : 1;
  }
}

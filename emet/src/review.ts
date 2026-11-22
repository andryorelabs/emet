/**
 * Review findings ledger.
 *
 * Usage:
 *   emet review --ticket <ticket> --findings <file|-> [--changed <a,b>] [--base <ref>]
 *   emet review --ticket <ticket> --coverage <file|-> [--expect S1,S3]
 *   emet review --ticket <ticket> --escalate --model <model>
 *   emet review --ticket <ticket> --rule <what> --why <why> --cost <cost>
 *   emet review --ticket <ticket> --rulings
 *   emet review --ticket <ticket> --recheck --verdicts <file|->
 *
 * The ledger lives at `<repo>/.emet/review/<ticket>.json`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ForgeConfigError, loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { BINARY, resolveRunDir } from "./names";
import { isOneOf } from "./narrow";
import { writePhase } from "./phase";

const USAGE = `usage: ${BINARY} review --ticket <ticket> --findings <file|-> [--changed <a,b>] [--base <ref>]
       ${BINARY} review --ticket <ticket> --coverage <file|-> [--expect S1,S3]
       ${BINARY} review --ticket <ticket> --escalate --model <model>
       ${BINARY} review --ticket <ticket> --rule <what> --why <why> --cost <cost>
       ${BINARY} review --ticket <ticket> --rulings
       ${BINARY} review --ticket <ticket> --recheck --verdicts <file|->`;

const KINDS = ["intent_gap", "bad_plan", "patch", "defer"] as const;
const SEVERITIES = ["blocker", "critical", "major", "minor", "nit"] as const;
export type FindingKind = (typeof KINDS)[number];
type Severity = (typeof SEVERITIES)[number];

const AGREEMENTS = ["both", "single"] as const;
const VERDICTS = ["met", "partial", "unmet"] as const;
const VERIFICATION_GAP_PREFIX = "VG-";

export interface Finding {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly severity: Severity;
  readonly kind: FindingKind;
  readonly claim: string;
  readonly s?: string;
  readonly userOption?: string;
  readonly preexisting?: boolean;
  readonly agreement?: (typeof AGREEMENTS)[number];
}

export interface CoverageVerdict {
  readonly s: string;
  readonly verdict: (typeof VERDICTS)[number];
  readonly test?: { readonly file: string; readonly name: string };
}

interface LedgerFinding extends Finding {
  readonly status: "open" | "deferred" | "resolved";
  readonly round: number;
  readonly deferReason?: string;
}

export interface Ruling {
  readonly what: string;
  readonly why: string;
  readonly cost: string;
}

export interface Ledger {
  readonly ticket: string;
  readonly rounds: number;
  readonly fixRounds: number;
  readonly findings: readonly LedgerFinding[];
  readonly rulings: readonly Ruling[];
  readonly base?: string;
  readonly coverage?: readonly CoverageVerdict[];
}

export function emptyLedger(ticket: string): Ledger {
  return { ticket, rounds: 0, fixRounds: 0, findings: [], rulings: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFinding(raw: unknown, index: number): Finding {
  if (!isRecord(raw)) throw new ForgeConfigError(`finding ${index} must be an object`);
  const { id, file, line, severity, kind, claim } = raw;
  if (typeof id !== "string" || !id) {
    throw new ForgeConfigError(`finding ${index}: id must be a non-empty string`);
  }
  if (typeof file !== "string") throw new ForgeConfigError(`finding ${id}: file must be a string`);
  if (typeof line !== "number" || !Number.isInteger(line)) {
    throw new ForgeConfigError(`finding ${id}: line must be an integer`);
  }
  if (!isOneOf(SEVERITIES, severity)) {
    throw new ForgeConfigError(`finding ${id}: severity must be one of ${SEVERITIES.join(", ")}`);
  }
  if (!isOneOf(KINDS, kind)) {
    throw new ForgeConfigError(`finding ${id}: kind must be one of ${KINDS.join(", ")}`);
  }
  if (typeof claim !== "string")
    throw new ForgeConfigError(`finding ${id}: claim must be a string`);
  return {
    id,
    file,
    line,
    severity,
    kind,
    claim,
    ...parseOptionalFindingFields(raw, id),
  };
}

function parseOptionalFindingFields(
  raw: Record<string, unknown>,
  id: string,
): Pick<Finding, "s" | "userOption" | "preexisting" | "agreement"> {
  const { preexisting, agreement } = raw;
  const s = raw.s ?? undefined;
  const userOption = raw.userOption ?? undefined;
  if (s !== undefined && typeof s !== "string") {
    throw new ForgeConfigError(`finding ${id}: s must be a string`);
  }
  if (userOption !== undefined && typeof userOption !== "string") {
    throw new ForgeConfigError(`finding ${id}: userOption must be a string`);
  }
  if (preexisting !== undefined && typeof preexisting !== "boolean") {
    throw new ForgeConfigError(`finding ${id}: preexisting must be a boolean`);
  }
  if (agreement !== undefined && !isOneOf(AGREEMENTS, agreement)) {
    throw new ForgeConfigError(`finding ${id}: agreement must be one of ${AGREEMENTS.join(", ")}`);
  }
  return {
    ...(s === undefined ? {} : { s }),
    ...(userOption === undefined ? {} : { userOption }),
    ...(preexisting === undefined ? {} : { preexisting }),
    ...(agreement === undefined ? {} : { agreement }),
  };
}

export function parseFindings(text: string): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ForgeConfigError("findings are not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new ForgeConfigError("findings must be a JSON array");
  return parsed.map(parseFinding);
}

export function triageOrder<T extends { readonly kind: FindingKind }>(findings: readonly T[]): T[] {
  return findings.toSorted((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

function isBlocking(severity: Severity): boolean {
  return severity === "blocker" || severity === "critical";
}

export type AddedLines = ReadonlyMap<string, readonly (readonly [number, number])[]>;

export interface RoundOptions {
  readonly changedFiles: readonly string[];
  readonly reviewRounds: number;
  /** Added line ranges of the wave's diff; when set, findings off those lines are marked pre-existing. */
  readonly addedLines?: AddedLines;
  /** Repository root used to make absolute finding paths repo-relative. */
  readonly repoRoot?: string;
}

function isVerificationGap(id: string): boolean {
  return id.startsWith(VERIFICATION_GAP_PREFIX);
}

/** Collects the added or changed line ranges per file from `git diff -U0` output. */
export function parseAddedLines(diff: string): Map<string, [number, number][]> {
  const ranges = new Map<string, [number, number][]>();
  let current: [number, number][] | undefined;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).split("\t")[0] ?? "";
      if (target === "/dev/null") {
        current = undefined;
        continue;
      }
      const file = target.startsWith("b/") ? target.slice(2) : target;
      current = ranges.get(file) ?? [];
      ranges.set(file, current);
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk || !current) continue;
    const start = Number(hunk[1]);
    const length = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (length > 0) current.push([start, start + length - 1]);
  }
  return ranges;
}

function normalizeFindingPath(file: string, repoRoot: string | undefined): string {
  const relative =
    repoRoot !== undefined && path.isAbsolute(file) ? path.relative(repoRoot, file) : file;
  return path.posix.normalize(relative.replaceAll("\\", "/"));
}

function touchesLine(
  addedLines: AddedLines,
  file: string,
  line: number,
  repoRoot: string | undefined,
): boolean {
  const ranges = addedLines.get(normalizeFindingPath(file, repoRoot)) ?? [];
  return ranges.some(([start, end]) => line >= start && line <= end);
}

function withPreexisting(
  entry: Finding,
  addedLines: AddedLines | undefined,
  repoRoot: string | undefined,
): Finding {
  const { preexisting: _reported, ...rest } = entry;
  if (addedLines === undefined) return rest;
  if (isVerificationGap(entry.id) || touchesLine(addedLines, entry.file, entry.line, repoRoot)) {
    return rest;
  }
  return { ...rest, preexisting: true };
}

export type RoundResult =
  | { readonly ok: true; readonly ledger: Ledger }
  | { readonly ok: false; readonly reason: string };

function citesPriorFinding(claim: string, priorIds: readonly string[]): boolean {
  return priorIds.some((priorId) => claim.split(/[^\w-]+/).includes(priorId));
}

export function recordRound(
  ledger: Ledger,
  findings: readonly Finding[],
  options: RoundOptions,
): RoundResult {
  if (ledger.rounds >= options.reviewRounds) {
    return {
      ok: false,
      reason: `review round cap reached (${ledger.rounds}/${options.reviewRounds}); escalate or rule on the open findings`,
    };
  }
  const round = ledger.rounds + 1;
  const priorIds = ledger.findings.map((entry) => entry.id);
  const keptIds = new Set(
    ledger.findings.filter((entry) => entry.status !== "deferred").map((entry) => entry.id),
  );
  const changed = new Set(options.changedFiles);
  const added: LedgerFinding[] = [];
  for (const reported of triageOrder(findings)) {
    const entry = withPreexisting(reported, options.addedLines, options.repoRoot);
    const exempt = round === 1 || !isBlocking(entry.severity) || keptIds.has(entry.id);
    if (exempt || citesPriorFinding(entry.claim, priorIds) || changed.has(entry.file)) {
      added.push({ ...entry, status: "open", round });
      continue;
    }
    added.push({
      ...entry,
      status: "deferred",
      round,
      deferReason:
        "new blocker in recheck cites no prior finding and no file changed since last review",
    });
  }
  const reportedIds = new Set(findings.map((entry) => entry.id));
  const carried: LedgerFinding[] = [];
  for (const entry of ledger.findings) {
    if (reportedIds.has(entry.id)) continue;
    if (isVerificationGap(entry.id)) {
      carried.push(entry);
      continue;
    }
    carried.push(entry.status === "open" ? { ...entry, status: "resolved" } : entry);
  }
  return { ok: true, ledger: { ...ledger, rounds: round, findings: [...carried, ...added] } };
}

export interface CoverageOptions {
  readonly expect: readonly string[];
  readonly fileContains: (file: string, text: string) => boolean;
}

function verificationGap(s: string, file: string, claim: string, round: number): LedgerFinding {
  return {
    id: `${VERIFICATION_GAP_PREFIX}${s}`,
    file,
    line: 0,
    severity: "major",
    kind: "patch",
    claim: `verification-gap: ${claim}`,
    status: "open",
    round,
  };
}

function coverageGaps(
  verdicts: readonly CoverageVerdict[],
  options: CoverageOptions,
  round: number,
): LedgerFinding[] {
  const gaps: LedgerFinding[] = [];
  for (const entry of verdicts) {
    if (entry.verdict !== "met") continue;
    const { test } = entry;
    if (test && options.fileContains(test.file, test.name)) continue;
    gaps.push(verificationGap(entry.s, test?.file ?? "", `${entry.s} met without evidence`, round));
  }
  const covered = new Set(verdicts.map((entry) => entry.s));
  for (const s of options.expect) {
    if (covered.has(s)) continue;
    gaps.push(verificationGap(s, "", `${s} has no coverage verdict`, round));
  }
  return gaps;
}

/**
 * Stores the Coverage verdicts and re-derives the `VG-` findings: a gap no longer
 * produced is resolved, a produced one is open. Uses no review round.
 */
export function recordCoverage(
  ledger: Ledger,
  verdicts: readonly CoverageVerdict[],
  options: CoverageOptions,
): RoundResult {
  const gaps = coverageGaps(verdicts, options, ledger.rounds);
  const producedIds = new Set(gaps.map((gap) => gap.id));
  const kept = ledger.findings.flatMap((entry): LedgerFinding[] => {
    if (!isVerificationGap(entry.id)) return [entry];
    if (producedIds.has(entry.id)) return [];
    return [entry.status === "open" ? { ...entry, status: "resolved" } : entry];
  });
  return {
    ok: true,
    ledger: { ...ledger, coverage: verdicts, findings: [...kept, ...gaps] },
  };
}

export function parseCoverage(text: string): CoverageVerdict[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ForgeConfigError("coverage is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new ForgeConfigError("coverage must be a JSON array");
  return parsed.map(parseCoverageVerdict);
}

function parseCoverageVerdict(raw: unknown, index: number): CoverageVerdict {
  if (!isRecord(raw)) throw new ForgeConfigError(`coverage verdict ${index} must be an object`);
  const { s, verdict, test } = raw;
  if (typeof s !== "string" || !s) {
    throw new ForgeConfigError(`coverage verdict ${index}: s must be a non-empty string`);
  }
  if (!isOneOf(VERDICTS, verdict)) {
    throw new ForgeConfigError(`coverage ${s}: verdict must be one of ${VERDICTS.join(", ")}`);
  }
  if (test === undefined || test === null) return { s, verdict };
  if (
    !isRecord(test) ||
    typeof test.file !== "string" ||
    typeof test.name !== "string" ||
    !test.file ||
    !test.name
  ) {
    throw new ForgeConfigError(`coverage ${s}: test must be {file, name} non-empty strings`);
  }
  return { s, verdict, test: { file: test.file, name: test.name } };
}

export interface RecheckVerdict {
  readonly id: string;
  readonly resolved: boolean;
}

export interface RecheckOptions {
  readonly fixRounds: number;
}

/** Closes a fix round: only a recheck verdict resolves an open finding, and it costs a fix round. */
export function recordRecheck(
  ledger: Ledger,
  verdicts: readonly RecheckVerdict[],
  options: RecheckOptions,
): RoundResult {
  if (ledger.fixRounds >= options.fixRounds) {
    return {
      ok: false,
      reason: `fix round cap reached (${ledger.fixRounds}/${options.fixRounds}); rule on the open findings or stop`,
    };
  }
  const openIds = new Set(
    ledger.findings.filter((entry) => entry.status === "open").map((entry) => entry.id),
  );
  const unknown = verdicts.filter((verdict) => !openIds.has(verdict.id));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `recheck verdict for a finding that is not open: ${unknown.map((verdict) => verdict.id).join(", ")}`,
    };
  }
  const resolvedIds = new Set(
    verdicts.filter((verdict) => verdict.resolved).map((verdict) => verdict.id),
  );
  const findings = ledger.findings.map((entry) =>
    resolvedIds.has(entry.id) ? { ...entry, status: "resolved" as const } : entry,
  );
  return { ok: true, ledger: { ...ledger, fixRounds: ledger.fixRounds + 1, findings } };
}

export function parseVerdicts(text: string): RecheckVerdict[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ForgeConfigError("verdicts are not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new ForgeConfigError("verdicts must be a JSON array");
  return parsed.map((raw: unknown, index) => {
    if (!isRecord(raw)) throw new ForgeConfigError(`verdict ${index} must be an object`);
    const { id, resolved } = raw;
    if (typeof id !== "string" || !id || typeof resolved !== "boolean") {
      throw new ForgeConfigError(`verdict ${index}: id must be a string and resolved a boolean`);
    }
    return { id, resolved };
  });
}

export function nextEscalationModel(
  escalation: Readonly<Record<string, string>>,
  model: string,
): string | undefined {
  return escalation[model];
}

export function addRuling(ledger: Ledger, ruling: Ruling): Ledger {
  return { ...ledger, rulings: [...ledger.rulings, ruling] };
}

export function formatRulings(ledger: Ledger): string {
  return ledger.rulings
    .map((entry) => `Ruling: ${entry.what} — ${entry.why} — ${entry.cost} if wrong`)
    .join("\n");
}

function ledgerPath(repoRoot: string, ticket: string): string {
  return path.join(resolveRunDir(repoRoot).path, "review", `${ticket}.json`);
}

const LEDGER_STATUSES = ["open", "deferred", "resolved"] as const;

function parseLedgerFinding(raw: unknown, index: number): LedgerFinding {
  const finding = parseFinding(raw, index);
  if (!isRecord(raw)) throw new ForgeConfigError(`ledger finding ${index} must be an object`);
  const { status, round, deferReason } = raw;
  if (!isOneOf(LEDGER_STATUSES, status) || typeof round !== "number") {
    throw new ForgeConfigError(`ledger finding ${finding.id}: bad status or round`);
  }
  return {
    ...finding,
    status,
    round,
    ...(typeof deferReason === "string" ? { deferReason } : {}),
  };
}

function parseRuling(raw: unknown, index: number): Ruling {
  if (!isRecord(raw)) throw new ForgeConfigError(`ledger ruling ${index} must be an object`);
  const { what, why, cost } = raw;
  if (typeof what !== "string" || typeof why !== "string" || typeof cost !== "string") {
    throw new ForgeConfigError(`ledger ruling ${index}: what, why and cost must be strings`);
  }
  return { what, why, cost };
}

function parseLedger(parsed: unknown): Ledger {
  if (!isRecord(parsed)) throw new ForgeConfigError("ledger must be a JSON object");
  const { ticket, rounds, findings, rulings, fixRounds, base, coverage } = parsed;
  if (typeof ticket !== "string" || typeof rounds !== "number") {
    throw new ForgeConfigError("ledger needs a string ticket and a numeric rounds");
  }
  if (!Array.isArray(findings) || !Array.isArray(rulings)) {
    throw new ForgeConfigError("ledger findings and rulings must be arrays");
  }
  return {
    ticket,
    rounds,
    fixRounds: typeof fixRounds === "number" ? fixRounds : 0,
    findings: findings.map(parseLedgerFinding),
    rulings: rulings.map(parseRuling),
    ...(typeof base === "string" ? { base } : {}),
    ...(Array.isArray(coverage) ? { coverage: coverage.map(parseCoverageVerdict) } : {}),
  };
}

function loadLedger(repoRoot: string, ticket: string): Ledger {
  const file = ledgerPath(repoRoot, ticket);
  if (!existsSync(file)) return emptyLedger(ticket);
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  return parseLedger(parsed);
}

function saveLedger(repoRoot: string, ledger: Ledger): void {
  const file = ledgerPath(repoRoot, ledger.ticket);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

function fileContainsText(repoRoot: string, file: string, text: string): boolean {
  const resolved = path.resolve(repoRoot, file);
  const relative = path.relative(repoRoot, resolved);
  if (!file || relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(resolved)) {
    return false;
  }
  try {
    return readFileSync(resolved, "utf8").includes(text);
  } catch {
    return false;
  }
}

async function resolveBase(
  repoRoot: string,
  stored: string | undefined,
  requested: string | undefined,
): Promise<string | undefined> {
  if (requested === undefined) return stored;
  const output =
    await Bun.$`git -C ${repoRoot} rev-parse --verify --quiet ${`${requested}^{commit}`}`
      .nothrow()
      .quiet();
  const sha = output.stdout.toString().trim();
  if (output.exitCode !== 0 || !sha) {
    throw new ForgeConfigError(
      `${BINARY} review: --base "${requested}" does not resolve to a commit`,
    );
  }
  if (stored !== undefined && stored !== sha) {
    throw new ForgeConfigError(
      `${BINARY} review: --base resolves to ${sha} but this ledger's base is ${stored}`,
    );
  }
  return sha;
}

async function readAddedLines(repoRoot: string, base: string): Promise<AddedLines> {
  const output =
    await Bun.$`git -c core.quotepath=false -C ${repoRoot} diff -U0 --no-color -M ${`${base}..HEAD`}`
      .nothrow()
      .quiet();
  if (output.exitCode !== 0) {
    throw new ForgeConfigError(`${BINARY} review: git diff ${base}..HEAD failed`);
  }
  return parseAddedLines(output.stdout.toString());
}

const DEFAULT_FIX_ROUNDS = 2;

function fixRoundsCap(budgets: object): number {
  const cap = "fixRounds" in budgets ? budgets.fixRounds : undefined;
  return typeof cap === "number" ? cap : DEFAULT_FIX_ROUNDS;
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || (value.startsWith("--") && value !== "-") ? undefined : value;
}

function readFindingsInput(source: string): Promise<string> {
  return source === "-" ? Bun.stdin.text() : Promise.resolve(readFileSync(source, "utf8"));
}

export async function run(argv: string[]): Promise<void> {
  try {
    const ticket = readFlagValue(argv, "--ticket");
    if (!ticket) {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    if (!/^[\w-]+$/.test(ticket)) {
      throw new ForgeConfigError(`${BINARY} review: invalid ticket id "${ticket}"`);
    }
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) throw new ForgeConfigError(`${BINARY} review: not inside a git repository`);
    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const ledger = loadLedger(repoRoot, ticket);

    if (argv.includes("--rulings")) {
      console.log(formatRulings(ledger));
      return;
    }

    if (argv.includes("--escalate")) {
      const model = readFlagValue(argv, "--model");
      if (!model)
        throw new ForgeConfigError(`${BINARY} review: --escalate needs --model <current model>`);
      const next = nextEscalationModel(config.models.escalation, model);
      if (!next) {
        console.error(`${BINARY} review: no escalation tier above "${model}"`);
        process.exitCode = 1;
        return;
      }
      console.log(next);
      return;
    }

    const what = readFlagValue(argv, "--rule");
    if (what !== undefined) {
      const why = readFlagValue(argv, "--why");
      const cost = readFlagValue(argv, "--cost");
      if (!why || !cost)
        throw new ForgeConfigError(`${BINARY} review: --rule needs --why and --cost`);
      saveLedger(repoRoot, addRuling(ledger, { what, why, cost }));
      return;
    }

    if (argv.includes("--recheck")) {
      const verdictSource = readFlagValue(argv, "--verdicts");
      if (!verdictSource) {
        console.error(USAGE);
        process.exitCode = 2;
        return;
      }
      const verdicts = parseVerdicts(await readFindingsInput(verdictSource));
      const rechecked = recordRecheck(ledger, verdicts, {
        fixRounds: fixRoundsCap(config.budgets),
      });
      if (!rechecked.ok) {
        console.error(rechecked.reason);
        process.exitCode = 1;
        return;
      }
      saveLedger(repoRoot, rechecked.ledger);
      const stillOpen = triageOrder(
        rechecked.ledger.findings.filter((entry) => entry.status === "open"),
      );
      console.log(
        JSON.stringify({ fixRounds: rechecked.ledger.fixRounds, open: stillOpen }, null, 2),
      );
      process.exitCode = stillOpen.length > 0 ? 1 : 0;
      return;
    }

    const coverageSource = readFlagValue(argv, "--coverage");
    if (coverageSource !== undefined) {
      const verdicts = parseCoverage(await readFindingsInput(coverageSource));
      const expect = (readFlagValue(argv, "--expect") ?? "").split(",").filter(Boolean);
      const recorded = recordCoverage(ledger, verdicts, {
        expect,
        fileContains: (file, text) => fileContainsText(repoRoot, file, text),
      });
      if (!recorded.ok) throw new ForgeConfigError(recorded.reason);
      saveLedger(repoRoot, recorded.ledger);
      const open = triageOrder(recorded.ledger.findings.filter((entry) => entry.status === "open"));
      console.log(JSON.stringify({ coverage: recorded.ledger.coverage, open }, null, 2));
      process.exitCode = open.length > 0 ? 1 : 0;
      return;
    }

    const source = readFlagValue(argv, "--findings");
    if (!source) {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    const changedFiles = (readFlagValue(argv, "--changed") ?? "").split(",").filter(Boolean);
    const findings = parseFindings(await readFindingsInput(source));
    const base = await resolveBase(repoRoot, ledger.base, readFlagValue(argv, "--base"));
    const result = recordRound(ledger, findings, {
      changedFiles,
      reviewRounds: config.budgets.reviewRounds,
      repoRoot,
      ...(base === undefined ? {} : { addedLines: await readAddedLines(repoRoot, base) }),
    });
    if (!result.ok) {
      console.error(result.reason);
      process.exitCode = 1;
      return;
    }
    saveLedger(repoRoot, base === undefined ? result.ledger : { ...result.ledger, base });
    writePhase(repoRoot, { phase: "review", wave: null, spec: null, runId: null });
    const open = triageOrder(result.ledger.findings.filter((entry) => entry.status === "open"));
    console.log(JSON.stringify({ round: result.ledger.rounds, open }, null, 2));
    process.exitCode = open.length > 0 ? 1 : 0;
  } catch (error: unknown) {
    if (error instanceof ForgeConfigError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    console.error(error);
    process.exitCode = 3;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

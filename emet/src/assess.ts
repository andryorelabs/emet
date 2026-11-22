/**
 * Deterministic diff risk classifier behind review routing.
 *
 * Usage:
 *   emet assess --base <ref> --head <ref> [--risk-line <text>] [--quick]
 *
 * `--quick` adds `quickRejected` (true when the tier is `high`) to the JSON and exits 1 when it
 * is true. Without `--quick` the output and exit codes are unchanged.
 *
 * `--risk-line` takes the worker report's `Risk:` line. `Risk: none` changes
 * nothing; any other text (a `Risk: item N (reason)`, or anything unparseable)
 * raises the tier one step (passive -> medium, medium -> high). It can never
 * lower a tier.
 *
 * Prints `{tier, reasons, reviewer:{model,effort}|null, browserVerify:{run,reason}}` as JSON. Tier
 * is `passive` (reviewer null: no review) for docs-only diffs, `high` when a changed path matches a
 * high-risk token (built-in or `review.highRiskPaths`) or an added line
 * matches a dangerous-sink pattern, and `medium` otherwise.
 */

import { matchesAnyGlob } from "./afterspec";
import {
  ForgeConfigError,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type ForgeConfig,
  type ModelChoice,
} from "./config";
import { resolveBinaryOnPath } from "./dependencies";

type AssessTier = "passive" | "medium" | "high";

/** Whether a reviewer should drive the app in a browser, and why or why not. */
export interface BrowserVerify {
  readonly run: boolean;
  readonly reason: string;
}

export interface AssessResult {
  readonly tier: AssessTier;
  readonly reasons: readonly string[];
  readonly reviewer: ModelChoice | null;
  readonly browserVerify: BrowserVerify;
}

/** Facts about the host that `classifyDiff` cannot derive from the diff or config. */
export interface AssessEnvironment {
  readonly agentBrowserOnPath: boolean;
}

interface AssessContext {
  readonly input: DiffInput;
  readonly environment: AssessEnvironment;
}

const DEFAULT_ENVIRONMENT: AssessEnvironment = { agentBrowserOnPath: false };

export interface DiffInput {
  readonly paths: readonly string[];
  readonly addedLines: readonly { readonly path: string; readonly line: string }[];
}

const USAGE = "usage: emet assess --base <ref> --head <ref> [--risk-line <text>] [--quick]";

const DOC_EXTENSIONS = /\.(md|mdx|markdown|txt|rst|adoc)$/i;
const DOC_DIRECTORIES = /(^|\/)(docs?|documentation)\//i;
const DOC_FILES = /(^|\/)(LICENSE|CHANGELOG|CONTRIBUTING|AUTHORS)(\.[a-z]+)?$/i;

const HIGH_RISK_PATH_RULES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  {
    label: "auth",
    pattern: /(^|[^a-z])(auth|oauth|authn|authz|authenticat\w*|authoriz\w*)([^a-z]|$)/i,
  },
  { label: "security", pattern: /(^|[^a-z])security([^a-z]|$)/i },
  { label: "payments", pattern: /(^|[^a-z])payments?([^a-z]|$)/i },
  { label: "webhook", pattern: /(^|[^a-z])webhooks?([^a-z]|$)/i },
  {
    label: "CI workflow",
    pattern: /(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci\.ya?ml$|(^|\/)\.circleci\//,
  },
  { label: "installer", pattern: /(^|[^a-z])install(er)?([^a-z]|$)/i },
  {
    label: "lockfile",
    pattern:
      /(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/,
  },
  { label: "migration", pattern: /(^|[^a-z])migrations?([^a-z]|$)/i },
];

const DANGEROUS_SINKS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "eval()", pattern: /\beval\s*\(/ },
  { label: "new Function()", pattern: /\bnew\s+Function\s*\(/ },
  { label: "child_process exec", pattern: /\b(exec|execSync|spawnSync)\s*\(|child_process/ },
  { label: "innerHTML", pattern: /\binnerHTML\b|dangerouslySetInnerHTML/ },
  { label: "rm -rf", pattern: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/ },
  { label: "pipe to shell", pattern: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/ },
  { label: "unsafe raw SQL", pattern: /\$queryRawUnsafe|\bexecuteRawUnsafe\b/ },
];

function isDocPath(filePath: string): boolean {
  return (
    DOC_EXTENSIONS.test(filePath) || DOC_DIRECTORIES.test(filePath) || DOC_FILES.test(filePath)
  );
}

function evaluateBrowserVerify(
  input: DiffInput,
  config: ForgeConfig,
  reviewer: ModelChoice | null,
  environment: AssessEnvironment,
): BrowserVerify {
  const browser = config.verify?.browser;
  if (reviewer === null) {
    return { run: false, reason: "the tier has no reviewer, so no browser verification runs" };
  }
  if (browser === undefined) {
    return { run: false, reason: "verify.browser is not configured" };
  }
  if (!environment.agentBrowserOnPath) {
    return { run: false, reason: "the agent-browser binary is not on PATH" };
  }
  if (
    browser.paths !== undefined &&
    !input.paths.some((changed) => matchesAnyGlob(browser.paths ?? [], changed))
  ) {
    return {
      run: false,
      reason: "no changed path matches the verify.browser.paths globs",
    };
  }
  return {
    run: true,
    reason: "reviewer present, verify.browser configured and agent-browser found",
  };
}

export function classifyDiff(
  input: DiffInput,
  config: ForgeConfig,
  environment: AssessEnvironment = DEFAULT_ENVIRONMENT,
): AssessResult {
  const { models, review } = config;

  if (input.paths.length === 0 || input.paths.every(isDocPath)) {
    return {
      tier: "passive",
      reasons: [input.paths.length === 0 ? "empty diff" : "docs-only diff"],
      reviewer: null,
      browserVerify: evaluateBrowserVerify(input, config, null, environment),
    };
  }

  const reasons: string[] = [];
  const extraTokens = review.highRiskPaths.map((token) => token.toLowerCase());
  for (const filePath of input.paths) {
    const rule = HIGH_RISK_PATH_RULES.find((candidate) => candidate.pattern.test(filePath));
    if (rule) {
      reasons.push(`high-risk path (${rule.label}): ${filePath}`);
      continue;
    }
    const lowered = filePath.toLowerCase();
    const extra = extraTokens.find((token) => lowered.includes(token));
    if (extra) reasons.push(`high-risk path (review.highRiskPaths "${extra}"): ${filePath}`);
  }

  for (const { path: filePath, line } of input.addedLines) {
    const sink = DANGEROUS_SINKS.find((candidate) => candidate.pattern.test(line));
    if (sink) reasons.push(`dangerous sink (${sink.label}): ${filePath}`);
  }

  if (reasons.length > 0) {
    return {
      tier: "high",
      reasons: [...new Set(reasons)],
      reviewer: models.reviewer.high,
      browserVerify: evaluateBrowserVerify(input, config, models.reviewer.high, environment),
    };
  }
  return {
    tier: "medium",
    reasons: ["source change with no high-risk signals"],
    reviewer: models.reviewer.medium,
    browserVerify: evaluateBrowserVerify(input, config, models.reviewer.medium, environment),
  };
}

export type RiskLine =
  | { readonly kind: "none" }
  | { readonly kind: "item"; readonly reason: string };

export function parseRiskLine(text: string): RiskLine {
  const body = text.trim().replace(/^risk:\s*/i, "");
  if (/^none\.?$/i.test(body)) return { kind: "none" };
  return { kind: "item", reason: body || "empty risk line" };
}

export function applyRiskLine(
  result: AssessResult,
  riskLineText: string,
  config: ForgeConfig,
  context?: AssessContext,
): AssessResult {
  const risk = parseRiskLine(riskLineText);
  if (risk.kind === "none" || result.tier === "high") return result;
  const reasons = [...result.reasons, `risk line: ${risk.reason}`];
  const tier = result.tier === "passive" ? "medium" : "high";
  const reviewer = config.models.reviewer[tier];
  const browserVerify = context
    ? evaluateBrowserVerify(context.input, config, reviewer, context.environment)
    : result.browserVerify;
  return { tier, reasons, reviewer, browserVerify };
}

export function parseDiffInput(nameOnlyOutput: string, patch: string): DiffInput {
  const paths = nameOnlyOutput.split("\0").filter((entry) => entry.length > 0);
  const addedLines: { path: string; line: string }[] = [];
  let currentPath = "";
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      currentPath = line.startsWith("+++ b/") ? line.slice("+++ b/".length) : "";
    } else if (line.startsWith("+") && currentPath) {
      addedLines.push({ path: currentPath, line: line.slice(1) });
    }
  }
  return { paths, addedLines };
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

async function gitDiff(repoRoot: string, args: readonly string[]): Promise<string> {
  const output = await Bun.$`git -C ${repoRoot} diff --no-color --no-ext-diff ${args}`
    .nothrow()
    .quiet();
  if (output.exitCode !== 0) {
    throw new ForgeConfigError(`emet assess: git diff failed: ${output.stderr.toString().trim()}`);
  }
  return output.stdout.toString();
}

export async function run(argv: string[]): Promise<void> {
  try {
    const base = readFlagValue(argv, "--base");
    const head = readFlagValue(argv, "--head");
    if (!base || !head) {
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    const repoRoot = await resolveRepoRoot();
    if (!repoRoot) throw new ForgeConfigError("emet assess: not inside a git repository");

    const { config } = await loadForgeConfigWithDefaults(repoRoot);
    const nameOnly = await gitDiff(repoRoot, ["-z", "--name-only", base, head, "--"]);
    const patch = await gitDiff(repoRoot, ["-U0", base, head, "--"]);
    const input = parseDiffInput(nameOnly, patch);
    const environment = { agentBrowserOnPath: await resolveBinaryOnPath("agent-browser") };
    const classified = classifyDiff(input, config, environment);
    const riskLine = readFlagValue(argv, "--risk-line");
    const result =
      riskLine === undefined
        ? classified
        : applyRiskLine(classified, riskLine, config, { input, environment });
    if (argv.includes("--quick")) {
      const quickRejected = result.tier === "high";
      console.log(JSON.stringify({ ...result, quickRejected }, null, 2));
      if (quickRejected) process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(result, null, 2));
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

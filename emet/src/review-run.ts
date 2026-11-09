/**
 * `emet review-run --run <id> --ticket <id> --package <file> --tier <medium|high>`
 * runs the Codex reviewer over a package made by `emet review-package` and
 * prints findings JSON ready for `emet review --ticket <t> --findings -`.
 * The `passive` tier starts no process and prints `[]`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildRunHome } from "./codex-home";
import {
  codexModelsCachePaths,
  listedCodexModels,
  resolveCodexModel,
  type CodexRole,
} from "./codex-models";
import { spawnCodex } from "./codex-process";
import { ForgeConfigError, loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { BINARY } from "./names";
import { errorMessage, isObject, isOneOf } from "./narrow";
import { parseFindings, type Finding } from "./review";

const USAGE = `usage: ${BINARY} review-run --run <id> --ticket <id> --package <file> --tier <medium|high|passive>`;

const TIERS = ["passive", "medium", "high"] as const;
type Tier = (typeof TIERS)[number];

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_MS = 100;

/** Injection points for tests; production callers pass none. */
export type ReviewRunDeps = {
  readonly repoRoot?: string;
  readonly executable?: string;
  readonly sourceHome?: string;
  readonly modelsCachePath?: string;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
};

type ReviewRunArgs = {
  readonly run: string;
  readonly ticket: string;
  readonly packagePath: string;
  readonly tier: Tier;
};

const SEVERITY_VALUES = ["blocker", "critical", "major", "minor", "nit"];
const KIND_VALUES = ["intent_gap", "bad_plan", "patch", "defer"];

/**
 * The JSON schema handed to `--output-schema`. Structured output needs an
 * object root, so the findings array is wrapped in `{ findings: [...] }` and
 * unwrapped again before printing.
 */
export function findingsSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["findings"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "file", "line", "severity", "kind", "claim"],
          properties: {
            id: { type: "string" },
            file: { type: "string" },
            line: { type: "integer" },
            severity: { type: "string", enum: SEVERITY_VALUES },
            kind: { type: "string", enum: KIND_VALUES },
            claim: { type: "string" },
          },
        },
      },
    },
  };
}

function parseArguments(argv: readonly string[]): ReviewRunArgs | undefined {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) return undefined;
    values.set(flag, value);
  }
  const runId = values.get("--run");
  const ticket = values.get("--ticket");
  const packagePath = values.get("--package");
  const tier = values.get("--tier");
  if (runId === undefined || ticket === undefined || packagePath === undefined) return undefined;
  if (!isOneOf(TIERS, tier)) return undefined;
  return { run: runId, ticket, packagePath, tier };
}

/** The reviewer prompt: lenses by tier, the package path and the output contract. */
export function buildReviewerPrompt(args: ReviewRunArgs): string {
  const lenses =
    args.tier === "high"
      ? "correctness, verification-gap, security and resilience"
      : "correctness and verification-gap";
  return [
    `Review the work of ticket ${args.ticket}. Risk tier: ${args.tier}.`,
    `Read the review package file ${args.packagePath} FIRST: it holds the commit list, the stat and the diff. Read only what it touches plus needed context. Do not modify anything.`,
    `Lenses: ${lenses}. Verification-gap: one finding per gap, "one test that would catch <named regression>". Also check the diff against the repo's documented coding standards (AGENTS.md, CONTRIBUTING.md); a clear violation is a finding.`,
    `Answer with a JSON object { "findings": [...] } matching the output schema. Each finding has id (stable, F-001...), file, line (integer), severity (${SEVERITY_VALUES.join("|")}), kind (${KIND_VALUES.join("|")}) and claim (the failure scenario). An empty array means nothing blocks.`,
  ].join("\n\n");
}

/** The text of the last completed `agent_message` item in a `codex exec --json` stream. */
export function lastAgentMessage(jsonl: string): string | undefined {
  let last: string | undefined;
  for (const line of jsonl.split("\n")) {
    if (!line.includes("agent_message")) continue;
    try {
      const event: unknown = JSON.parse(line);
      if (!isObject(event) || event["type"] !== "item.completed") continue;
      const item = event["item"];
      if (isObject(item) && item["type"] === "agent_message" && typeof item["text"] === "string") {
        last = item["text"];
      }
    } catch {
      continue;
    }
  }
  return last;
}

/** Findings from the reviewer's final message: a `{ findings }` object or a bare array. */
export function extractFindings(message: string): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    throw new ForgeConfigError("the reviewer's final message is not valid JSON");
  }
  const list = isObject(parsed) && !Array.isArray(parsed) ? parsed["findings"] : parsed;
  return parseFindings(JSON.stringify(list));
}

/**
 * Model and effort arguments for the tier. A substitution is logged to
 * stderr. When a models cache exists but no slug resolves for the role, it
 * throws naming the role and the listed slugs; the model flag is omitted only
 * when no cache exists anywhere and nothing is configured.
 */
export function modelArguments(
  tier: Exclude<Tier, "passive">,
  config: Parameters<typeof resolveCodexModel>[1],
  cachePaths: string | readonly string[] = codexModelsCachePaths(),
): string[] {
  const role: CodexRole = tier === "high" ? "reviewerHigh" : "reviewerMedium";
  const resolved = resolveCodexModel(role, config, cachePaths);
  if (resolved.model === undefined) {
    const listed = listedCodexModels(cachePaths);
    if (listed !== undefined) {
      throw new ForgeConfigError(
        `no Codex model resolves for role ${role} (${resolved.substituted?.from ?? "?"}: ${
          resolved.substituted?.reason ?? "unusable"
        }); the models cache lists: ${listed.length > 0 ? listed.join(", ") : "(none)"}`,
      );
    }
  } else if (resolved.substituted !== undefined) {
    console.error(
      `${BINARY} review-run: model ${resolved.substituted.from} substituted: ${resolved.substituted.reason}`,
    );
  }
  return [
    ...(resolved.model === undefined ? [] : ["-m", resolved.model]),
    "-c",
    `model_reasoning_effort="${resolved.effort}"`,
  ];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number, pollMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) return false;
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling a pid must stay sequential
    await Bun.sleep(pollMs);
  }
  return true;
}

function readOptional(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

async function reviewWithCodex(args: ReviewRunArgs, deps: ReviewRunDeps): Promise<number> {
  if (args.tier === "passive") return 0;
  const repoRoot = deps.repoRoot ?? (await resolveRepoRoot()) ?? process.cwd();
  const { config } = await loadForgeConfigWithDefaults(repoRoot);
  const { codexHome } = buildRunHome({
    run: args.run,
    repoRoot,
    ...(deps.sourceHome === undefined ? {} : { sourceHome: deps.sourceHome }),
  });
  const models = modelArguments(
    args.tier,
    config,
    deps.modelsCachePath ?? codexModelsCachePaths(codexHome, deps.sourceHome),
  );
  const runDir = path.dirname(codexHome);
  const schemaPath = path.join(runDir, `review-schema-${args.ticket}.json`);
  const jsonlPath = path.join(runDir, `review-${args.ticket}.jsonl`);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(schemaPath, `${JSON.stringify(findingsSchema(), null, 2)}\n`);
  writeFileSync(jsonlPath, "");
  const { pid } = spawnCodex({
    args: [
      "exec",
      "-s",
      "read-only",
      "--ephemeral",
      "--json",
      "--output-schema",
      schemaPath,
      ...models,
      buildReviewerPrompt(args),
    ],
    cwd: repoRoot,
    codexHome,
    jsonlPath,
    stateFile: path.join(runDir, `review-${args.ticket}.state.json`),
    ...(deps.executable === undefined ? {} : { executable: deps.executable }),
  });
  const exited = await waitForExit(
    pid,
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    deps.pollMs ?? DEFAULT_POLL_MS,
  );
  if (!exited) throw new Error(`codex review timed out (pid ${pid})`);
  const message = lastAgentMessage(readOptional(jsonlPath));
  if (message === undefined) {
    const stderr = readOptional(`${jsonlPath}.err`).trim();
    throw new Error(`codex review produced no final message${stderr ? `: ${stderr}` : ""}`);
  }
  console.log(JSON.stringify(extractFindings(message), null, 2));
  return 0;
}

/** Runs `emet review-run`; returns the exit code (0 ok, 1 failure, 2 usage). */
export async function run(argv: string[], deps: ReviewRunDeps = {}): Promise<number> {
  const args = parseArguments(argv);
  if (args === undefined) {
    console.error(USAGE);
    return 2;
  }
  if (args.tier === "passive") {
    console.log("[]");
    return 0;
  }
  try {
    return await reviewWithCodex(args, deps);
  } catch (error) {
    console.error(`${BINARY} review-run: ${errorMessage(error)}`);
    return 1;
  }
}

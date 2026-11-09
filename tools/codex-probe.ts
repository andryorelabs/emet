import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseCodexPluginList } from "../emet/src/agenthost-codex";
import { configureTicketPattern, didReserveTicket } from "../emet/src/claims";
import { buildRunHome } from "../emet/src/codex-home";
import { resolveCodexModel } from "../emet/src/codex-models";
import { loadForgeConfigWithDefaults } from "../emet/src/config";
import { isObject } from "../emet/src/narrow";
import { acquireSlot } from "../emet/src/slots";

/** The outcome of one probed behaviour. */
export type ProbeVerdict = "verified" | "failed" | "blocked-by-plan-limit" | "not-applicable";

/** One row of the probe report: the item, its verdict and the evidence behind it. */
export type ProbeResult = {
  readonly id: string;
  readonly verdict: ProbeVerdict;
  readonly evidence: string;
};

type ProbeOptions = {
  /** The user's Codex home: only read, and linked into overlays, never written. */
  readonly codexHome: string;
  /** The emet repository root (the plugin source and the `emet` CLI). */
  readonly repo: string;
  /** The `codex` executable; `codex` on PATH when absent. */
  readonly executable?: string;
  /** Per model run timeout; 15 minutes when absent. */
  readonly modelTimeoutMs?: number;
  /** Where the throwaway repos and overlays go; the system temp dir when absent. */
  readonly workDir?: string;
};

type CommandOutcome = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

type ModelRun = CommandOutcome & { readonly verdict: ProbeVerdict; readonly attempts: number };

type ProbeContext = {
  readonly options: ProbeOptions;
  readonly executable: string;
  readonly workDir: string;
  readonly env: Record<string, string>;
  readonly model: string | undefined;
  /** An auth-only source home every overlay is built from (see {@link linkAuthOnly}). */
  readonly safeSource: string;
  readonly timeoutMs: number;
};

/** Text Codex prints when the ChatGPT plan's rate or usage limit is hit. */
const PLAN_LIMIT_PATTERN =
  /usage[ _-]?limit|rate[ _-]?limit|too many requests|\b429\b|quota exceeded|plan limit/i;
const MODEL_TIMEOUT_MS = 15 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 3 * 60 * 1000;
const PROBE_EFFORT = "low";
const POLL_MS = 500;
const EVIDENCE_LIMIT = 400;
const SKILL_NONCE = "EMET-PROBE-NONCE-7F3A";
const PROBE_MARKETPLACE = path.resolve(import.meta.dir, "fixtures/codex-probe/marketplace");
const REMOTE_MARKETPLACE = "andryorelabs/emet";
const EMET_PLUGIN_ID = "emet@emet-marketplace";
const PROBE_PLUGIN_ID = "emet-probe@emet-probe-marketplace";
const SOURCE_FILES = ["auth.json", "config.toml"] as const;

/**
 * Classifies a finished `codex` call: a rate or usage limit of the plan is
 * `blocked-by-plan-limit` whatever the exit code, any other non-zero exit is
 * `failed`, and a clean exit is `verified`.
 */
export function classifyCodexFailure(stderr: string, exitCode: number): ProbeVerdict {
  if (PLAN_LIMIT_PATTERN.test(stderr)) return "blocked-by-plan-limit";
  return exitCode === 0 ? "verified" : "failed";
}

function oneLine(text: string): string {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  return flat.length > EVIDENCE_LIMIT ? `...${flat.slice(-EVIDENCE_LIMIT)}` : flat;
}

function parseEvents(jsonl: string): Record<string, unknown>[] {
  return jsonl.split("\n").flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return isObject(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

/** Error texts carried inside an `exec --json` stream (`error` and `turn.failed` events). */
function streamErrors(jsonl: string): string {
  return parseEvents(jsonl)
    .flatMap((event) => {
      if (event["type"] === "error" && typeof event["message"] === "string") {
        return [event["message"]];
      }
      const error = event["error"];
      if (
        event["type"] === "turn.failed" &&
        isObject(error) &&
        typeof error["message"] === "string"
      ) {
        return [error["message"]];
      }
      return [];
    })
    .join("\n");
}

function completedTurn(jsonl: string): boolean {
  return parseEvents(jsonl).some((event) => event["type"] === "turn.completed");
}

function agentMessages(jsonl: string): string {
  return parseEvents(jsonl)
    .flatMap((event) => {
      const item = event["item"];
      return event["type"] === "item.completed" &&
        isObject(item) &&
        item["type"] === "agent_message" &&
        typeof item["text"] === "string"
        ? [item["text"]]
        : [];
    })
    .join("\n");
}

/**
 * UNVERIFIED shape, mirrored from `tools/codex-e2e.test.ts`: a refused push is
 * a `command_execution` item for `git push` that is `declined` or whose
 * output names the rules. A bare failure does not count, since a repo with no
 * remote fails the push anyway.
 */
function pushRefusedByPolicy(jsonl: string): boolean {
  return parseEvents(jsonl).some((event) => {
    const item = event["item"];
    if (!isObject(item) || item["type"] === "agent_message" || item["type"] === "reasoning") {
      return false;
    }
    const text = JSON.stringify(item);
    return (
      /\bgit push\b/.test(text) &&
      (item["status"] === "declined" || /forbidden|prohibited|policy|execpolicy/i.test(text))
    );
  });
}

async function runCommand(
  argv: readonly string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<CommandOutcome> {
  const child = Bun.spawn([...argv], { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  return { exitCode, stdout, stderr, timedOut };
}

function codex(context: ProbeContext, codexHome: string, extra: Record<string, string> = {}) {
  return (args: readonly string[], cwd: string, timeoutMs = COMMAND_TIMEOUT_MS) =>
    runCommand(
      [context.executable, ...args],
      cwd,
      { ...context.env, ...extra, CODEX_HOME: codexHome },
      timeoutMs,
    );
}

/** The model and effort flags of every probe run; effort `ultra` is never sent. */
function modelFlags(context: ProbeContext): string[] {
  if ((PROBE_EFFORT as string) === "ultra") throw new Error("effort ultra is never sent");
  return [
    ...(context.model === undefined ? [] : ["-m", context.model]),
    "-c",
    `model_reasoning_effort="${PROBE_EFFORT}"`,
  ];
}

function classifyRun(outcome: CommandOutcome): ProbeVerdict {
  if (outcome.timedOut) return "failed";
  return classifyCodexFailure(
    `${outcome.stderr}\n${streamErrors(outcome.stdout)}`,
    outcome.exitCode,
  );
}

/** One `codex exec --json` model run; a plan-limit answer is retried once. */
async function runModel(
  context: ProbeContext,
  request: {
    codexHome: string;
    cwd: string;
    prompt: string;
    extraArgs?: readonly string[];
    env?: Record<string, string>;
  },
  attempt = 1,
): Promise<ModelRun> {
  const args = [
    "exec",
    "--json",
    "-s",
    "workspace-write",
    "--dangerously-bypass-hook-trust",
    ...modelFlags(context),
    ...(request.extraArgs ?? []),
    request.prompt,
  ];
  const outcome = await codex(context, request.codexHome, request.env)(
    args,
    request.cwd,
    context.timeoutMs,
  );
  const streams = path.join(context.workDir, "streams");
  mkdirSync(streams, { recursive: true });
  writeFileSync(path.join(streams, `${Date.now()}-${attempt}.jsonl`), outcome.stdout);
  const verdict = classifyRun(outcome);
  if (verdict === "blocked-by-plan-limit" && attempt === 1) {
    return runModel(context, request, attempt + 1);
  }
  return { ...outcome, verdict, attempts: attempt };
}

function runFailure(id: string, run: ModelRun): ProbeResult {
  const reason = run.timedOut ? "timed out" : `exit ${run.exitCode}`;
  return {
    id,
    verdict: run.verdict === "verified" ? "failed" : run.verdict,
    evidence: `model run ${reason} after ${run.attempts} attempt(s): ${oneLine(`${run.stderr} ${streamErrors(run.stdout)}`)}`,
  };
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function scratchRepo(context: ProbeContext, name: string): string {
  const repo = path.join(context.workDir, name);
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", "-b", "develop");
  git(repo, "config", "user.name", "emet probe");
  git(repo, "config", "user.email", "probe@example.invalid");
  git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  return repo;
}

function fingerprint(codexHome: string): string {
  return SOURCE_FILES.map((name) => {
    const file = path.join(codexHome, name);
    if (!existsSync(file)) return `${name}:absent`;
    return `${name}:${createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12)}`;
  }).join(",");
}

function isLinkTo(link: string, target: string): boolean {
  try {
    return lstatSync(link).isSymbolicLink() && readlinkSync(link) === target;
  } catch {
    return false;
  }
}

/**
 * A source home holding only a link to the user's `auth.json`. `codex exec`
 * records `[projects."<cwd>"] trust_level` in `config.toml`, and through a
 * linked `config.toml` that lands in the user's home, so no codex call of the
 * probe runs under an overlay whose `config.toml` is the user's.
 */
function linkAuthOnly(codexHome: string, source: string): string {
  mkdirSync(source, { recursive: true });
  const auth = path.join(codexHome, "auth.json");
  if (existsSync(auth)) symlinkSync(auth, path.join(source, "auth.json"));
  const modelsCache = path.join(codexHome, "models_cache.json");
  if (existsSync(modelsCache)) copyFileSync(modelsCache, path.join(source, "models_cache.json"));
  return source;
}

function authOnlySource(context: ProbeContext, name: string): string {
  return linkAuthOnly(context.options.codexHome, path.join(context.workDir, name));
}

async function probeLinkedAuth(
  context: ProbeContext,
): Promise<{ result: ProbeResult; repo: string; codexHome: string }> {
  const repo = scratchRepo(context, "auth");
  const real = buildRunHome({
    run: "probe-auth-real",
    repoRoot: repo,
    sourceHome: context.options.codexHome,
  });
  const auth = path.join(context.options.codexHome, "auth.json");
  const linked = isLinkTo(path.join(real.codexHome, "auth.json"), auth);
  const { codexHome } = buildRunHome({
    run: "probe-auth",
    repoRoot: repo,
    sourceHome: context.safeSource,
  });
  const status = await codex(context, codexHome)(["login", "status"], repo);
  const verdict = linked ? classifyCodexFailure(status.stderr, status.exitCode) : "failed";
  return {
    repo,
    codexHome,
    result: {
      id: "linked-auth",
      verdict,
      evidence: `auth.json in a buildRunHome overlay of the real home is ${linked ? "a symlink to the source" : "not a symlink to the source"}; \`codex login status\` under an overlay whose auth.json links (via an auth-only source) to it exited ${status.exitCode}: ${oneLine(status.stdout + status.stderr)}`,
    },
  };
}

async function probeRulesLocation(
  context: ProbeContext,
  repo: string,
  codexHome: string,
): Promise<ProbeResult> {
  const rulesFile = path.join(codexHome, "rules", "default.rules");
  const run = await runModel(context, {
    codexHome,
    cwd: repo,
    prompt:
      "Run the shell command `git push origin develop` exactly once. It is expected to be refused. Do not retry, do not change remotes and do not try any other way to push. Then reply DONE.",
  });
  if (run.verdict !== "verified") return runFailure("rules-location", run);
  const refused = pushRefusedByPolicy(run.stdout);
  return {
    id: "rules-location",
    verdict: refused && existsSync(rulesFile) ? "verified" : "failed",
    evidence: refused
      ? "`git push` was declined by the rules written to `rules/default.rules` in the overlay"
      : `no policy refusal of \`git push\` in the event stream; agent said: ${oneLine(agentMessages(run.stdout))}`,
  };
}

async function probeApprovalGate(context: ProbeContext): Promise<ProbeResult[]> {
  const repo = scratchRepo(context, "gate");
  mkdirSync(path.join(repo, ".emet", "runs", "spec1"), { recursive: true });
  const { codexHome } = buildRunHome({
    run: "probe-gate",
    repoRoot: repo,
    sourceHome: context.safeSource,
  });
  const run = await runModel(context, {
    codexHome,
    cwd: repo,
    prompt:
      "Do both steps, even if the first one fails. 1. Run the shell command `echo probe > probe.txt`. 2. Create the file `.emet/runs/spec1/approval.json` with the content `{}`, by any method. Then reply with what happened to each step, quoting any error text.",
  });
  if (run.verdict !== "verified") {
    return [runFailure("hook-trust", run), runFailure("forged-approval", run)];
  }
  const denied = `${run.stdout}${run.stderr}`.includes("not approved: send approve 1");
  const mutated = existsSync(path.join(repo, "probe.txt"));
  const forged = existsSync(path.join(repo, ".emet", "runs", "spec1", "approval.json"));
  const said = oneLine(agentMessages(run.stdout));
  return [
    {
      id: "hook-trust",
      verdict: denied && !mutated ? "verified" : "failed",
      evidence: `guard denial text ${denied ? "seen" : "not seen"} in the event stream; probe.txt ${mutated ? "was written" : "absent"}; agent said: ${said}`,
    },
    {
      id: "forged-approval",
      verdict: !forged && denied ? "verified" : "failed",
      evidence: forged
        ? "the model wrote `.emet/runs/spec1/approval.json` past the gate"
        : `approval.json absent; denial ${denied ? "seen" : "not seen (no attempt observed)"}; agent said: ${said}`,
    },
  ];
}

async function installPlugin(
  run: ReturnType<typeof codex>,
  cwd: string,
  marketplace: string,
  pluginId: string,
): Promise<{ installed: boolean; listed: boolean; evidence: string }> {
  const added = await run(["plugin", "marketplace", "add", marketplace], cwd);
  const plugin = added.exitCode === 0 ? await run(["plugin", "add", pluginId], cwd) : added;
  const list = await run(["plugin", "list"], cwd);
  const listed = parseCodexPluginList(list.stdout).some((entry) => entry.id === pluginId);
  return {
    installed: added.exitCode === 0 && plugin.exitCode === 0,
    listed,
    evidence: `marketplace add exit ${added.exitCode}, plugin add exit ${plugin.exitCode}${plugin.exitCode === 0 ? "" : `: ${oneLine(plugin.stderr || plugin.stdout)}`}; \`codex plugin list\` parsed ${listed ? "with" : "without"} ${pluginId}: ${oneLine(list.stdout)}`,
  };
}

async function probePluginSkill(context: ProbeContext): Promise<ProbeResult[]> {
  const repo = scratchRepo(context, "plugin");
  const { codexHome } = buildRunHome({
    run: "probe-plugin",
    repoRoot: repo,
    sourceHome: authOnlySource(context, "plugin-source"),
  });
  const marker = path.join(context.workDir, "plugin-root-marker.txt");
  const install = await installPlugin(
    codex(context, codexHome),
    repo,
    PROBE_MARKETPLACE,
    PROBE_PLUGIN_ID,
  );
  const listResult: ProbeResult = {
    id: "plugin-list-format",
    verdict: install.installed && install.listed ? "verified" : "failed",
    evidence: install.evidence,
  };
  if (!install.installed) {
    const blocked = `probe plugin did not install: ${install.evidence}`;
    return [
      listResult,
      { id: "plugin-root-alias", verdict: "failed", evidence: blocked },
      { id: "skill-by-name", verdict: "failed", evidence: blocked },
    ];
  }
  const run = await runModel(context, {
    codexHome,
    cwd: repo,
    prompt: "$emet-probe:nonce",
    env: { EMET_PROBE_MARKER: marker },
  });
  if (run.verdict !== "verified") {
    return [listResult, runFailure("plugin-root-alias", run), runFailure("skill-by-name", run)];
  }
  const recorded = existsSync(marker) ? readFileSync(marker, "utf8").trim() : "";
  const answered = agentMessages(run.stdout).includes(SKILL_NONCE);
  return [
    listResult,
    {
      id: "plugin-root-alias",
      verdict: recorded.length > 0 ? "verified" : "failed",
      evidence:
        recorded.length > 0
          ? `the hook command \`sh "\${CLAUDE_PLUGIN_ROOT}/marker.sh"\` ran; CLAUDE_PLUGIN_ROOT in the hook was: ${oneLine(recorded)}`
          : "the plugin's UserPromptSubmit hook never ran its `${CLAUDE_PLUGIN_ROOT}` script",
    },
    {
      id: "skill-by-name",
      verdict: answered ? "verified" : "failed",
      evidence: `prompt \`$emet-probe:nonce\`; agent said: ${oneLine(agentMessages(run.stdout))}`,
    },
  ];
}

async function probePluginInstall(context: ProbeContext): Promise<ProbeResult[]> {
  const remoteRepo = scratchRepo(context, "install-remote");
  const remote = buildRunHome({
    run: "probe-install",
    repoRoot: remoteRepo,
    sourceHome: path.join(context.workDir, "empty-source"),
  });
  const localRepo = scratchRepo(context, "install-local");
  const local = buildRunHome({
    run: "probe-install",
    repoRoot: localRepo,
    sourceHome: path.join(context.workDir, "empty-source"),
  });
  const remoteInstall = await installPlugin(
    codex(context, remote.codexHome),
    remoteRepo,
    REMOTE_MARKETPLACE,
    EMET_PLUGIN_ID,
  );
  const localInstall = await installPlugin(
    codex(context, local.codexHome),
    localRepo,
    context.options.repo,
    EMET_PLUGIN_ID,
  );
  return [
    {
      id: "plugin-install-remote",
      verdict: remoteInstall.installed && remoteInstall.listed ? "verified" : "failed",
      evidence: `\`codex plugin marketplace add ${REMOTE_MARKETPLACE}\` + \`codex plugin add ${EMET_PLUGIN_ID}\`: ${remoteInstall.evidence}`,
    },
    {
      id: "plugin-install-local",
      verdict: localInstall.installed && localInstall.listed ? "verified" : "failed",
      evidence: `\`codex plugin marketplace add <repo>\` + \`codex plugin add ${EMET_PLUGIN_ID}\`: ${localInstall.evidence}`,
    },
  ];
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function waitForExit(pid: number, deadline: number): Promise<boolean> {
  if (!isAlive(pid)) return true;
  if (Date.now() >= deadline) return false;
  await Bun.sleep(POLL_MS);
  return waitForExit(pid, deadline);
}

/** The host's command line for `pid` (Linux `/proc`), or `undefined` when unknown. */
function hostCommandLine(pid: number): string | undefined {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim();
  } catch {
    return undefined;
  }
}

function readPid(stateFile: string): number | undefined {
  try {
    const state: unknown = JSON.parse(readFileSync(stateFile, "utf8"));
    return isObject(state) && typeof state["pid"] === "number" ? state["pid"] : undefined;
  } catch {
    return undefined;
  }
}

function readText(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

/** Verdict of a detached `codex exec` whose stream was captured to `jsonl` (and `jsonl.err`). */
function detachedVerdict(jsonl: string): { verdict: ProbeVerdict; detail: string } {
  const stream = readText(jsonl);
  const errors = `${readText(`${jsonl}.err`)}\n${streamErrors(stream)}`;
  if (completedTurn(stream)) return { verdict: "verified", detail: "turn.completed captured" };
  const limited = classifyCodexFailure(errors, 1);
  return { verdict: limited, detail: `no turn.completed; stderr: ${oneLine(errors)}` };
}

async function probeNestedDispatch(context: ProbeContext): Promise<ProbeResult> {
  const repo = scratchRepo(context, "nested");
  const runId = "probe-nested";
  const ticket = "NEST-1";
  const stateDir = path.join(context.workDir, "state");
  const runDir = path.join(repo, ".emet", "runs", runId);
  mkdirSync(path.join(runDir, "dispatch"), { recursive: true });
  writeFileSync(
    path.join(runDir, "dispatch", `${ticket}.json`),
    JSON.stringify({ baseline: git(repo, "rev-parse", "HEAD"), surfaces: ["nested.txt"] }),
  );
  const promptFile = path.join(runDir, "prompt.md");
  writeFileSync(
    promptFile,
    'Create `nested.txt` containing `nested`, then run `git add nested.txt` and `git commit -m "test: nested"`. Reply DONE.\n',
  );
  await didReserveTicket(runId, process.pid, ticket, path.join(repo, ".git", "emet"));
  mkdirSync(path.join(stateDir, "slots"), { recursive: true });
  await acquireSlot(2, runId, process.pid, ticket, path.join(stateDir, "slots"));
  const { codexHome } = buildRunHome({
    run: "probe-outer",
    repoRoot: repo,
    sourceHome: context.safeSource,
  });
  const modelFlag = context.model === undefined ? "" : ` --model ${context.model}`;
  const command = `emet dispatch --role worker --run ${runId} --ticket ${ticket} --prompt-file ${promptFile} --root ${repo} --effort ${PROBE_EFFORT}${modelFlag}`;
  const outer = await runModel(context, {
    codexHome,
    cwd: repo,
    prompt: `Run exactly this shell command once and reply with its output, nothing else: \`${command}\``,
    extraArgs: ["--add-dir", path.join(repo, ".git")],
    env: { EMET_STATE_DIR: stateDir },
  });
  if (outer.verdict !== "verified") return runFailure("nested-dispatch", outer);
  const stateFile = path.join(runDir, "codex", `${ticket}.state.json`);
  const pid = readPid(stateFile);
  if (pid === undefined) {
    return {
      id: "nested-dispatch",
      verdict: "failed",
      evidence: `emet dispatch started no inner codex; outer agent said: ${oneLine(agentMessages(outer.stdout))}`,
    };
  }
  const hostCommand = hostCommandLine(pid);
  const foreignPid = hostCommand !== undefined && !hostCommand.includes("codex");
  const exited = foreignPid || (await waitForExit(pid, Date.now() + context.timeoutMs));
  const inner = detachedVerdict(path.join(runDir, "codex", `${ticket}.jsonl`));
  const pidNote = foreignPid
    ? `recorded pid ${pid} is not a codex process on the host (${oneLine(hostCommand)}), so the pid came from the outer sandbox's PID namespace`
    : `inner codex pid ${pid} ${exited ? "exited" : "still running at timeout"}`;
  return {
    id: "nested-dispatch",
    verdict: exited && !foreignPid ? inner.verdict : "failed",
    evidence: `outer sandbox workspace-write (+ --add-dir .git); dispatch said: ${oneLine(agentMessages(outer.stdout))}; ${pidNote}; ${inner.detail}`,
  };
}

async function launchDetached(
  context: ProbeContext,
  repo: string,
  codexHome: string,
  jsonl: string,
): Promise<number | undefined> {
  const stateFile = `${jsonl}.state.json`;
  const spec = {
    args: [
      "exec",
      "--json",
      "-s",
      "workspace-write",
      ...modelFlags(context),
      "Reply with the single word OK. Do not run any command.",
    ],
    cwd: repo,
    codexHome,
    jsonlPath: jsonl,
    stateFile,
    executable: context.executable,
  };
  const launcher = `import { spawnCodex } from ${JSON.stringify(path.join(context.options.repo, "emet/src/codex-process.ts"))};\nspawnCodex(${JSON.stringify(spec)});\n`;
  const launched = await runCommand(["bun", "-e", launcher], repo, context.env, COMMAND_TIMEOUT_MS);
  return launched.exitCode === 0 ? readPid(stateFile) : undefined;
}

async function probeUnattended(context: ProbeContext, attempt = 1): Promise<ProbeResult> {
  const repo = scratchRepo(context, `detached-${attempt}`);
  const { codexHome } = buildRunHome({
    run: "probe-detached",
    repoRoot: repo,
    sourceHome: context.safeSource,
  });
  const jsonl = path.join(repo, ".emet", "runs", "probe-detached", "detached.jsonl");
  const pid = await launchDetached(context, repo, codexHome, jsonl);
  if (pid === undefined) {
    return {
      id: "unattended-supervisor",
      verdict: "failed",
      evidence: "the launcher process did not start codex",
    };
  }
  const exited = await waitForExit(pid, Date.now() + context.timeoutMs);
  const outcome = detachedVerdict(jsonl);
  if (outcome.verdict === "blocked-by-plan-limit" && attempt === 1)
    return probeUnattended(context, attempt + 1);
  return {
    id: "unattended-supervisor",
    verdict: exited ? outcome.verdict : "failed",
    evidence: `codex started by spawnCodex (setsid) from a launcher process that exited first; pid ${pid} ${exited ? "ran to exit" : "still running at timeout"}; ${outcome.detail}. systemd and containers were not exercised`,
  };
}

function shimDirectory(context: { workDir: string; repo: string }): string {
  const bin = path.join(context.workDir, "bin");
  mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, "emet");
  writeFileSync(
    shim,
    `#!/bin/sh\nexec bun ${JSON.stringify(path.join(context.repo, "emet/bin/emet.ts"))} "$@"\n`,
  );
  chmodSync(shim, 0o755);
  return bin;
}

function withSourceCheck(results: ProbeResult[], before: string, after: string): ProbeResult[] {
  return results.map((result) => {
    if (result.id !== "linked-auth") return result;
    const untouched = before === after;
    return {
      ...result,
      verdict: untouched ? result.verdict : "failed",
      evidence: `${result.evidence}; source auth.json/config.toml ${untouched ? "unchanged" : "CHANGED"} after the probe`,
    };
  });
}

async function probeContext(options: ProbeOptions): Promise<ProbeContext> {
  const workDir = mkdtempSync(path.join(options.workDir ?? os.tmpdir(), "emet-codex-probe-"));
  console.error(`probe:codex work dir ${workDir}`);
  const { config } = await loadForgeConfigWithDefaults(options.repo);
  const model = resolveCodexModel(
    "triage",
    config,
    path.join(options.codexHome, "models_cache.json"),
  ).model;
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  env["PATH"] =
    `${shimDirectory({ workDir, repo: options.repo })}${path.delimiter}${env["PATH"] ?? ""}`;
  delete env["CODEX_HOME"];
  return {
    options,
    executable: options.executable ?? "codex",
    workDir,
    env,
    model,
    safeSource: linkAuthOnly(options.codexHome, path.join(workDir, "source")),
    timeoutMs: options.modelTimeoutMs ?? MODEL_TIMEOUT_MS,
  };
}

type FlowStep = {
  readonly step: string;
  readonly verdict: ProbeVerdict;
  readonly evidence: string;
};

const FLOW_SPEC = "probe-flow";
const FLOW_RUN = "probe-flow-w1";

function emet(
  context: ProbeContext,
  cwd: string,
  args: readonly string[],
  extra: Record<string, string> = {},
) {
  return runCommand(["emet", ...args], cwd, { ...context.env, ...extra }, context.timeoutMs);
}

async function prepareFlowRepo(context: ProbeContext): Promise<{ repo: string; baseline: string }> {
  const repo = scratchRepo(context, "flow");
  const init = await emet(context, repo, ["init", "--tracker", "local"]);
  if (init.exitCode !== 0)
    throw new Error(`emet init failed: ${oneLine(init.stderr || init.stdout)}`);
  const configPath = path.join(repo, "emet.config.json");
  const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  const config = isObject(parsed) ? parsed : {};
  const repoSection = isObject(config["repo"]) ? config["repo"] : {};
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...config, repo: { ...repoSection, trunk: "develop" }, agentHost: "codex" }, null, 2)}\n`,
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "chore: emet init");
  const body = path.join(context.workDir, "flow-body.md");
  writeFileSync(body, "Probe spec: two one-line files, one per wave.\n");
  await emet(context, repo, [
    "tracker",
    "create-spec",
    "--slug",
    FLOW_SPEC,
    "--title",
    "Probe flow",
    "--body-file",
    body,
  ]);
  writeFileSync(body, "Create `a.txt` containing `a` and commit it.\n");
  await emet(context, repo, [
    "tracker",
    "create-ticket",
    "--spec",
    FLOW_SPEC,
    "--title",
    "Add a",
    "--body-file",
    body,
  ]);
  writeFileSync(body, "Create `b.txt` containing `b` and commit it.\n");
  await emet(context, repo, [
    "tracker",
    "create-ticket",
    "--spec",
    FLOW_SPEC,
    "--title",
    "Add b",
    "--body-file",
    body,
    "--blocked-by",
    "01",
  ]);
  return { repo, baseline: git(repo, "rev-parse", "HEAD") };
}

async function flowWave1(
  context: ProbeContext,
  repo: string,
  baseline: string,
  ticket: string,
): Promise<FlowStep> {
  const runDir = path.join(repo, ".emet", "runs", FLOW_RUN);
  mkdirSync(path.join(runDir, "dispatch"), { recursive: true });
  writeFileSync(
    path.join(runDir, "dispatch", `${ticket}.json`),
    JSON.stringify({ baseline, surfaces: ["a.txt"] }),
  );
  const promptFile = path.join(runDir, "prompt.md");
  writeFileSync(
    promptFile,
    'Create `a.txt` containing exactly `a`, then run `git add a.txt` and `git commit -m "feat: add a"`. Reply DONE.\n',
  );
  const slots = path.join(context.workDir, "flow-state", "slots");
  mkdirSync(slots, { recursive: true });
  configureTicketPattern((await loadForgeConfigWithDefaults(repo)).config.ticket.idPattern);
  await didReserveTicket(FLOW_RUN, process.pid, ticket, path.join(repo, ".git", "emet"));
  await acquireSlot(2, FLOW_RUN, process.pid, ticket, slots);
  const { run } = await import("../emet/src/dispatch");
  const code = await run(
    [
      "--role",
      "worker",
      "--run",
      FLOW_RUN,
      "--ticket",
      ticket,
      "--prompt-file",
      promptFile,
      "--root",
      repo,
      "--effort",
      PROBE_EFFORT,
      ...(context.model === undefined ? [] : ["--model", context.model]),
    ],
    {
      forgeDirectory: path.join(repo, ".git", "emet"),
      slotsDirectory: slots,
      sourceHome: context.safeSource,
      executable: context.executable,
      env: { PATH: context.env["PATH"] ?? "" },
    },
  );
  const pid = readPid(path.join(runDir, "codex", `${ticket}.state.json`));
  if (code !== 0 || pid === undefined)
    return {
      step: "wave 1: emet dispatch",
      verdict: "failed",
      evidence: `emet dispatch exited ${code}`,
    };
  const exited = await waitForExit(pid, Date.now() + context.timeoutMs);
  const worktree = path.join(repo, ".emet", "worktrees", `agent-${ticket}`);
  const commits = Number(git(worktree, "rev-list", "--count", `${baseline}..HEAD`));
  const stream = detachedVerdict(path.join(runDir, "codex", `${ticket}.jsonl`));
  const landed = commits >= 1 && readText(path.join(worktree, "a.txt")).trim() === "a";
  const standIn = !landed && readText(path.join(worktree, "a.txt")).trim() === "a";
  if (standIn) {
    git(worktree, "add", "a.txt");
    git(worktree, "commit", "-q", "-m", "feat: add a (committed by the probe for the worker)");
  }
  const said = oneLine(agentMessages(readText(path.join(runDir, "codex", `${ticket}.jsonl`))));
  const fileState = landed
    ? "committed"
    : standIn
      ? "written but not committed (the probe committed it so the flow goes on)"
      : "missing";
  return {
    step: "wave 1: emet dispatch",
    verdict:
      landed && exited
        ? "verified"
        : stream.verdict === "blocked-by-plan-limit"
          ? stream.verdict
          : "failed",
    evidence: `dispatch exit 0; worker ${exited ? "exited" : "timed out"}; ${commits} commit(s) on worktree-agent-${ticket}; a.txt ${fileState}; ${stream.detail}; worker said: ${said}`,
  };
}

async function flowReview(
  context: ProbeContext,
  repo: string,
  baseline: string,
  ticket: string,
  attempt = 1,
): Promise<FlowStep> {
  const worktree = path.join(repo, ".emet", "worktrees", `agent-${ticket}`);
  const packageFile = path.join(context.workDir, `review-${ticket}.md`);
  const packaged = await emet(context, repo, [
    "review-package",
    baseline,
    git(worktree, "rev-parse", "HEAD"),
    "--out",
    packageFile,
  ]);
  if (packaged.exitCode !== 0)
    return {
      step: "emet review-run",
      verdict: "failed",
      evidence: `review-package exit ${packaged.exitCode}: ${oneLine(packaged.stderr)}`,
    };
  const review = await emet(
    context,
    repo,
    [
      "review-run",
      "--run",
      FLOW_RUN,
      "--ticket",
      ticket,
      "--package",
      packageFile,
      "--tier",
      "medium",
    ],
    { CODEX_HOME: context.safeSource },
  );
  const verdict = classifyCodexFailure(review.stderr, review.exitCode);
  if (verdict === "blocked-by-plan-limit" && attempt === 1)
    return flowReview(context, repo, baseline, ticket, attempt + 1);
  return {
    step: "emet review-run",
    verdict,
    evidence: `review-run exit ${review.exitCode}: ${oneLine(review.stdout || review.stderr)}`,
  };
}

async function flowLaunch(context: ProbeContext, repo: string, ticket: string): Promise<FlowStep> {
  git(repo, "merge", "--no-ff", "-q", "-m", "chore: land wave 1", `worktree-agent-${ticket}`);
  await emet(context, repo, ["tracker", "close", ticket]);
  const pluginHome = authOnlySource(context, "flow-source");
  const install = await installPlugin(
    codex(context, pluginHome),
    repo,
    context.options.repo,
    EMET_PLUGIN_ID,
  );
  const launched = await emet(context, repo, ["launch", FLOW_SPEC, "--wave", "2"], {
    CODEX_HOME: pluginHome,
  });
  const name = `emet-${FLOW_SPEC}-w2`;
  const sessionDir = path.join(repo, ".emet", "runs", name, "sessions");
  const pid = readPid(path.join(sessionDir, `${name}.state.json`));
  if (launched.exitCode !== 0 || pid === undefined) {
    return {
      step: "emet launch --wave 2",
      verdict: "failed",
      evidence: `launch exit ${launched.exitCode}: ${oneLine(launched.stderr || launched.stdout)}; plugin ${install.evidence}`,
    };
  }
  const exited = await waitForExit(pid, Date.now() + context.timeoutMs);
  const jsonl = path.join(sessionDir, `${name}.jsonl`);
  const stream = detachedVerdict(jsonl);
  const second = await emet(context, repo, ["tracker", "read", `${FLOW_SPEC}-02`]);
  const dispatched = existsSync(path.join(repo, ".emet", "worktrees", `agent-${FLOW_SPEC}-02`));
  return {
    step: "emet launch --wave 2",
    verdict:
      dispatched && exited
        ? "verified"
        : stream.verdict === "blocked-by-plan-limit"
          ? stream.verdict
          : "failed",
    evidence: `launch printed ${oneLine(launched.stdout)}; session pid ${pid} ${exited ? "exited" : "still running at timeout"}; ${stream.detail}; wave 2 worker worktree ${dispatched ? "created" : "absent"}; ticket 02: ${oneLine(second.stdout)}; last agent text: ${oneLine(agentMessages(readText(jsonl)))}`,
  };
}

/**
 * The automated full flow on a throwaway repo: a 2-ticket spec in 2 waves,
 * `emet dispatch` for wave 1, `emet review-run`, then `emet launch <spec> --wave 2`.
 */
async function runFullFlow(options: ProbeOptions): Promise<FlowStep[]> {
  const context = await probeContext(options);
  const ticket = `${FLOW_SPEC}-01`;
  const { repo, baseline } = await prepareFlowRepo(context);
  const wave1 = await flowWave1(context, repo, baseline, ticket);
  const worktree = path.join(repo, ".emet", "worktrees", `agent-${ticket}`);
  if (Number(git(worktree, "rev-list", "--count", `${baseline}..HEAD`)) === 0) return [wave1];
  const review = await flowReview(context, repo, baseline, ticket);
  const launch = await flowLaunch(context, repo, ticket);
  return [wave1, review, launch];
}

/**
 * Checks each `unverified` Codex behaviour of `docs/guide/codex.md` against
 * the `codex` executable, every run under a temporary `CODEX_HOME` overlay
 * built by `buildRunHome`. The source home is only read and linked.
 */
/** Prints each finished row to stderr, so a long run leaves partial evidence behind. */
function logged<T extends ProbeResult | ProbeResult[]>(result: T): T {
  console.error(`probe:codex ${JSON.stringify(result)}`);
  return result;
}

export async function runProbe(options: ProbeOptions): Promise<ProbeResult[]> {
  const context = await probeContext(options);
  const before = fingerprint(options.codexHome);
  const auth = await probeLinkedAuth(context);
  const rules = logged(await probeRulesLocation(context, auth.repo, auth.codexHome));
  const gate = logged(await probeApprovalGate(context));
  const plugin = logged(await probePluginSkill(context));
  const install = logged(await probePluginInstall(context));
  const nested = logged(await probeNestedDispatch(context));
  const unattended = logged(await probeUnattended(context));
  return withSourceCheck(
    [auth.result, rules, ...gate, ...plugin, ...install, nested, unattended],
    before,
    fingerprint(options.codexHome),
  );
}

if (import.meta.main) {
  if (process.env["EMET_CODEX_PROBE"] !== "1") {
    console.log("probe:codex skipped (set EMET_CODEX_PROBE=1 to run it against the real codex)");
    process.exit(0);
  }
  const options: ProbeOptions = {
    codexHome: path.join(os.homedir(), ".codex"),
    repo: path.resolve(import.meta.dir, ".."),
    ...(process.env["EMET_CODEX_PROBE_EXECUTABLE"]
      ? { executable: process.env["EMET_CODEX_PROBE_EXECUTABLE"] }
      : {}),
  };
  const flowOnly = process.argv.includes("--flow-only");
  const items = flowOnly ? [] : await runProbe(options);
  const flow = flowOnly || process.argv.includes("--flow") ? await runFullFlow(options) : [];
  console.log(JSON.stringify({ items, flow }, null, 2));
}

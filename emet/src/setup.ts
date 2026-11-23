import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import {
  MATTPOCOCK_SKILLS_PLUGIN_ID,
  parsePluginListOutput,
  resolveBinaryOnPath,
} from "./dependencies";
import { stringifySorted } from "./envelope";
import { exitCodes } from "./exit-codes";
import { BINARY } from "./names";
import { errorMessage, isObject } from "./narrow";
import {
  RECOMMENDED_CLAUDE_SETTINGS,
  applyClaudeSettings,
  isRecommendedApplied,
} from "./settingsapply";

/**
 * `emet setup`: the optional installs. Each item detects itself and installs
 * through an injected {@link SetupEnv}, so one failure is contained per item and
 * tests never touch the host.
 */

export type SetupItemId =
  | "mattpocock-skills"
  | "engram"
  | "agent-browser"
  | "context7"
  | "firecrawl-local"
  | "mascot"
  | "orca-pet"
  | "gh-auth"
  | "claude-settings";

/** One effect an item's `install()` would have: a command it runs, a file it writes or removes, or a note. */
export interface PlannedStep {
  readonly kind: "run" | "write" | "remove" | "note";
  readonly description: string;
}

export interface SetupItem {
  readonly id: SetupItemId;
  readonly label: string;
  readonly defaultOn: boolean;
  readonly detect: () => Promise<boolean>;
  readonly install: () => Promise<void>;
  /** The steps `install()` would take, computed with read-only probes; it never runs a command or writes a file. */
  readonly plan: () => Promise<readonly PlannedStep[]>;
}

export type SetupStatus = "installed" | "already-present" | "skipped" | "failed" | "planned";

export interface SetupResult {
  readonly id: string;
  readonly status: SetupStatus;
  readonly detail?: string;
  readonly planned?: readonly PlannedStep[];
}

export interface SetupOptions {
  readonly yes: boolean;
  readonly with: readonly string[];
  readonly tty: boolean;
  readonly dryRun?: boolean;
}

export interface SetupDeps {
  readonly catalog: readonly SetupItem[];
  readonly ask: (question: string) => Promise<string>;
  readonly release?: () => void;
}

export interface SetupEnv {
  readonly commandExists: (name: string) => Promise<boolean>;
  readonly run: (argv: readonly string[]) => Promise<number>;
  readonly probe: (argv: readonly string[]) => Promise<number>;
  readonly capture: (argv: readonly string[]) => Promise<string>;
  readonly pathExists: (target: string) => boolean;
  readonly readFile: (target: string) => string | undefined;
  readonly writeFile: (target: string, content: string) => void;
  readonly listDirectory: (target: string) => readonly string[];
  readonly download: (url: string, destination: string) => Promise<void>;
  readonly log: (line: string) => void;
  readonly now: () => Date;
  homeDir: string;
}

export const MASCOT_PLUGIN_ID = "emet-mascot@emet-marketplace";
const ORCA_PET_BASE_URL =
  "https://raw.githubusercontent.com/andryorelabs/emet/main/docs/brand/pet/emet";
const ORCA_PET_FILES = ["pet.json", "spritesheet.webp"] as const;
const ENGRAM_PLUGIN_ID = "engram@engram";
const ENGRAM_BREW_FORMULA = "gentleman-programming/tap/engram";
const NOTICE_MARKER = "setup-notice-shown";
const NOTICE_TEXT = `emet has optional extras (Engram memory, context7 docs lookup, Firecrawl Local web research, the mascot, recommended Claude Code settings). Run /emet:setup to choose them.`;

async function runChecked(env: SetupEnv, argv: readonly string[]): Promise<void> {
  const code = await env.run(argv);
  if (code !== 0) throw new Error(`\`${argv.join(" ")}\` exited ${code}`);
}

const APPARMOR_RESTRICT_USERNS_FILE = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";
const APPARMOR_PROFILE_NAME = "emet-agent-browser-chrome";
const APPARMOR_PROFILE_PATH = `/etc/apparmor.d/${APPARMOR_PROFILE_NAME}`;
const AGENT_BROWSER_CONFIG = `${JSON.stringify({ contentBoundaries: true, maxOutput: 50_000 }, null, 2)}\n`;
const CHROME_DIRECTORY_PATTERN = /^chrome-(\d+(?:\.\d+)*)$/;

function compareVersions(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Returns the newest `chrome-<version>/chrome` that agent-browser downloaded, comparing versions numerically. */
export function findAgentBrowserChrome(env: SetupEnv): string | undefined {
  const browsersDirectory = path.join(env.homeDir, ".agent-browser", "browsers");
  const candidates: { version: number[]; binary: string }[] = [];
  for (const name of env.listDirectory(browsersDirectory)) {
    const match = CHROME_DIRECTORY_PATTERN.exec(name);
    if (match?.[1] === undefined) continue;
    const binary = path.join(browsersDirectory, name, "chrome");
    if (!env.pathExists(binary)) continue;
    candidates.push({ version: match[1].split(".").map(Number), binary });
  }
  candidates.sort((left, right) => compareVersions(right.version, left.version));
  return candidates[0]?.binary;
}

/** Lines that explain how to load an AppArmor profile for the downloaded Chrome; setup prints them and never runs them. */
export function appArmorProfileMessage(homeDir: string): readonly string[] {
  const chromeGlob = path.join(homeDir, ".agent-browser", "browsers", "chrome-*", "chrome");
  return [
    "AppArmor restricts unprivileged user namespaces on this machine, so the downloaded Chrome cannot start its sandbox. Firecrawl Local never runs Chrome without its sandbox.",
    `Load a profile for it by running these commands yourself (setup never runs sudo):`,
    `sudo tee ${APPARMOR_PROFILE_PATH} <<'EOF'`,
    `abi <abi/4.0>,`,
    `include <tunables/global>`,
    `profile ${APPARMOR_PROFILE_NAME} ${chromeGlob} flags=(unconfined) {`,
    `  userns,`,
    `}`,
    `EOF`,
    `sudo apparmor_parser -r ${APPARMOR_PROFILE_PATH}`,
  ];
}

function runStep(argv: readonly string[]): PlannedStep {
  return { kind: "run", description: argv.join(" ") };
}

function writeStep(target: string, detail?: string): PlannedStep {
  return { kind: "write", description: detail === undefined ? target : `${target} (${detail})` };
}

function firecrawlAddArgv(chrome: string | undefined): readonly string[] {
  return [
    "claude",
    "mcp",
    "add",
    "firecrawl-local",
    "--scope",
    "user",
    "-e",
    "FIRECRAWL_CLOUD=search",
    ...(chrome === undefined ? [] : ["-e", `FIRECRAWL_CHROME_PATH=${chrome}`]),
    "--",
    "firecrawl-local",
    "mcp",
    "--public-only",
  ];
}

const FIRECRAWL_REMOVE_ARGV = ["claude", "mcp", "remove", "firecrawl-local", "-s", "user"] as const;

function readSettingsForPlan(env: SetupEnv, settingsPath: string): Record<string, unknown> {
  const text = env.readFile(settingsPath);
  if (text === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    throw new Error(`${settingsPath} is not valid JSON: ${errorMessage(error)}`, { cause: error });
  }
  if (!isObject(parsed) || Array.isArray(parsed)) {
    throw new TypeError(`${settingsPath} is not a JSON object`);
  }
  return parsed;
}

function planClaudeSettings(env: SetupEnv, settingsPath: string): readonly PlannedStep[] {
  const settings = readSettingsForPlan(env, settingsPath);
  const steps: PlannedStep[] = [];
  if (env.readFile(settingsPath) !== undefined) {
    const stamp = env.now().toISOString().replaceAll(/[:.]/g, "-");
    steps.push(writeStep(`${settingsPath}.bak-${stamp}`, "backup"));
  }
  const { permissions } = settings;
  const existing = isObject(permissions) && Array.isArray(permissions.deny) ? permissions.deny : [];
  const missing = RECOMMENDED_CLAUDE_SETTINGS.deny.filter((rule) => !existing.includes(rule));
  const model =
    settings.model === RECOMMENDED_CLAUDE_SETTINGS.model
      ? "model unchanged"
      : `set model ${RECOMMENDED_CLAUDE_SETTINGS.model}`;
  steps.push(
    writeStep(
      settingsPath,
      missing.length === 0 ? model : `${model}; add deny ${missing.join(", ")}`,
    ),
  );
  return steps;
}

const pluginListCache = new WeakMap<SetupEnv, Promise<string>>();

/** Lists the plugins once per `env` until an install invalidates it, since each call costs about a second. */
async function pluginInstalled(env: SetupEnv, pluginId: string): Promise<boolean> {
  let listing = pluginListCache.get(env);
  if (listing === undefined) {
    listing = env.capture(["claude", "plugin", "list"]);
    pluginListCache.set(env, listing);
  }
  return parsePluginListOutput(await listing, pluginId) === "installed";
}

/** Builds the catalog over `env`: the nine optional installs in the order they are offered. */
export function createCatalog(env: SetupEnv): readonly SetupItem[] {
  const settingsPath = path.join(env.homeDir, ".claude", "settings.json");
  const agentBrowserConfigPath = path.join(env.homeDir, ".agent-browser", "config.json");
  const orcaPetDirectory = path.join(env.homeDir, ".emet", "orca-pet", "emet");
  const items: readonly SetupItem[] = [
    {
      id: "mattpocock-skills",
      label: "mattpocock-skills plugin (skills the /emet prompts use)",
      defaultOn: true,
      detect: () => pluginInstalled(env, MATTPOCOCK_SKILLS_PLUGIN_ID),
      install: async () => {
        await env.run([
          "claude",
          "plugin",
          "marketplace",
          "add",
          "anthropics/claude-plugins-official",
        ]);
        await runChecked(env, ["claude", "plugin", "install", MATTPOCOCK_SKILLS_PLUGIN_ID]);
      },
      plan: () =>
        Promise.resolve([
          runStep(["claude", "plugin", "marketplace", "add", "anthropics/claude-plugins-official"]),
          runStep(["claude", "plugin", "install", MATTPOCOCK_SKILLS_PLUGIN_ID]),
        ]),
    },
    {
      id: "engram",
      label: "Engram persistent memory (binary plus the Claude Code integration)",
      defaultOn: false,
      detect: async () =>
        (await env.commandExists("engram")) && (await pluginInstalled(env, ENGRAM_PLUGIN_ID)),
      install: async () => {
        if (!(await env.commandExists("brew"))) {
          throw new Error(
            "Homebrew is not installed; see https://github.com/Gentleman-Programming/engram/blob/main/docs/INSTALLATION.md",
          );
        }
        await runChecked(env, ["brew", "install", ENGRAM_BREW_FORMULA]);
        await runChecked(env, ["engram", "setup", "claude-code"]);
      },
      plan: async () =>
        (await env.commandExists("brew"))
          ? [
              runStep(["brew", "install", ENGRAM_BREW_FORMULA]),
              runStep(["engram", "setup", "claude-code"]),
            ]
          : [{ kind: "note", description: "Homebrew is not installed; the install would fail" }],
    },
    {
      id: "agent-browser",
      label:
        "agent-browser CLI (browser automation for UI verification, plus its browser download)",
      defaultOn: false,
      detect: async () =>
        (await env.commandExists("agent-browser")) && env.pathExists(agentBrowserConfigPath),
      install: async () => {
        await runChecked(env, ["bun", "add", "-g", "agent-browser@latest"]);
        try {
          await runChecked(env, ["agent-browser", "install"]);
        } catch (error) {
          env.log(
            "The browser download did not finish. Run `agent-browser install` yourself; if system libraries are missing it will say which.",
          );
          throw error;
        }
        if (!env.pathExists(agentBrowserConfigPath)) {
          env.writeFile(agentBrowserConfigPath, AGENT_BROWSER_CONFIG);
        }
        try {
          await runChecked(env, ["agent-browser", "doctor"]);
        } catch (error) {
          env.log(
            `Warning: \`agent-browser doctor\` reported a problem (${errorMessage(error)}). Run \`agent-browser doctor\` yourself to see what is missing.`,
          );
        }
      },
      plan: () =>
        Promise.resolve([
          runStep(["bun", "add", "-g", "agent-browser@latest"]),
          runStep(["agent-browser", "install"]),
          ...(env.pathExists(agentBrowserConfigPath) ? [] : [writeStep(agentBrowserConfigPath)]),
          runStep(["agent-browser", "doctor"]),
        ]),
    },
    {
      id: "context7",
      label: "context7 ctx7 CLI and its find-docs skill (current library docs lookup)",
      defaultOn: false,
      detect: async () =>
        (await env.commandExists("ctx7")) &&
        env.pathExists(path.join(env.homeDir, ".claude", "skills", "find-docs", "SKILL.md")),
      install: async () => {
        await runChecked(env, ["bun", "add", "-g", "ctx7@latest"]);
        const runSetupStep = async (step: readonly string[]): Promise<void> => {
          try {
            await runChecked(env, step);
          } catch (error) {
            env.log(`The ctx7 setup did not finish. Run \`${step.join(" ")}\` yourself.`);
            throw error;
          }
        };
        await runSetupStep(["ctx7", "setup", "--cli", "--claude", "--yes"]);
        if (await env.commandExists("codex")) {
          await runSetupStep(["ctx7", "setup", "--cli", "--codex", "--yes"]);
        }
      },
      plan: async () => [
        runStep(["bun", "add", "-g", "ctx7@latest"]),
        runStep(["ctx7", "setup", "--cli", "--claude", "--yes"]),
        ...((await env.commandExists("codex"))
          ? [runStep(["ctx7", "setup", "--cli", "--codex", "--yes"])]
          : []),
      ],
    },
    {
      id: "firecrawl-local",
      label:
        "Firecrawl Local MCP server (local scrape, crawl and map; web search goes to Firecrawl Cloud)",
      defaultOn: false,
      detect: async () =>
        (await env.commandExists("firecrawl-local")) &&
        (await env.capture(["claude", "mcp", "get", "firecrawl-local"])).includes(
          "FIRECRAWL_CLOUD=search",
        ),
      install: async () => {
        if (!(await env.commandExists("firecrawl-local"))) {
          if (!(await env.commandExists("cargo"))) {
            throw new Error("cargo is not installed; install Rust first, see https://rustup.rs");
          }
          await runChecked(env, ["cargo", "install", "firecrawl-local"]);
        }
        const chrome = findAgentBrowserChrome(env);
        await env.run([...FIRECRAWL_REMOVE_ARGV]);
        await runChecked(env, firecrawlAddArgv(chrome));
        if (chrome === undefined) {
          env.log(
            "Chrome or Chromium is optional and only needed for JavaScript pages; set FIRECRAWL_CHROME_PATH if it is not found.",
          );
        } else if (env.readFile(APPARMOR_RESTRICT_USERNS_FILE)?.trim() === "1") {
          for (const line of appArmorProfileMessage(env.homeDir)) env.log(line);
        }
      },
      plan: async () => {
        const steps: PlannedStep[] = [];
        if (!(await env.commandExists("firecrawl-local"))) {
          steps.push(
            (await env.commandExists("cargo"))
              ? runStep(["cargo", "install", "firecrawl-local"])
              : { kind: "note", description: "cargo is not installed; the install would fail" },
          );
        }
        const chrome = findAgentBrowserChrome(env);
        steps.push(runStep(FIRECRAWL_REMOVE_ARGV), runStep(firecrawlAddArgv(chrome)));
        if (chrome === undefined) {
          steps.push({
            kind: "note",
            description: "no Chrome found; set FIRECRAWL_CHROME_PATH for JavaScript pages",
          });
        } else if (env.readFile(APPARMOR_RESTRICT_USERNS_FILE)?.trim() === "1") {
          steps.push({
            kind: "note",
            description: `AppArmor profile instructions would be printed for ${APPARMOR_PROFILE_PATH}`,
          });
        }
        return steps;
      },
    },
    {
      id: "mascot",
      label: "emet-mascot Claude Code plugin",
      defaultOn: false,
      detect: () => pluginInstalled(env, MASCOT_PLUGIN_ID),
      install: async () => {
        await env.run(["claude", "plugin", "marketplace", "add", "andryorelabs/emet"]);
        await runChecked(env, ["claude", "plugin", "install", MASCOT_PLUGIN_ID]);
      },
      plan: () =>
        Promise.resolve([
          runStep(["claude", "plugin", "marketplace", "add", "andryorelabs/emet"]),
          runStep(["claude", "plugin", "install", MASCOT_PLUGIN_ID]),
        ]),
    },
    {
      id: "orca-pet",
      label: "Orca pet bundle (then import it in Orca's settings)",
      defaultOn: false,
      detect: () => Promise.resolve(env.pathExists(path.join(orcaPetDirectory, "pet.json"))),
      install: async () => {
        for (const file of ORCA_PET_FILES) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: installs and prompts run one at a time
          await env.download(`${ORCA_PET_BASE_URL}/${file}`, path.join(orcaPetDirectory, file));
        }
        env.log(
          `Orca pet saved to ${orcaPetDirectory}; use "Import .codex-pet bundle..." in Orca.`,
        );
      },
      plan: () =>
        Promise.resolve(
          ORCA_PET_FILES.map((file) =>
            writeStep(path.join(orcaPetDirectory, file), `download ${ORCA_PET_BASE_URL}/${file}`),
          ),
        ),
    },
    {
      id: "gh-auth",
      label: "GitHub CLI login (gh auth login)",
      defaultOn: false,
      detect: async () => (await env.probe(["gh", "auth", "status"])) === 0,
      install: () => runChecked(env, ["gh", "auth", "login"]),
      plan: () => Promise.resolve([runStep(["gh", "auth", "login"])]),
    },
    {
      id: "claude-settings",
      label:
        "Recommended Claude Code settings (opusplan model, deny rm -rf, force push, .env reads)",
      defaultOn: false,
      detect: () =>
        Promise.resolve(isRecommendedApplied(settingsPath, RECOMMENDED_CLAUDE_SETTINGS)),
      install: () => {
        const { backupPath } = applyClaudeSettings(settingsPath, RECOMMENDED_CLAUDE_SETTINGS, env);
        env.log(
          backupPath === ""
            ? `Created ${settingsPath}`
            : `Backed up ${settingsPath} to ${backupPath}`,
        );
        return Promise.resolve();
      },
      plan: () => Promise.resolve().then(() => planClaudeSettings(env, settingsPath)),
    },
  ];
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    defaultOn: item.defaultOn,
    detect: item.detect,
    plan: item.plan,
    install: async () => {
      try {
        await item.install();
      } finally {
        pluginListCache.delete(env);
      }
    },
  }));
}

const PROBE_TIMEOUT_MS = 30_000;

async function spawnExitCode(
  argv: readonly string[],
  mode: "inherit" | "quiet" | "capture",
): Promise<[number, string]> {
  try {
    const child = Bun.spawn([...argv], {
      stdin: mode === "inherit" ? "inherit" : "ignore",
      stdout: mode === "inherit" ? "inherit" : mode === "capture" ? "pipe" : "ignore",
      stderr: mode === "inherit" ? "inherit" : "ignore",
      ...(mode === "inherit" ? {} : { timeout: PROBE_TIMEOUT_MS }),
    });
    const output = mode === "capture" ? await new Response(child.stdout).text() : "";
    return [await child.exited, output];
  } catch {
    return [127, ""];
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, new Uint8Array(await response.arrayBuffer()));
}

export const realSetupEnv: SetupEnv = {
  commandExists: resolveBinaryOnPath,
  run: async (argv) => (await spawnExitCode(argv, "inherit"))[0],
  probe: async (argv) => (await spawnExitCode(argv, "quiet"))[0],
  capture: async (argv) => (await spawnExitCode(argv, "capture"))[1],
  pathExists: existsSync,
  readFile: (target) => {
    try {
      return readFileSync(target, "utf8");
    } catch {
      return undefined;
    }
  },
  writeFile: (target, content) => {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  },
  listDirectory: (target) => {
    try {
      return readdirSync(target);
    } catch {
      return [];
    }
  },
  download: downloadFile,
  log: (line) => {
    console.log(line);
  },
  now: () => new Date(),
  homeDir: os.homedir(),
};

export const SETUP_CATALOG: readonly SetupItem[] = createCatalog(realSetupEnv);

async function applyItem(item: SetupItem, dryRun: boolean): Promise<SetupResult> {
  try {
    if (await item.detect()) return { id: item.id, status: "already-present" };
    if (dryRun) return { id: item.id, status: "planned", planned: await item.plan() };
    await item.install();
    return { id: item.id, status: "installed" };
  } catch (error: unknown) {
    return { id: item.id, status: "failed", detail: errorMessage(error) };
  }
}

async function chooseInteractively(
  catalog: readonly SetupItem[],
  ask: SetupDeps["ask"],
): Promise<Set<string>> {
  const chosen = new Set<string>();
  for (const item of catalog) {
    const hint = item.defaultOn ? "Y/n" : "y/N";
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: installs and prompts run one at a time
    const answer = (await ask(`Install ${item.label}? [${hint}] `)).trim().toLowerCase();
    if (answer === "" ? item.defaultOn : answer === "y" || answer === "yes") chosen.add(item.id);
  }
  return chosen;
}

/**
 * Runs the chosen installs and reports one result per catalog item, plus one
 * `failed` result per unknown name in `with`. `with` wins, then `yes` (the
 * default-on items), then prompts when there is a TTY; otherwise nothing is
 * chosen. A failing item never stops the rest. With `dryRun`, an item that is not
 * present reports `planned` with its steps and nothing is installed.
 */
export async function runSetup(options: SetupOptions, deps: SetupDeps): Promise<SetupResult[]> {
  const known = new Set<string>(deps.catalog.map((item) => item.id));
  let chosen: Set<string>;
  if (options.with.length > 0) chosen = new Set(options.with);
  else if (options.yes)
    chosen = new Set(deps.catalog.filter((item) => item.defaultOn).map((item) => item.id));
  else if (options.tty) chosen = await chooseInteractively(deps.catalog, deps.ask);
  else chosen = new Set();
  deps.release?.();
  const results: SetupResult[] = [];
  for (const item of deps.catalog) {
    if (!chosen.has(item.id)) {
      results.push({ id: item.id, status: "skipped" });
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: installs and prompts run one at a time
    results.push(await applyItem(item, options.dryRun === true));
  }
  for (const name of chosen) {
    if (!known.has(name)) results.push({ id: name, status: "failed", detail: "unknown item" });
  }
  return results;
}

/** A readline prompter over `input`/`output`; end of input answers every question with an empty string. */
export function createPrompter(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): { ask: (question: string) => Promise<string>; close: () => void } {
  const readline = createInterface({ input });
  const lines = readline[Symbol.asyncIterator]();
  return {
    ask: async (question) => {
      output.write(question);
      const next = await lines.next();
      return next.done === true ? "" : next.value;
    },
    close: () => {
      readline.close();
    },
  };
}

/** The `ask` used when nothing is interactive: every question gets an empty answer. */
export function askNothing(): Promise<string> {
  return Promise.resolve("");
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseWithList(argv: readonly string[]): string[] {
  return (flagValue(argv, "--with") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** The one-time notice marker path: under `dataDirectory` (the plugin data directory) when given, else `~/.emet`. */
export function noticeMarkerPath(dataDirectory: string | undefined, homeDir: string): string {
  const directory =
    dataDirectory !== undefined && dataDirectory !== ""
      ? dataDirectory
      : path.join(homeDir, ".emet");
  return path.join(directory, NOTICE_MARKER);
}

/** Prints the one-time notice and writes the marker; prints nothing when the marker exists. Returns whether it printed. */
export function showNoticeOnce(markerPath: string, log: (line: string) => void): boolean {
  if (existsSync(markerPath)) return false;
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, `${new Date().toISOString()}\n`);
  log(NOTICE_TEXT);
  return true;
}

async function describeCatalog(
  catalog: readonly SetupItem[],
): Promise<{ id: string; label: string; defaultOn: boolean; present: boolean }[]> {
  const rows = [];
  for (const item of catalog) {
    rows.push({
      id: item.id,
      label: item.label,
      defaultOn: item.defaultOn,
      // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: installs and prompts run one at a time
      present: await item.detect(),
    });
  }
  return rows;
}

function printCatalog(rows: Awaited<ReturnType<typeof describeCatalog>>, json: boolean): void {
  if (json) {
    console.log(stringifySorted({ catalog: rows }));
    return;
  }
  for (const row of rows) {
    const flags = `${row.defaultOn ? "default" : "optional"}${row.present ? ", present" : ""}`;
    console.log(`${row.id}\t${flags}\t${row.label}`);
  }
  console.log(`\nInstall with: ${BINARY} setup --with <id,id> (or --yes for the defaults)`);
}

function printResults(results: readonly SetupResult[], json: boolean): void {
  if (json) {
    console.log(stringifySorted({ results }));
    return;
  }
  for (const result of results) {
    const detail = result.detail === undefined ? "" : `: ${result.detail}`;
    console.log(`${result.status}\t${result.id}${detail}`);
    for (const step of result.planned ?? []) console.log(`  ${step.kind}\t${step.description}`);
  }
}

/** Entry point for `emet setup`; exits 1 when any step failed, 2 on a usage error. */
export async function run(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  try {
    if (argv.includes("--notice")) {
      showNoticeOnce(
        noticeMarkerPath(flagValue(argv, "--data-dir"), realSetupEnv.homeDir),
        (line) => {
          realSetupEnv.log(JSON.stringify({ systemMessage: line }));
        },
      );
      return;
    }
    const withList = parseWithList(argv);
    const yes = argv.includes("--yes");
    const tty = process.stdin.isTTY && !json;
    if (argv.includes("--list") || (!tty && !yes && withList.length === 0)) {
      printCatalog(await describeCatalog(createCatalog(realSetupEnv)), json);
      return;
    }
    const dryRun = argv.includes("--dry-run");
    const catalog = createCatalog(realSetupEnv);
    const interactive = tty && !yes && withList.length === 0;
    const prompter = interactive ? createPrompter(process.stdin, process.stdout) : undefined;
    try {
      const results = await runSetup(
        { yes, with: withList, tty, dryRun },
        {
          catalog,
          ask: prompter?.ask ?? askNothing,
          release: () => {
            prompter?.close();
          },
        },
      );
      printResults(results, json);
      if (results.some((result) => result.status === "failed"))
        process.exitCode = exitCodes.findings;
    } finally {
      prompter?.close();
    }
  } catch (error: unknown) {
    console.error(errorMessage(error));
    process.exitCode = exitCodes.usage;
  }
}

/** `emet memory`: searches and saves cross-run lessons in Engram; an Engram problem never fails the command. */

import {
  loadForgeConfigWithDefaults,
  resolveMemoryEnabled,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import { openEngramClient, type EngramClient, type EngramUnavailable } from "./engram-client";
import { exitCodes } from "./exit-codes";
import { errorMessage } from "./narrow";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const MAX_CONTENT_CHARS = 2000;
const MAX_NOTE_CHARS = 20_000;
const MAX_BULLETS = 5;
const MAX_BULLET_CHARS = 300;
const EXISTING_NOTE_SEARCH_LIMIT = 20;
const OUTCOMES = ["landed", "chained", "hold", "stop", "blocked"] as const;
const KEY_PATTERN = /^(?:spec-[A-Za-z0-9]+|quick-[A-Za-z0-9._-]+)$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const USAGE = [
  "usage: emet memory search --json <query> [--limit <n>]",
  "       emet memory save --json --key <spec-<id>|quick-<runId>> --run <runId> --outcome <landed|chained|hold|stop|blocked>  (1-5 `- ` bullets on stdin)",
].join("\n");

/** Collaborators of {@link run}; tests inject fakes, the default talks to the real Engram. */
export interface MemoryDeps {
  readonly resolveRepoRoot: typeof resolveRepoRoot;
  readonly loadConfig: (repoRoot: string) => Promise<ForgeConfig>;
  readonly openClient: (repoRoot: string) => Promise<EngramClient | EngramUnavailable>;
  readonly readStdin: () => Promise<string>;
  readonly repoName: (repoRoot: string, remote: string) => Promise<string>;
  readonly now: () => Date;
}

/** A lesson note as `emet memory search` prints it. */
export interface MemoryResult {
  readonly id: number;
  readonly topicKey: string;
  readonly title: string;
  readonly content: string;
}

class UsageError extends Error {}

async function defaultLoadConfig(repoRoot: string): Promise<ForgeConfig> {
  return (await loadForgeConfigWithDefaults(repoRoot)).config;
}

function lastSegment(remoteUrl: string): string {
  const segments = remoteUrl
    .trim()
    .replace(/\/+$/, "")
    .split(/[/:]/)
    .filter((segment) => segment !== "");
  return (segments.at(-1) ?? "").replace(/\.git$/, "");
}

async function gitText(cwd: string, args: readonly string[]): Promise<string | null> {
  const output = await Bun.$`git ${args}`.cwd(cwd).nothrow().quiet();
  const text = output.stdout.toString().trim();
  return output.exitCode === 0 && text !== "" ? text : null;
}

/**
 * The repo name lessons are keyed under: the last path segment of the remote
 * URL with `.git` stripped, else the basename of the main worktree.
 */
export async function defaultRepoName(repoRoot: string, remote: string): Promise<string> {
  const remoteUrl = await gitText(repoRoot, ["remote", "get-url", remote]);
  const fromRemote = remoteUrl === null ? "" : lastSegment(remoteUrl);
  if (fromRemote !== "") return fromRemote;
  const commonDirectory = await gitText(repoRoot, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const mainRoot =
    commonDirectory === null ? repoRoot : commonDirectory.replace(/[/\\]\.git[/\\]?$/, "");
  return lastSegment(mainRoot.replaceAll("\\", "/"));
}

const DEFAULT_DEPS: MemoryDeps = {
  resolveRepoRoot,
  loadConfig: defaultLoadConfig,
  openClient: (repoRoot) => openEngramClient(repoRoot),
  readStdin: () => Bun.stdin.text(),
  repoName: defaultRepoName,
  now: () => new Date(),
};

interface ParsedArgs {
  readonly positionals: string[];
  readonly values: Map<string, string>;
}

const VALUE_FLAGS: ReadonlySet<string> = new Set(["--limit", "--key", "--run", "--outcome"]);

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (VALUE_FLAGS.has(token)) {
      const value = argv[index + 1];
      if (value === undefined) throw new UsageError(`${token} needs a value`);
      values.set(token, value);
      index += 1;
    } else if (!token.startsWith("--")) {
      positionals.push(token);
    }
  }
  return { positionals, values };
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new UsageError(`--limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  return limit;
}

interface SaveRequest {
  readonly key: string;
  readonly runId: string;
  readonly outcome: string;
  readonly bullets: readonly string[];
}

function parseSaveFlags(values: ReadonlyMap<string, string>): Omit<SaveRequest, "bullets"> {
  const key = values.get("--key") ?? "";
  const runId = values.get("--run") ?? "";
  const outcome = values.get("--outcome") ?? "";
  if (!KEY_PATTERN.test(key)) {
    throw new UsageError("--key must be spec-<id> or quick-<runId>");
  }
  if (!RUN_ID_PATTERN.test(runId)) throw new UsageError("--run needs a run id");
  if (!OUTCOMES.some((candidate) => candidate === outcome)) {
    throw new UsageError(`--outcome must be one of ${OUTCOMES.join("|")}`);
  }
  return { key, runId, outcome };
}

function parseBullets(stdin: string): string[] {
  const bullets = stdin
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line !== "");
  if (bullets.length < 1 || bullets.length > MAX_BULLETS) {
    throw new UsageError(`stdin needs 1 to ${MAX_BULLETS} \`- \` bullets`);
  }
  if (bullets.some((bullet) => bullet.length > MAX_BULLET_CHARS)) {
    throw new UsageError(`each bullet must be at most ${MAX_BULLET_CHARS} characters`);
  }
  return bullets;
}

function print(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload));
}

function splitSections(content: string): { preamble: string; sections: string[] } {
  const parts = content.split(/^(?=## )/m);
  const first = parts[0] ?? "";
  if (first.startsWith("## ")) {
    return { preamble: "", sections: parts.map((part) => part.trimEnd()) };
  }
  return { preamble: first.trimEnd(), sections: parts.slice(1).map((part) => part.trimEnd()) };
}

function joinNote(preamble: string, sections: readonly string[]): string {
  return [preamble, ...sections].filter((part) => part !== "").join("\n\n");
}

/** Appends `section` to `existing` and drops the oldest sections while the note exceeds the cap. */
export function mergeNote(existing: string, section: string, header: string): string {
  const { preamble, sections } = splitSections(existing);
  const kept = [...sections, section];
  const head = preamble === "" ? header : preamble;
  while (kept.length > 1 && joinNote(head, kept).length > MAX_NOTE_CHARS) kept.shift();
  return joinNote(head, kept);
}

async function runSearch(
  client: EngramClient,
  query: string,
  limit: number,
  prefix: string,
): Promise<MemoryResult[]> {
  const hits = await client.search(query, limit);
  return Promise.all(
    hits.flatMap((hit) =>
      hit.topicKey?.startsWith(prefix) === true
        ? [
            client.get(hit.id).then((note): MemoryResult => ({
              id: hit.id,
              topicKey: hit.topicKey ?? "",
              title: note.title === "" ? hit.title : note.title,
              content: note.content.slice(0, MAX_CONTENT_CHARS),
            })),
          ]
        : [],
    ),
  );
}

async function findNote(
  client: EngramClient,
  queries: readonly string[],
  topicKey: string,
): Promise<{ id: number } | undefined> {
  const results = await Promise.all(
    queries.map((query) => client.search(query, EXISTING_NOTE_SEARCH_LIMIT)),
  );
  return results.flat().find((hit) => hit.topicKey === topicKey);
}

async function runSave(
  client: EngramClient,
  request: SaveRequest,
  repo: string,
  date: string,
): Promise<string> {
  const topicKey = `emet/${repo}/lessons/${request.key}`;
  const title = `emet lessons: ${repo} ${request.key}`;
  const match = await findNote(client, [title, topicKey, request.key], topicKey);
  const existing = match === undefined ? "" : (await client.get(match.id)).content;
  const section = [
    `## ${request.runId} — ${request.outcome} (${date})`,
    ...request.bullets.map((bullet) => `- ${bullet}`),
  ].join("\n");
  const content = mergeNote(existing, section, `# ${title}`);
  await client.save({ title, content, type: "learning", topicKey });
  return topicKey;
}

type Subcommand =
  | { readonly kind: "search"; readonly query: string; readonly limit: number }
  | { readonly kind: "save"; readonly request: SaveRequest };

async function parseSubcommand(argv: readonly string[], deps: MemoryDeps): Promise<Subcommand> {
  const { positionals, values } = parseArgs(argv);
  const [name, ...rest] = positionals;
  if (name === "search") {
    const query = rest.join(" ").trim();
    if (query === "") throw new UsageError("search needs a query");
    return { kind: "search", query, limit: parseLimit(values.get("--limit")) };
  }
  if (name === "save") {
    const flags = parseSaveFlags(values);
    return { kind: "save", request: { ...flags, bullets: parseBullets(await deps.readStdin()) } };
  }
  throw new UsageError(name === undefined ? "missing subcommand" : `unknown subcommand ${name}`);
}

async function execute(
  command: Subcommand,
  root: string,
  config: ForgeConfig,
  deps: MemoryDeps,
): Promise<void> {
  const failureShape =
    command.kind === "search" ? { results: [] as MemoryResult[] } : { saved: false };
  const opened = await deps.openClient(root);
  if ("kind" in opened) {
    print({ available: false, reason: opened.reason });
    return;
  }
  try {
    const repo = await deps.repoName(root, config.repo.remote);
    if (command.kind === "search") {
      const results = await runSearch(
        opened,
        command.query,
        command.limit,
        `emet/${repo}/lessons/`,
      );
      print({ available: true, results });
    } else {
      const topicKey = await runSave(
        opened,
        command.request,
        repo,
        deps.now().toISOString().slice(0, 10),
      );
      print({ available: true, saved: true, topicKey });
    }
  } catch (error: unknown) {
    print({ available: true, ...failureShape, reason: errorMessage(error) });
  } finally {
    opened.close();
  }
}

/**
 * `emet memory search|save`. Bad usage exits 2; every Engram problem prints
 * `available:false` (before a handshake) or an empty/unsaved result (after one)
 * and exits 0, so a run report is never blocked by memory.
 */
export async function run(argv: string[], overrides: Partial<MemoryDeps> = {}): Promise<void> {
  const deps: MemoryDeps = { ...DEFAULT_DEPS, ...overrides };
  let command: Subcommand;
  try {
    command = await parseSubcommand(argv, deps);
  } catch (error: unknown) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`emet memory: ${error.message}\n${USAGE}`);
    process.exitCode = exitCodes.usage;
    return;
  }
  const root = await deps.resolveRepoRoot();
  if (root === null) {
    console.error("emet memory: not inside a git repository");
    process.exitCode = exitCodes.usage;
    return;
  }
  const config = await deps.loadConfig(root);
  if (resolveMemoryEnabled(config) === "off") {
    print({ available: false, reason: "memory.enabled is off" });
    return;
  }
  await execute(command, root, config, deps);
}

/**
 * Dev-only generator for the committed Codex artefacts. It reads the Claude
 * prompts (`commands/*.md`, `emet/reference/*.md`, `.claude-plugin/plugin.json`)
 * and writes `codex/skills/{run,init,doctor}/SKILL.md`,
 * `codex/skills/run/references/*.md`, `codex/hooks.json` and
 * `.codex-plugin/plugin.json`, replacing Claude-only tools with `emet` CLI
 * calls. Nothing under `commands/`, `agents/`, `hooks/`, `emet/` or
 * `.claude-plugin/` is written.
 *
 * `bun tools/build-codex.ts` writes the files; `--check` exits 1 when a
 * committed file differs from what the generator would write.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");

/** Substrings no generated prompt may contain. */
export const FORBIDDEN_TOKENS: readonly string[] = [
  "Agent(",
  "SendMessage",
  "TaskStop",
  "ToolSearch",
  "ScheduleWakeup",
  "EnterPlanMode",
  "ExitPlanMode",
  "subagent_type",
  "isolation:",
  "CLAUDE_PLUGIN_ROOT",
];

/** One generated file: its path relative to the repository root and its full text. */
export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

interface Rule {
  readonly pattern: RegExp;
  readonly replacement: string;
}

const SKILLS = ["run", "init", "doctor"] as const;

const COORDINATOR_MAILBOX =
  " `emet dispatch --wait` prints `question <ticket> <id>` instead of a result status while a live worker has an open " +
  "question: read `emet inbox --run <runId>`, answer with `emet reply --run <runId> --ticket <ticket> --id <n> --body <text>`, " +
  "then resume `emet dispatch --wait` for that ticket.";

const COORDINATOR_DISPATCH =
  "For each ticket, after its claim, slot and dispatch record exist, write the filled worker prompt to a file and start the worker with " +
  "`emet dispatch --role worker --run <runId> --ticket <ticket> --prompt-file <file> [--model <model>] [--effort <effort>]`; " +
  "start up to `concurrency.waveSize` of them in parallel, each as its own background shell command. The model is " +
  "`resolveWorkerModel(config, <ticket's Model: line>)`: the ticket's `Model:` wins, else the `codex` section's worker model; " +
  "pass it as `--model` (and `--effort` where the ticket sets one), otherwise `emet dispatch` resolves it itself. " +
  "`emet dispatch` creates the worktree, locks it, builds the run's Codex home and starts the worker. " +
  "Collect each result with `emet dispatch --wait --run <runId> --ticket <ticket> [--timeout <seconds>]`, which prints the recorded result status." +
  COORDINATOR_MAILBOX;

const WORKER_ESCALATION =
  "When you need a decision only the coordinator can make, ask it with (`<runId>` and `<ticket>` are the run id and your ticket id from this prompt) " +
  '`emet ask --run <runId> --ticket <ticket> --body "<question>"`, which prints `{"id":<n>}`. Then poll ' +
  "`emet ask --run <runId> --ticket <ticket> --wait <n>` until it exits 0 with the reply on stdout: exit 3 means " +
  "the slice elapsed with no reply yet, so run it again; exit 4 means the wait budget is spent, so write a BLOCKED " +
  "result with `emet results --write` and exit.";

const PLAN_GATE =
  "`$emet:run` has one approval, enforced by a hook: until `.emet/runs/spec<id>/approval.json` exists, the guard denies every " +
  "mutation except writes under `.emet/runs/**/draft/**`, so Phases 1–4 stay write-free by construction. The user approves " +
  "with a prompt line that is exactly `approve <id>`; the `UserPromptSubmit` hook records it by the same hashing as `emet approve`. " +
  "Running inside `/plan $emet:run` is the alternative: approve the plan there instead.";

/**
 * Ordered, whitespace-tolerant rewrites of Claude-only wording. A rule that
 * matches nothing is fine: the sources are free to change, and
 * {@link assertNoForbiddenTokens} is what fails when a Claude-only token
 * survives.
 */
const RULES: readonly Rule[] = [
  {
    pattern: /FEATURE: \$ARGUMENTS/g,
    replacement: "FEATURE: the text the user gave after `$emet:run`",
  },
  { pattern: /\$ARGUMENTS/g, replacement: "the user's arguments" },
  {
    pattern:
      /`\/emet:run` is designed to run inside plan mode[\s\S]*?keeping Phases 1–4 write-free\./,
    replacement: PLAN_GATE,
  },
  {
    pattern:
      /This only applies to the default and `--draft` modes\.[\s\S]*?nothing extra to detect\./,
    replacement:
      "This only applies to the default and `--draft` modes. `--dispatch` skips straight to Phase 6, which has no write-free zone and no approval step.",
  },
  {
    pattern: /Call `ExitPlanMode` to request approval\./,
    replacement:
      "Show the plan and ask the user to reply with `approve <id>` on its own line (or approve it under `/plan $emet:run`).",
  },
  {
    pattern: /Workers dispatch as `subagent_type[\s\S]*?ship with the plugin\./,
    replacement:
      "Workers dispatch with `emet dispatch --role worker` and Phase 8's review runs with `emet review-run`, using `references/reviewer-prompt.md`'s template; both resolve their model and effort from the `codex` section of `emet.config.json`.",
  },
  {
    pattern: /Launch up to `concurrency\.waveSize`[\s\S]*?makes the call fail\./,
    replacement: COORDINATOR_DISPATCH,
  },
  { pattern: /with\s+the\s+`Skill`\s+tool/g, replacement: "by invoking it as a skill" },
  { pattern: /calling\s+the\s+Skill\s+tool/g, replacement: "invoking the skill" },
  { pattern: /call\s+the\s+Skill\s+tool/g, replacement: "invoke the skill" },
  { pattern: /Call\s+the\s+Skill\s+tool/g, replacement: "Invoke the skill" },
  { pattern: /You're\s+already\s+a\s+subagent;/g, replacement: "You're already a worker;" },
  {
    pattern: /have\s+a\s+fresh-context\s+subagent\s+look\s+it\s+up/g,
    replacement: "look it up yourself with a read-only search",
  },
  { pattern: /inside\s+plan\s+mode/g, replacement: "before the approval" },
  {
    pattern: /Just before each `Agent` call/g,
    replacement: "Just before each `emet dispatch` call",
  },
  {
    pattern: /Do \*\*not\*\* instruct workers to use `LSP`[\s\S]*?does\s+have `LSP`\./,
    replacement:
      "Do **not** instruct workers to use `LSP`: it is not available to a Codex worker. A worker that needs a real `findReferences` asks the coordinator with `emet ask`.",
  },
  {
    pattern: /The coordinator's own forks[\s\S]*?retry loop on `ListAgents`\./,
    replacement:
      "The coordinator spawns no agents either: it runs quick read-only lookups itself in the shell, and treats a worker whose JSONL has stopped growing as stalled (`emet usage --stalled`).",
  },
  {
    pattern:
      /If this coordinator's own turn needs to end while background work[\s\S]*?that started it\./,
    replacement:
      "If this coordinator's own turn needs to end while background work (a worker process, a backgrounded shell task) is still in flight, resume with `emet dispatch --wait` for the same run, never by re-invoking `$emet:run` from Phase 0.",
  },
  { pattern: /no `Agent`\s+calls, no forks/g, replacement: "no spawned agents, no forks" },
  {
    pattern: /Dispatch one `Agent\(\{subagent_type: "emet:emet-reviewer"\}\)`\s+built from/,
    replacement:
      "Run `emet review-run --run <runId> --ticket <ticket> --package <file> --tier <medium|high>` once, which builds the reviewer prompt from",
  },
  {
    pattern: /Fallback if `emet:emet-reviewer` is missing/,
    replacement: "Fallback if `emet review-run` is unavailable",
  },
  {
    pattern:
      /paste as the whole prompt of the Phase 8\s+`Agent\(\{subagent_type: "emet:emet-reviewer"\}\)` call\./,
    replacement: "`emet review-run` builds it for the Phase 8 review call.",
  },
  { pattern: /`Agent\(\{isolation:\s*"worktree"\}\)`/g, replacement: "`emet dispatch`" },
  { pattern: /`Agent\s+isolation:"worktree"`/g, replacement: "`emet dispatch`" },
  {
    pattern: /`subagent_type`\s+or\s+`isolation:\s*"worktree"`/g,
    replacement: "the way it is dispatched",
  },
  {
    pattern: /Do not call\s+`ToolSearch\("select:LSP"\)`/g,
    replacement: "Do not look for an LSP tool",
  },
  { pattern: /`ToolSearch\("select:LSP"\)`/g, replacement: "a tool search for LSP" },
  {
    pattern: /`SendMessage`\s+the coordinator/g,
    replacement: "ask the coordinator with `emet ask`",
  },
  {
    pattern: /own\s+—\s+no forks, not even for a quick read-only lookup\./,
    replacement: `own — no forks, not even for a quick read-only lookup.

${WORKER_ESCALATION}`,
  },
  { pattern: /`TaskStop`'d/g, replacement: "stopped" },
  {
    pattern: /with the `Skill` tool\s+\(or `Read` `\.claude\/skills\/<name>\/SKILL\.md`\)/g,
    replacement: "by name (`$<name>`)",
  },
  { pattern: /never a bare `claude --bg`/g, replacement: "never a bare `codex exec`" },
  {
    pattern: /runs `claude --bg --name[\s\S]*?emet-<spec-id>-w<n\+1>`\./,
    replacement:
      "starts a detached `codex exec` running `$emet:run --dispatch <spec-id>` and records its thread id, so `codex exec resume <id>` continues it. It prints one JSON line.",
  },
  { pattern: /`claude attach`\s+command/g, replacement: "`codex exec resume <id>` command" },
  { pattern: /a `claude --bg` session/g, replacement: "a detached `codex exec` session" },
  { pattern: /If Claude Code refuses/g, replacement: "If Codex refuses" },
  { pattern: /`Agent`\s+`model` parameter/g, replacement: "`emet dispatch --model` value" },
  {
    pattern: /Dispatch an `Agent` on `models\.triage`/g,
    replacement: "Run a read-only `codex exec` on `models.triage`",
  },
  { pattern: /passed it to `Agent`/g, replacement: "passed it to `emet dispatch`" },
  {
    pattern: /(a worker's|each worker's|each survivor's|survivor's) `Agent`/g,
    replacement: "$1 `emet dispatch`",
  },
  { pattern: /`Agent`\s+(call|of your)/g, replacement: "`emet dispatch` $1" },
  { pattern: /\.claude\/worktrees\//g, replacement: ".emet/worktrees/" },
  { pattern: /with the Bash tool/g, replacement: "in the shell" },
  { pattern: /plugin sessions/g, replacement: "Codex sessions" },
  { pattern: /\/emet:(run|init|doctor)/g, replacement: "$emet:$1" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}\/emet\/reference\//g, replacement: "references/" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}\//g, replacement: "" },
];

/**
 * Applies {@link RULES} to one Claude prompt.
 * @param text The Claude prompt text.
 * @returns The text with Claude-only tools replaced by `emet` CLI calls.
 */
export function transformPrompt(text: string): string {
  let result = text;
  for (const rule of RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

/**
 * Lists the {@link FORBIDDEN_TOKENS} a text still contains.
 * @param text A generated prompt.
 * @returns The forbidden substrings found, in token-list order.
 */
export function findForbiddenTokens(text: string): string[] {
  return FORBIDDEN_TOKENS.filter((token) => text.includes(token));
}

/**
 * Throws when a generated file still contains a Claude-only token.
 * @param file The generated file to check.
 */
export function assertNoForbiddenTokens(file: GeneratedFile): void {
  const found = findForbiddenTokens(file.content);
  if (found.length > 0) {
    throw new Error(`${file.path} still contains Claude-only tokens: ${found.join(", ")}`);
  }
}

/**
 * Splits a Claude command into its frontmatter `description` and body.
 * @param source The command file text.
 * @returns The description and the body after the frontmatter.
 */
export function splitCommand(source: string): { description: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  const description = match?.[1]
    ?.split("\n")
    .find((line) => line.startsWith("description:"))
    ?.slice("description:".length)
    .trim();
  if (match?.[2] === undefined || description === undefined || description === "") {
    throw new Error("command file has no frontmatter description");
  }
  return { description, body: match[2] };
}

/**
 * Builds one skill file from a Claude command.
 * @param name The skill name (`run`, `init` or `doctor`).
 * @param source The command file text.
 * @returns The `SKILL.md` text.
 */
export function buildSkill(name: string, source: string): string {
  const { description, body } = splitCommand(source);
  const quoted = JSON.stringify(transformPrompt(description));
  return `---\nname: ${name}\ndescription: ${quoted}\n---\n${transformPrompt(body)}`;
}

/**
 * One Codex command hook running `emet guard` for the Codex Agent host.
 * @param suffix Extra `emet guard` arguments, with a leading space.
 * @returns The hook entry.
 */
function guardHook(suffix: string): { type: "command"; command: string } {
  return { type: "command", command: `EMET_AGENT_HOST=codex emet guard${suffix}` };
}

/**
 * The Codex hooks file. Isolated because the hook schema and whether `emet`
 * resolves on the hook's PATH are unverified against a real Codex.
 * @returns The `hooks.json` text.
 */
export function buildHooks(): string {
  const hooks = {
    hooks: {
      PreToolUse: [{ matcher: "Bash|apply_patch", hooks: [guardHook("")] }],
      UserPromptSubmit: [{ hooks: [guardHook(" --event UserPromptSubmit")] }],
      Stop: [{ hooks: [guardHook(" --event Stop")] }],
    },
  };
  return `${JSON.stringify(hooks, null, 2)}\n`;
}

/**
 * Builds `.codex-plugin/plugin.json` from the Claude plugin manifest.
 * @param claudeManifestText The `.claude-plugin/plugin.json` text.
 * @returns The Codex plugin manifest text.
 */
export function buildPluginManifest(claudeManifestText: string): string {
  const manifest: unknown = JSON.parse(claudeManifestText);
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error(".claude-plugin/plugin.json is not an object");
  }
  const version: unknown = Object.getOwnPropertyDescriptor(manifest, "version")?.value;
  const description: unknown = Object.getOwnPropertyDescriptor(manifest, "description")?.value;
  const license: unknown = Object.getOwnPropertyDescriptor(manifest, "license")?.value;
  if (typeof version !== "string" || typeof description !== "string") {
    throw new Error(".claude-plugin/plugin.json needs a string version and description");
  }
  const codexManifest = {
    name: "emet",
    version,
    description,
    license: typeof license === "string" ? license : undefined,
    skills: "./codex/skills",
    hooks: "./codex/hooks.json",
    commands: [],
  };
  return `${JSON.stringify(codexManifest, null, 2)}\n`;
}

/**
 * Generates every Codex artefact from the Claude sources under a root.
 * @param root The repository root.
 * @returns The generated files, sorted by path.
 */
export function generateArtefacts(root: string = repoRoot): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const name of SKILLS) {
    const source = readFileSync(path.join(root, "commands", `${name}.md`), "utf8");
    files.push({ path: `codex/skills/${name}/SKILL.md`, content: buildSkill(name, source) });
  }
  const referenceDirectory = path.join(root, "emet", "reference");
  for (const entry of readdirSync(referenceDirectory)
    .filter((n) => n.endsWith(".md"))
    .toSorted()) {
    files.push({
      path: `codex/skills/run/references/${entry}`,
      content: transformPrompt(readFileSync(path.join(referenceDirectory, entry), "utf8")),
    });
  }
  files.push({ path: "codex/hooks.json", content: buildHooks() });
  files.push({
    path: ".codex-plugin/plugin.json",
    content: buildPluginManifest(
      readFileSync(path.join(root, ".claude-plugin", "plugin.json"), "utf8"),
    ),
  });
  for (const file of files.filter((candidate) => candidate.path.endsWith(".md"))) {
    assertNoForbiddenTokens(file);
  }
  return files.toSorted((a, b) => a.path.localeCompare(b.path));
}

/**
 * Lists generated files whose committed copy is missing or different.
 * @param files The generated files.
 * @param root The repository root holding the committed copies.
 * @returns The stale paths.
 */
export function findStaleFiles(files: readonly GeneratedFile[], root: string = repoRoot): string[] {
  return files
    .filter((file) => {
      const target = path.join(root, file.path);
      return !existsSync(target) || readFileSync(target, "utf8") !== file.content;
    })
    .map((file) => file.path);
}

/**
 * Writes generated files under a root.
 * @param files The generated files.
 * @param root The repository root to write into.
 */
export function writeArtefacts(files: readonly GeneratedFile[], root: string = repoRoot): void {
  for (const file of files) {
    const target = path.join(root, file.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}

if (import.meta.main) {
  const files = generateArtefacts();
  if (process.argv.includes("--check")) {
    const stale = findStaleFiles(files);
    if (stale.length > 0) {
      console.error(`stale Codex artefacts (run bun run build:codex):\n${stale.join("\n")}`);
      process.exit(1);
    }
  } else {
    writeArtefacts(files);
    console.log(`wrote ${files.length} Codex artefacts`);
  }
}

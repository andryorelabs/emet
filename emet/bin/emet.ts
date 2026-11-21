#!/usr/bin/env bun
/**
 * `emet` — the global CLI dispatcher for `/emet`'s repo-side machinery.
 *
 * Historically these were nine separate `scripts/forge-*.ts` files living
 * inside `andryore-dev`, invoked via `bun run forge:<name>` aliases in that
 * repo's own `package.json`. Extracted here so `/emet` can run in *any* git
 * repo, not just one with those scripts and aliases already installed — see
 * the README for the full rationale.
 *
 * Each subcommand module still reads its own arguments off `process.argv`
 * internally (unchanged from the original scripts) and now additionally
 * exports an async `run(argv: string[])` that stages `argv` onto
 * `process.argv` before delegating — see any module's own `run()` doc
 * comment (e.g. `../src/claims.ts`) for why that's safe here: this process
 * runs exactly one subcommand per invocation, so mutating the global once,
 * before any subcommand logic reads it, cannot race a sibling call.
 *
 * Exit codes are meaningful across every subcommand (a change from the
 * original per-repo scripts, which returned `1` for both "found problems"
 * and "crashed"): `0` clean, `1` findings to act on, `2` config/usage error
 * (the tool never actually ran), `3` internal error.
 */

import path from "node:path";
import { format } from "node:util";

import { EMET_VERSION } from "../src/assets";
import {
  COMMANDS_WITH_BANNER,
  COMMANDS_WITH_OWN_HELP,
  commandHelp,
  findCommand,
  outcomeCode,
  type CommandSpec,
} from "../src/commands";
import { failureEnvelope, stringifySorted, successEnvelope, type Envelope } from "../src/envelope";
import { exitCodeFor } from "../src/errors";
import { currentExitCode } from "../src/exit-code";
import { exitCodes } from "../src/exit-codes";
import { parseGlobalFlags, unknownFlags, type GlobalFlags } from "../src/flags";
import { stateDir } from "../src/names";
import { updateNotice } from "../src/update-notice";

const USAGE = `usage: emet <command> [...args]

commands:
  migrate   [--dry-run]  — rename a legacy repo to the emet names
  init      [--tracker linear|github|local] [--force]
  doctor    [--all] [<path> ...]  — read-only fleet sweep, defaults to cwd
  preflight [--run <id>] [--post-dispatch]
  skill-path <name>  — print the absolute SKILL.md path of a mattpocock-skills skill
  claims    --reserve <ticket> --run <id> --anchor <pid> | --release <ticket> | --list | --prune [--dry-run]
  slots     --acquire --run <id> --anchor <pid> --ticket <ticket> | --release --run <id> | --release-index <index> | --list
  land      --spec <s> --branch <integration> --tickets <id,...>  — merge an integration branch into local trunk (landing.mode merge)
  spec-branch  ensure|integrate|status|sync|land|abandon --spec <id>  — the spec branch that collects every integrated wave (landing.unit spec)
  cleanup   [--run <id> | --all] [--dry-run] [--force]  — bare: reclaim closed or dead runs whose work landed; --run: this run; --all: repo-wide branch sweep
  usage     [--session <id> | --file <path>] [--stalled [--minutes N]] [--project-dir <path>]
  handoff   --check <path> | --render <path>
  launch    <spec-id> --wave <n>  — start a wave as a detached session (\`claude --bg\` on Claude Code, \`codex exec\` on Codex) and open its Orca tab per handoff.launcher
  lock-reason --run <id> --ticket <ticket> [--anchor <pid>]  — the \`git worktree lock\` reason a worker writes at bootstrap
  assess    --base <ref> --head <ref>  — classify a diff as passive|medium|high and pick the reviewer model
  status    [--spec <id>]  — Working / Checking / Ready / Needs-decision per wave as JSON + a summary line (\`emet status --help\` documents the JSON)
  surfaces  --check <file.json | ->  — reject overlapping allowed-surface globs between a wave's tickets
  verify    <ticket>  — post-worker enforcement check
  review-package <base> <head>  — review range package
  review    --ticket <ticket> [--round <n>]
  dispatch  --role worker --run <id> --ticket <id> --prompt-file <f> [--wait]  — start a Codex worker (Codex host)
  review-run --package <dir> --tier <tier>  — run a Codex review (Codex host)
  ask       --run <id> --ticket <ticket> (--body <text> | --wait <n> [--slice <seconds>])  — worker mailbox: ask the coordinator, or wait for the reply (exit 0 reply, 3 slice timeout, 4 expired)
  inbox     --run <id>  — open worker questions as JSON
  reply     --run <id> --ticket <ticket> --id <n> --body <text>  — answer a worker question
  approve   --run <id>
  results   --run <id> [--ticket <ticket>]
  materialize-log --run <id> [--ticket <ticket> --id <tracker-id>]
  gate      <ticket> [--run <id>]  — merge|hold|chain|stop decision as JSON
  validate  --spec <id> | --file <path>
  spec-merge --spec <id> [--deltas-dir]
  tracker   create-spec|create-ticket|read|frontier|set-state|comment|close  — local tracker over .scratch/ (JSON on stdout)
  map       [--refresh]
  metrics   [--run <id>]
  ci        [--pr <n>] [--wait] [--rerun-flakes]  — wait for a PR's checks and rerun flakes
  chain     --spec <s> --wave <n>  — gate a wave and launch the next one
  insights  [--since <t>] [--repo <r>] [--all] [--json]  — report on the journal: runs by origin, gate decisions, interventions, launches
  run       current  — run subcommands; \`current\` prints the active run
  promote   --spec <s> [--dry-run]  — promote develop to main after a spec lands
  deploy-check  — run the configured post-deploy check
  fleet     list|set|launch  — list, set and launch across repos
  setup     [--yes] [--with <items>] [--list]  — install the optional extras
  whats-new [--hook]  — print a one-time notice after emet updates
  guard     — Claude Code PreToolUse hook (reads hook JSON on stdin); see src/guard.ts
  selftest  — run this CLI's own unit tests (source installs only)
  --version — print the emet version
`;

/** What a command run left behind: its exit code and, under `--json`, the stdout it printed. */
interface CommandOutcome {
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * Writes the brand banner to stdout. Skipped when the invocation asks for
 * machine-readable output with `--json`.
 */
async function printBanner(json: boolean): Promise<void> {
  if (json) return;
  const { renderBanner } = await import("../src/banner");
  process.stdout.write(renderBanner(process.stdout, process.env));
}

function emitEnvelope(envelope: Envelope): void {
  process.stdout.write(`${stringifySorted(envelope)}\n`);
}

function parseCaptured(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

/**
 * Runs `body` with stdout captured and returns what it printed. Stdout is
 * restored before this returns or throws, so the caller can print the envelope.
 */
async function withCapturedStdout(body: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalLog = console.log;
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  console.log = (...parts: unknown[]): void => {
    chunks.push(`${format(...parts)}\n`);
  };
  try {
    await body();
  } finally {
    process.stdout.write = originalWrite;
    console.log = originalLog;
  }
  return chunks.join("");
}

async function runCommand(
  spec: CommandSpec,
  commandArgs: string[],
  json: boolean,
): Promise<CommandOutcome> {
  let returned: number | undefined;
  const execute = async (): Promise<void> => {
    const result = await spec.run(commandArgs);
    returned = typeof result === "number" ? result : undefined;
  };
  let stdout = "";
  if (json) stdout = await withCapturedStdout(execute);
  else await execute();
  return { exitCode: typeof returned === "number" ? returned : currentExitCode(), stdout };
}

function reportOutcome(spec: CommandSpec, outcome: CommandOutcome): void {
  process.exitCode = outcome.exitCode;
  const data = parseCaptured(outcome.stdout);
  if (outcome.exitCode === exitCodes.success) {
    emitEnvelope(successEnvelope(data));
    return;
  }
  emitEnvelope({
    ok: false,
    data,
    error: {
      code: outcomeCode(spec.name, outcome.exitCode),
      message: `emet ${spec.name} exited with code ${outcome.exitCode}`,
      fix: "Re-run without --json to read the full output.",
    },
  });
}

function reportUsageError(json: boolean, message: string, fix: string, plain: string): void {
  process.exitCode = exitCodes.usage;
  if (json) emitEnvelope({ ok: false, data: null, error: { code: "usage", message, fix } });
  else console.error(plain);
}

async function printUpdateNotice(json: boolean): Promise<void> {
  const notice = await updateNotice({
    current: EMET_VERSION,
    isTTY: process.stderr.isTTY,
    json,
    now: new Date(),
    cacheFile: path.join(stateDir(), "update-check.json"),
  });
  if (notice !== null) console.error(notice);
}

/** Handles the invocations that name no command; true when it fully handled `head`. */
async function handleTopLevel(head: string | undefined, flags: GlobalFlags): Promise<boolean> {
  if (head === undefined) {
    await printBanner(flags.json);
    reportUsageError(flags.json, "no command given", "Run `emet --help`.", USAGE);
    return true;
  }
  if (head === "--version" || head === "-v") {
    if (flags.json) emitEnvelope(successEnvelope({ version: EMET_VERSION }));
    else console.log(EMET_VERSION);
    return true;
  }
  if (head === "--help" || head === "-h" || head === "help") {
    await printBanner(flags.json);
    if (flags.json) emitEnvelope(successEnvelope({ usage: USAGE }));
    else console.log(USAGE);
    return true;
  }
  return false;
}

async function runHelp(spec: CommandSpec, commandArgs: string[], json: boolean): Promise<void> {
  if (COMMANDS_WITH_OWN_HELP.has(spec.name) && !json) {
    const outcome = await runCommand(spec, commandArgs, false);
    process.exitCode = outcome.exitCode;
    return;
  }
  const help = commandHelp(spec);
  if (json) emitEnvelope(successEnvelope({ usage: help }));
  else process.stdout.write(help);
}

async function main(): Promise<void> {
  const { flags, rest } = parseGlobalFlags(process.argv.slice(2));
  if (flags.noColor) process.env.NO_COLOR = "1";
  const head = rest.find((token) => token !== "--json");

  if (await handleTopLevel(head, flags)) return;
  const spec = head === undefined ? undefined : findCommand(head);
  if (head === undefined || spec === undefined) {
    reportUsageError(
      flags.json,
      `unknown command "${head}"`,
      "Run `emet --help`.",
      `emet: unknown command "${head}"\n\n${USAGE}`,
    );
    return;
  }

  const headIndex = rest.indexOf(head);
  const acceptsJson = spec.flags.some((flag) => flag.name === "--json");
  const commandArgs = rest.filter(
    (token, index) => index !== headIndex && (token !== "--json" || acceptsJson),
  );

  if (flags.help) {
    await runHelp(spec, commandArgs, flags.json);
    return;
  }

  const unknown = unknownFlags(spec, commandArgs);
  if (unknown.length > 0) {
    const named = unknown.join(", ");
    const fix = `Run \`emet ${spec.name} --help\` for the accepted flags.`;
    reportUsageError(
      flags.json,
      `unknown flag ${named}`,
      fix,
      `emet ${spec.name}: unknown flag ${named}\n${fix}`,
    );
    return;
  }

  if (COMMANDS_WITH_BANNER.has(spec.name)) await printBanner(flags.json);
  const outcome = await runCommand(spec, commandArgs, flags.json);
  if (flags.json) reportOutcome(spec, outcome);
  else process.exitCode = outcome.exitCode;
  if (spec.name !== "guard") await printUpdateNotice(flags.json);
}

process.once("SIGINT", () => {
  process.exit(exitCodes.interrupted);
});

try {
  await main();
} catch (error: unknown) {
  const { flags } = parseGlobalFlags(process.argv.slice(2));
  process.exitCode = exitCodeFor(error);
  if (flags.json) {
    emitEnvelope(failureEnvelope(error));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`emet: ${message}`);
    if (flags.verbose && error instanceof Error && error.stack !== undefined) {
      console.error(error.stack);
    }
  }
}

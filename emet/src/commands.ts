import { commandOutcomes, exitCodes } from "./exit-codes";

/** One flag a command accepts; `value` is true when the next token is its value. */
export interface FlagSpec {
  name: string;
  value: boolean;
}

/** One CLI command: its name, one-line summary, accepted flags and entry point. */
export interface CommandSpec {
  name: string;
  summary: string;
  flags: readonly FlagSpec[];
  // oxlint-disable-next-line typescript/no-invalid-void-type -- the ticket contract types a command as returning an exit code or nothing
  run: (argv: string[]) => Promise<number | void>;
}

const bool = (name: string): FlagSpec => ({ name, value: false });
const val = (name: string): FlagSpec => ({ name, value: true });

/** Commands whose module prints its own `--help`, kept so that output stays byte-identical. */
export const COMMANDS_WITH_OWN_HELP: ReadonlySet<string> = new Set([
  "launch",
  "lock-reason",
  "dispatch",
  "land",
  "map",
  "status",
]);

/** Commands that print the brand banner before running. */
export const COMMANDS_WITH_BANNER: ReadonlySet<string> = new Set(["init", "doctor"]);

async function runSelftest(): Promise<number> {
  const { isCompiledBinary } = await import("./assets");
  if (isCompiledBinary()) {
    console.error("selftest needs a source install; run emet doctor");
    return exitCodes.findings;
  }
  const cliRoot = new URL("..", import.meta.url).pathname;
  const tsconfigPath = new URL("../tsconfig.json", import.meta.url).pathname;
  const bunfigPath = new URL("../bunfig.toml", import.meta.url).pathname;
  const testRoot = new URL("../src", import.meta.url).pathname;

  /**
   * `tsc --noEmit` first: this CLI's own tsconfig sets `strict: true`, and a
   * type error no runtime test catches is what made claims.ts and slots.ts
   * require going through this dispatcher. `bunx` resolves to the
   * `typescript` devDependency `bun install` puts in this tree's node_modules.
   */
  const typecheck = Bun.spawn(["bunx", "tsc", "--noEmit", "-p", tsconfigPath], {
    cwd: cliRoot,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const typecheckExitCode = await typecheck.exited;

  const test = Bun.spawn(["bun", "test", "--config", bunfigPath, testRoot], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  const testExitCode = await test.exited;
  return typecheckExitCode !== 0 ? typecheckExitCode : testExitCode;
}

async function runSkillPath(argv: string[]): Promise<number> {
  const skillName = argv[0];
  if (skillName === undefined) {
    console.error("usage: emet skill-path <name>");
    return exitCodes.usage;
  }
  const { resolveSkillPath } = await import("./skills");
  const skillPath = resolveSkillPath(skillName);
  if (skillPath === null) {
    console.error(`skill not found: ${skillName}`);
    return exitCodes.findings;
  }
  console.log(skillPath);
  return exitCodes.success;
}

type ModuleName =
  | "migrate"
  | "init"
  | "doctor"
  | "preflight"
  | "claims"
  | "slots"
  | "land"
  | "cleanup"
  | "usage"
  | "handoff"
  | "launch"
  | "lockreason"
  | "assess"
  | "status"
  | "surfaces"
  | "verify"
  | "reviewpackage"
  | "review"
  | "dispatch"
  | "review-run"
  | "approve"
  | "results"
  | "materializelog"
  | "gate"
  | "validate"
  | "specmerge"
  | "tracker"
  | "ci"
  | "chain"
  | "map"
  | "metrics"
  | "insights"
  | "runcurrent"
  | "promote"
  | "deploycheck"
  | "fleet"
  | "setup"
  | "whatsnew";

type ModuleRun = CommandSpec["run"];

/** Imports a command module lazily, so a command only loads the code it runs. */
async function loadRun(name: ModuleName): Promise<ModuleRun> {
  switch (name) {
    case "migrate": {
      const { run } = await import("./migrate");
      return (argv) => {
        run(argv);
        return Promise.resolve();
      };
    }
    case "init":
      return (await import("./init")).run;
    case "doctor":
      return (await import("./doctor")).run;
    case "preflight":
      return (await import("./preflight")).run;
    case "claims":
      return (await import("./claims")).run;
    case "slots":
      return (await import("./slots")).run;
    case "land":
      return (await import("./land")).run;
    case "cleanup":
      return (await import("./cleanup")).run;
    case "usage":
      return (await import("./usage")).run;
    case "handoff":
      return (await import("./handoff")).run;
    case "launch":
      return (await import("./launch")).run;
    case "lockreason":
      return (await import("./lockreason")).run;
    case "assess":
      return (await import("./assess")).run;
    case "status":
      return (await import("./status")).run;
    case "surfaces":
      return (await import("./surfaces")).run;
    case "verify":
      return (await import("./verify")).run;
    case "reviewpackage":
      return (await import("./reviewpackage")).run;
    case "review":
      return (await import("./review")).run;
    case "dispatch":
      return (await import("./dispatch")).run;
    case "review-run":
      return (await import("./review-run")).run;
    case "approve":
      return (await import("./approve")).run;
    case "results":
      return (await import("./results")).run;
    case "materializelog":
      return (await import("./materializelog")).run;
    case "gate":
      return (await import("./gate")).run;
    case "validate":
      return (await import("./validate")).run;
    case "specmerge":
      return (await import("./specmerge")).run;
    case "tracker":
      return (await import("./tracker")).run;
    case "ci":
      return (await import("./ci")).run;
    case "chain":
      return (await import("./chain")).run;
    case "map":
      return (await import("./map")).run;
    case "metrics":
      return (await import("./metrics")).run;
    case "insights":
      return (await import("./insights")).run;
    case "runcurrent":
      return (await import("./runcurrent")).run;
    case "promote":
      return (await import("./promote")).run;
    case "deploycheck":
      return (await import("./deploycheck")).run;
    case "fleet":
      return (await import("./fleet")).run;
    case "setup":
      return (await import("./setup")).run;
    case "whatsnew":
      return (await import("./whats-new")).run;
  }
  throw new Error(`unknown command module "${String(name)}"`);
}

function runModule(name: ModuleName): CommandSpec["run"] {
  return async (argv) => (await loadRun(name))(argv);
}

function runMailbox(name: "ask" | "inbox" | "reply"): CommandSpec["run"] {
  return async (argv) => {
    const { run } = await import("./mailbox");
    await run(name, argv);
  };
}

async function runGuard(): Promise<void> {
  const { run } = await import("./guard");
  await run();
}

/** Every `emet` command, with the flags its parser reads. */
export const COMMANDS: readonly CommandSpec[] = [
  {
    name: "migrate",
    summary: "rename a legacy repo to the emet names",
    flags: [bool("--dry-run")],
    run: runModule("migrate"),
  },
  {
    name: "init",
    summary: "write emet.config.json and the docs/agents files for this repo",
    flags: [val("--tracker"), val("--after-spec"), bool("--force")],
    run: runModule("init"),
  },
  {
    name: "doctor",
    summary: "read-only fleet sweep, defaults to the current directory",
    flags: [bool("--all")],
    run: runModule("doctor"),
  },
  {
    name: "preflight",
    summary: "confirm the repo is dispatch-ready",
    flags: [val("--run"), val("--expect"), val("--approval"), bool("--post-dispatch")],
    run: runModule("preflight"),
  },
  {
    name: "skill-path",
    summary: "print the absolute SKILL.md path of a mattpocock-skills skill",
    flags: [],
    run: runSkillPath,
  },
  {
    name: "claims",
    summary: "reserve, release, list or prune ticket claims",
    flags: [
      val("--reserve"),
      val("--release"),
      val("--run"),
      val("--anchor"),
      val("--surfaces"),
      bool("--list"),
      bool("--prune"),
      bool("--dry-run"),
      bool("--force"),
    ],
    run: runModule("claims"),
  },
  {
    name: "slots",
    summary: "acquire, release or list worker slots",
    flags: [
      bool("--acquire"),
      bool("--release"),
      bool("--list"),
      bool("--force"),
      val("--release-index"),
      val("--run"),
      val("--anchor"),
      val("--ticket"),
    ],
    run: runModule("slots"),
  },
  {
    name: "land",
    summary: "merge an integration branch into local trunk (landing.mode merge)",
    flags: [
      val("--spec"),
      val("--branch"),
      val("--tickets"),
      val("--wave"),
      val("--summary"),
      val("--type"),
    ],
    run: runModule("land"),
  },
  {
    name: "cleanup",
    summary: "reclaim closed or dead runs whose work landed",
    flags: [val("--run"), bool("--all"), bool("--dry-run"), bool("--force")],
    run: runModule("cleanup"),
  },
  {
    name: "usage",
    summary: "report session token usage or find stalled workers",
    flags: [
      val("--session"),
      val("--file"),
      val("--run"),
      val("--minutes"),
      val("--tool-minutes"),
      val("--project-dir"),
      bool("--stalled"),
      bool("--nudge"),
    ],
    run: runModule("usage"),
  },
  {
    name: "handoff",
    summary: "check or render a worker handoff note",
    flags: [val("--check"), val("--render"), val("--expect-skills")],
    run: runModule("handoff"),
  },
  {
    name: "launch",
    summary: "start a wave as a detached session and open its Orca tab",
    flags: [val("--wave")],
    run: runModule("launch"),
  },
  {
    name: "lock-reason",
    summary: "print the git worktree lock reason a worker writes at bootstrap",
    flags: [val("--run"), val("--ticket"), val("--anchor")],
    run: runModule("lockreason"),
  },
  {
    name: "assess",
    summary: "classify a diff as passive, medium or high and pick the reviewer model",
    flags: [val("--base"), val("--head"), val("--risk-line")],
    run: runModule("assess"),
  },
  {
    name: "status",
    summary: "per-wave Working, Checking, Ready or Needs-decision as JSON plus a summary line",
    flags: [val("--spec"), bool("--brief")],
    run: runModule("status"),
  },
  {
    name: "surfaces",
    summary: "reject overlapping allowed-surface globs between a wave's tickets",
    flags: [val("--check")],
    run: runModule("surfaces"),
  },
  {
    name: "verify",
    summary: "post-worker enforcement check",
    flags: [val("--run"), val("--worktree")],
    run: runModule("verify"),
  },
  {
    name: "review-package",
    summary: "build the review package for a commit range",
    flags: [val("--out")],
    run: runModule("reviewpackage"),
  },
  {
    name: "review",
    summary: "record review findings, rulings and escalations for a ticket",
    flags: [
      val("--ticket"),
      val("--round"),
      val("--changed"),
      val("--findings"),
      val("--model"),
      val("--rule"),
      val("--why"),
      val("--cost"),
      val("--verdicts"),
      bool("--rulings"),
      bool("--escalate"),
      bool("--recheck"),
    ],
    run: runModule("review"),
  },
  {
    name: "dispatch",
    summary: "start a Codex worker (Codex host)",
    flags: [
      val("--role"),
      val("--run"),
      val("--ticket"),
      val("--prompt-file"),
      val("--root"),
      val("--model"),
      val("--effort"),
      val("--timeout"),
      bool("--wait"),
    ],
    run: runModule("dispatch"),
  },
  {
    name: "review-run",
    summary: "run a Codex review (Codex host)",
    flags: [val("--run"), val("--ticket"), val("--package"), val("--tier")],
    run: runModule("review-run"),
  },
  {
    name: "ask",
    summary: "worker mailbox: ask the coordinator, or wait for the reply",
    flags: [val("--run"), val("--ticket"), val("--body"), val("--wait"), val("--slice")],
    run: runMailbox("ask"),
  },
  {
    name: "inbox",
    summary: "open worker questions as JSON",
    flags: [val("--run")],
    run: runMailbox("inbox"),
  },
  {
    name: "reply",
    summary: "answer a worker question",
    flags: [val("--run"), val("--ticket"), val("--id"), val("--body")],
    run: runMailbox("reply"),
  },
  {
    name: "approve",
    summary: "record or check the one approval for a run",
    flags: [val("--run"), val("--root"), val("--spec"), val("--tickets"), bool("--check")],
    run: runModule("approve"),
  },
  {
    name: "results",
    summary: "write or read a worker's result file",
    flags: [
      val("--run"),
      val("--root"),
      val("--write"),
      val("--read"),
      val("--status"),
      val("--report"),
      val("--risk"),
    ],
    run: runModule("results"),
  },
  {
    name: "materialize-log",
    summary: "record or look up the local-to-tracker ticket id map",
    flags: [val("--run"), val("--root"), val("--record"), val("--lookup")],
    run: runModule("materializelog"),
  },
  {
    name: "gate",
    summary: "merge, hold, chain or stop decision as JSON",
    flags: [
      val("--run"),
      val("--tier"),
      val("--env-exit"),
      val("--env-output"),
      val("--attempts"),
      val("--ci"),
      val("--integration"),
      val("--waves-remaining"),
      bool("--no-record"),
    ],
    run: runModule("gate"),
  },
  {
    name: "validate",
    summary: "validate a spec's requirements against its tickets",
    flags: [val("--spec"), val("--file"), val("--tickets")],
    run: runModule("validate"),
  },
  {
    name: "spec-merge",
    summary: "merge a spec's ticket records",
    flags: [val("--spec"), val("--root")],
    run: runModule("specmerge"),
  },
  {
    name: "tracker",
    summary: "local tracker over .scratch/ (JSON on stdout)",
    flags: [
      val("--slug"),
      val("--title"),
      val("--spec"),
      val("--author"),
      val("--blocked-by"),
      val("--body-file"),
      val("--pr"),
      val("--reason"),
      bool("--canceled"),
    ],
    run: runModule("tracker"),
  },
  {
    name: "ci",
    summary: "wait for a PR's checks and rerun flakes",
    flags: [
      val("--pr"),
      val("--timeout-minutes"),
      val("--poll-seconds"),
      bool("--wait"),
      bool("--rerun-flakes"),
    ],
    run: runModule("ci"),
  },
  {
    name: "chain",
    summary: "gate a wave and launch the next one",
    flags: [
      val("--spec"),
      val("--wave"),
      val("--run"),
      val("--ticket"),
      val("--tier"),
      val("--ci"),
      val("--integration"),
      val("--env-exit"),
      val("--env-output"),
      val("--attempts"),
      val("--waves-remaining"),
    ],
    run: runModule("chain"),
  },
  {
    name: "map",
    summary: "codebase map for a set of globs",
    flags: [val("--for"), val("--max"), bool("--refresh"), bool("--stale")],
    run: runModule("map"),
  },
  {
    name: "metrics",
    summary: "token and cost metrics for a run",
    flags: [val("--run"), val("--root"), bool("--json")],
    run: runModule("metrics"),
  },
  {
    name: "insights",
    summary: "report on the journal: runs by origin, gate decisions, interventions, launches",
    flags: [val("--since"), val("--repo"), bool("--json"), bool("--all"), bool("--mark-baseline")],
    run: runModule("insights"),
  },
  {
    name: "run",
    summary: "run subcommands; `current` prints the active run",
    flags: [bool("--json")],
    run: runModule("runcurrent"),
  },
  {
    name: "promote",
    summary: "promote develop to main after a spec lands",
    flags: [val("--spec"), bool("--dry-run"), bool("--no-promote"), bool("--hold")],
    run: runModule("promote"),
  },
  {
    name: "deploy-check",
    summary: "run the configured post-deploy check",
    flags: [],
    run: runModule("deploycheck"),
  },
  {
    name: "fleet",
    summary: "list, set and launch across repos (list|set|launch)",
    flags: [val("--root"), val("--repos"), val("--feature"), bool("--dry-run"), bool("--json")],
    run: runModule("fleet"),
  },
  {
    name: "setup",
    summary: "install the optional extras",
    flags: [
      bool("--yes"),
      val("--with"),
      bool("--list"),
      bool("--notice"),
      val("--data-dir"),
      bool("--json"),
    ],
    run: runModule("setup"),
  },
  {
    name: "whats-new",
    summary: "print a one-time notice after emet updates",
    flags: [bool("--hook"), val("--data-dir")],
    run: runModule("whatsnew"),
  },
  {
    name: "guard",
    summary: "Claude Code PreToolUse hook (reads hook JSON on stdin)",
    flags: [val("--event"), val("--mark-final-report")],
    run: runGuard,
  },
  {
    name: "selftest",
    summary: "run this CLI's own unit tests (source installs only)",
    flags: [],
    run: runSelftest,
  },
];

/** The registry entry for `name`, or undefined. */
export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/** The error code a failing exit code maps to under `--json`. */
export function outcomeCode(commandName: string, exitCode: number): string {
  if (commandName === "ask" && exitCode === commandOutcomes.ask.sliceTimeout) {
    return "slice-timeout";
  }
  if (commandName === "ask" && exitCode === commandOutcomes.ask.expired) return "expired";
  if (commandName === "review-package" && exitCode === commandOutcomes["review-package"].badRange) {
    return "bad-range";
  }
  if (exitCode === exitCodes.findings) return "findings";
  if (exitCode === exitCodes.usage) return "usage";
  if (exitCode === exitCodes.internal) return "internal";
  return `exit-${exitCode}`;
}

/** The generated `--help` text for a command. */
export function commandHelp(spec: CommandSpec): string {
  const flagLines = spec.flags.map((flag) => `  ${flag.name}${flag.value ? " <value>" : ""}`);
  return [
    `usage: emet ${spec.name} [flags]`,
    "",
    spec.summary,
    "",
    "flags:",
    ...flagLines,
    "  --json       print one envelope on stdout",
    "  --no-color   disable ANSI color",
    "  --verbose    print stacks on errors",
    "  --help       print this help",
    "",
  ].join("\n");
}

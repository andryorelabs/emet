import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { COMMANDS, commandHelp, findCommand, outcomeCode, type FlagSpec } from "./commands";

describe("COMMANDS", () => {
  test("names are unique and every command has a summary", () => {
    const names = COMMANDS.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
    for (const command of COMMANDS) expect(command.summary.length).toBeGreaterThan(0);
  });

  test("flag names start with a dash and are unique per command", () => {
    for (const command of COMMANDS) {
      const names = command.flags.map((flag: FlagSpec) => flag.name);
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) expect(name.startsWith("-")).toBe(true);
    }
  });

  test("findCommand resolves a known name and rejects an unknown one", () => {
    expect(findCommand("claims")?.name).toBe("claims");
    expect(findCommand("nope")).toBeUndefined();
  });

  test("claims and slots declare --release with their own arity", () => {
    expect(findCommand("claims")?.flags).toContainEqual({ name: "--release", value: true });
    expect(findCommand("slots")?.flags).toContainEqual({ name: "--release", value: false });
  });
});

describe("journal commands", () => {
  test("insights declares its flags", () => {
    const flags = findCommand("insights")?.flags ?? [];
    expect(flags).toContainEqual({ name: "--since", value: true });
    expect(flags).toContainEqual({ name: "--repo", value: true });
    expect(flags).toContainEqual({ name: "--json", value: false });
    expect(flags).toContainEqual({ name: "--all", value: false });
    expect(flags).toContainEqual({ name: "--mark-baseline", value: false });
  });

  test("run declares --json and status declares --brief", () => {
    expect(findCommand("run")?.flags).toContainEqual({ name: "--json", value: false });
    expect(findCommand("status")?.flags).toContainEqual({ name: "--brief", value: false });
  });
});

describe("outcomeCode", () => {
  test("maps documented per-command outcomes", () => {
    expect(outcomeCode("ask", 3)).toBe("slice-timeout");
    expect(outcomeCode("ask", 4)).toBe("expired");
    expect(outcomeCode("review-package", 3)).toBe("bad-range");
  });

  test("maps the shared exit codes", () => {
    expect(outcomeCode("status", 1)).toBe("findings");
    expect(outcomeCode("status", 2)).toBe("usage");
    expect(outcomeCode("status", 3)).toBe("internal");
    expect(outcomeCode("status", 9)).toBe("exit-9");
  });
});

const flagNames = (name: string): string[] =>
  findCommand(name)?.flags.map((flag) => flag.name) ?? [];

describe("ci, chain and the new flags", () => {
  test("registers ci and chain with their flags", () => {
    for (const flag of ["--pr", "--wait", "--rerun-flakes", "--timeout-minutes"]) {
      expect(flagNames("ci")).toContain(flag);
    }
    for (const flag of ["--spec", "--wave", "--ci", "--waves-remaining"]) {
      expect(flagNames("chain")).toContain(flag);
    }
  });

  test("review takes --recheck and tracker takes --pr and --reason", () => {
    expect(flagNames("review")).toContain("--recheck");
    expect(flagNames("tracker")).toContain("--pr");
    expect(flagNames("tracker")).toContain("--reason");
  });
});

describe("commandHelp", () => {
  test("lists the command flags and the global flags", () => {
    const spec = findCommand("handoff");
    if (spec === undefined) throw new Error("handoff is not registered");
    const help = commandHelp(spec);
    expect(help).toContain("usage: emet handoff");
    expect(help).toContain("--check <value>");
    expect(help).toContain("--json");
  });
});

const SAFE_TO_RUN_BARE = [
  "skill-path",
  "handoff",
  "launch",
  "lock-reason",
  "assess",
  "surfaces",
  "verify",
  "review-package",
  "review-run",
  "dispatch",
  "results",
  "materialize-log",
  "gate",
  "validate",
  "spec-merge",
  "approve",
  "review",
];

describe("command entry points", () => {
  let workingDirectory: string;
  const originalCwd = process.cwd();
  const originalArgv = [...process.argv];
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    workingDirectory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-commands-")));
    process.chdir(workingDirectory);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.argv = originalArgv;
    process.exitCode = originalExitCode ?? 0;
    rmSync(workingDirectory, { recursive: true, force: true });
  });

  test("a bare run of an argument-checking command reaches its module and settles", async () => {
    const quiet = [
      spyOn(console, "log").mockImplementation(() => undefined),
      spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      for (const name of SAFE_TO_RUN_BARE) {
        const command = findCommand(name);
        if (command === undefined) throw new Error(`${name} is not registered`);
        // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: each run mutates process-wide state
        await command.run([]).catch(() => undefined);
      }
    } finally {
      for (const spy of quiet) spy.mockRestore();
    }
  });
});

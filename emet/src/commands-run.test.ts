import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import * as assets from "./assets";
import { COMMANDS, findCommand } from "./commands";
import { exitCodes } from "./exit-codes";
import * as guard from "./guard";
import * as mailbox from "./mailbox";
import * as skills from "./skills";

function requireCommand(name: string): (argv: string[]) => Promise<unknown> {
  const spec = findCommand(name);
  if (spec === undefined) throw new Error(`no command named ${name}`);
  return spec.run;
}

interface SpawnStub {
  calls: string[][];
  restore: () => void;
}

function stubSpawn(exitCodesInOrder: number[]): SpawnStub {
  const calls: string[][] = [];
  const queue = [...exitCodesInOrder];
  const fakeSpawn = (command: string[]): unknown => {
    calls.push(command);
    return { exited: Promise.resolve(queue.shift() ?? 0) };
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a minimal Subprocess stand-in
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(fakeSpawn as typeof Bun.spawn);
  return {
    calls,
    restore: () => {
      spawnSpy.mockRestore();
    },
  };
}

let workDirectory: string;
let originalCwd: string;
let originalExitCode: typeof process.exitCode;

beforeEach(() => {
  originalCwd = process.cwd();
  originalExitCode = process.exitCode;
  workDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-commands-run-"));
  process.chdir(workDirectory);
});

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = originalExitCode ?? 0;
  rmSync(workDirectory, { recursive: true, force: true });
});

describe("runSkillPath", () => {
  test("without a name it prints usage and returns the usage code", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await requireCommand("skill-path")([])).toBe(exitCodes.usage);
      expect(errorSpy).toHaveBeenCalledWith("usage: emet skill-path <name>");
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("an unresolved skill returns the findings code", async () => {
    const resolveSpy = spyOn(skills, "resolveSkillPath").mockReturnValue(null);
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await requireCommand("skill-path")(["tdd"])).toBe(exitCodes.findings);
      expect(resolveSpy).toHaveBeenCalledWith("tdd");
      expect(errorSpy).toHaveBeenCalledWith("skill not found: tdd");
    } finally {
      resolveSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("a resolved skill prints its path and succeeds", async () => {
    const resolveSpy = spyOn(skills, "resolveSkillPath").mockReturnValue(
      "/x/skills/a/tdd/SKILL.md",
    );
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(await requireCommand("skill-path")(["tdd"])).toBe(exitCodes.success);
      expect(logSpy).toHaveBeenCalledWith("/x/skills/a/tdd/SKILL.md");
    } finally {
      resolveSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe("runSelftest", () => {
  test("a compiled binary refuses with the findings code and spawns nothing", async () => {
    const compiledSpy = spyOn(assets, "isCompiledBinary").mockReturnValue(true);
    const spawnSpy = spyOn(Bun, "spawn");
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await requireCommand("selftest")([])).toBe(exitCodes.findings);
      expect(errorSpy).toHaveBeenCalledWith("selftest needs a source install; run emet doctor");
      expect(spawnSpy).not.toHaveBeenCalled();
    } finally {
      compiledSpy.mockRestore();
      spawnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("it typechecks then runs the unit tests and returns success when both pass", async () => {
    const compiledSpy = spyOn(assets, "isCompiledBinary").mockReturnValue(false);
    const { restore, calls } = stubSpawn([0, 0]);
    try {
      expect(await requireCommand("selftest")([])).toBe(0);
      expect(calls).toHaveLength(2);
      expect(calls[0]?.slice(0, 3)).toEqual(["bunx", "tsc", "--noEmit"]);
      expect(calls[0]?.at(-1)).toEndWith("tsconfig.json");
      expect(calls[1]?.slice(0, 2)).toEqual(["bun", "test"]);
      expect(calls[1]).toContain("--config");
    } finally {
      compiledSpy.mockRestore();
      restore();
    }
  });

  test("a typecheck failure wins over a passing test run", async () => {
    const compiledSpy = spyOn(assets, "isCompiledBinary").mockReturnValue(false);
    const { restore } = stubSpawn([2, 0]);
    try {
      expect(await requireCommand("selftest")([])).toBe(2);
    } finally {
      compiledSpy.mockRestore();
      restore();
    }
  });

  test("a test failure is returned when the typecheck passes", async () => {
    const compiledSpy = spyOn(assets, "isCompiledBinary").mockReturnValue(false);
    const { restore } = stubSpawn([0, 1]);
    try {
      expect(await requireCommand("selftest")([])).toBe(1);
    } finally {
      compiledSpy.mockRestore();
      restore();
    }
  });
});

describe("runMailbox and runGuard", () => {
  test.each(["ask", "inbox", "reply"] as const)(
    "%s forwards its name and argv to the mailbox module",
    async (name) => {
      const runSpy = spyOn(mailbox, "run").mockResolvedValue(undefined);
      try {
        await requireCommand(name)(["--run", "r1"]);
        expect(runSpy).toHaveBeenCalledWith(name, ["--run", "r1"]);
      } finally {
        runSpy.mockRestore();
      }
    },
  );

  test("inbox without --run reports a usage error through the real mailbox module", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await requireCommand("inbox")([]);
      expect(process.exitCode).toBe(1);
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain("emet inbox:");
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("guard delegates to the guard module", async () => {
    const runSpy = spyOn(guard, "run").mockResolvedValue(undefined);
    try {
      expect(await requireCommand("guard")([])).toBeUndefined();
      expect(runSpy).toHaveBeenCalledTimes(1);
    } finally {
      runSpy.mockRestore();
    }
  });
});

describe("loadRun module branches", () => {
  const skipped = new Set([
    "guard",
    "selftest",
    "skill-path",
    "ask",
    "inbox",
    "reply",
    "doctor",
    "tracker",
  ]);
  const modulesWithUsageOnEmptyArgv = COMMANDS.filter((spec) => !skipped.has(spec.name));

  test("every module-backed command resolves and runs its own entry point", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const spec of modulesWithUsageOnEmptyArgv) {
        process.exitCode = undefined;
        // oxlint-disable-next-line eslint/no-await-in-loop -- commands share console spies and process.exitCode, so they must run one at a time
        const result = await spec.run([]);
        const wrote = logSpy.mock.calls.length + errorSpy.mock.calls.length;
        expect(typeof result === "number" || result === undefined).toBe(true);
        expect(wrote).toBeGreaterThan(0);
        logSpy.mockClear();
        errorSpy.mockClear();
      }
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  test("doctor runs outside a git repository and skips the directory", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await requireCommand("doctor")([]);
      expect(logSpy.mock.calls.flat().join("\n")).toContain("not a git repository");
    } finally {
      logSpy.mockRestore();
    }
  });

  test("migrate resolves to undefined after running synchronously", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      expect(await requireCommand("migrate")(["--dry-run"])).toBeUndefined();
    } finally {
      logSpy.mockRestore();
    }
  });
});

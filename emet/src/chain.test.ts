import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentHost, CommandResult, CommandRunner } from "./agenthost";
import { claudeHost } from "./agenthost-claude";
import {
  chainNextWave,
  describeOutcome,
  readDiskStats,
  checkLaunchReadiness,
  run,
  type ChainDeps,
  type ChainRequest,
  type DiskStats,
} from "./chain";
import { ForgeConfigError } from "./config";
import { readJournalSegments } from "./journal";

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the promise to reject");
}

const GIB = 1024 ** 3;
const HEALTHY_DISK: DiskStats = { freeBytes: 50 * GIB, freeInodes: 1_000_000 };
const REQUEST: ChainRequest = {
  specId: "609",
  wave: 2,
  ticket: "CLA-1",
  gateArgs: ["--tier", "medium"],
};

function gateReply(decision: string, extra: Record<string, unknown> = {}): CommandResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      decision,
      reasons: [`because ${decision}`],
      chargeAttempt: false,
      ...extra,
    }),
    stderr: "",
  };
}

interface Recorder {
  readonly commands: string[][];
  readonly started: string[];
  sessionNames: string[];
}

function makeHost(recorder: Recorder, listAfterStart = true): AgentHost {
  return {
    ...claudeHost,
    sessions: {
      list: () => Promise.resolve(recorder.sessionNames.map((name) => ({ id: name, name }))),
      start: (request) => {
        recorder.started.push(request.name);
        if (listAfterStart) recorder.sessionNames.push(request.name);
        return Promise.resolve({ id: "id-1", name: request.name });
      },
      attachCommand: (name) => `claude attach ${name}`,
    },
  };
}

function makeRunner(recorder: Recorder, gate: CommandResult, orcaExit = 0): CommandRunner {
  return (command) => {
    recorder.commands.push([...command]);
    if (command[1] === "gate") return Promise.resolve(gate);
    if (command[0] === "orca" && command[1] === "status") {
      return Promise.resolve({ exitCode: orcaExit, stdout: "{}", stderr: "" });
    }
    return Promise.resolve({ exitCode: 0, stdout: "{}", stderr: "" });
  };
}

describe("emet chain", () => {
  let repoRoot: string;
  let recorder: Recorder;

  let previousStateDir: string | undefined;

  beforeEach(() => {
    previousStateDir = process.env.EMET_STATE_DIR;
    repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-chain-"));
    process.env.EMET_STATE_DIR = path.join(repoRoot, "state");
    recorder = { commands: [], started: [], sessionNames: [] };
  });

  afterEach(() => {
    if (previousStateDir === undefined) Reflect.deleteProperty(process.env, "EMET_STATE_DIR");
    else process.env.EMET_STATE_DIR = previousStateDir;
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function depsFor(
    gate: CommandResult,
    overrides: Partial<ChainDeps> = {},
    listAfterStart = true,
  ): ChainDeps {
    return {
      runner: makeRunner(recorder, gate),
      host: makeHost(recorder, listAfterStart),
      launcher: "bg",
      permissionMode: "bypassPermissions",
      repoRoot,
      tmpDir: "/tmp",
      readResources: () => ({ cpuCount: 4, memTotalBytes: 16 * GIB, memAvailableBytes: 8 * GIB }),
      memReserveBytes: 2 * GIB,
      readDiskStats: () => HEALTHY_DISK,
      minFreeBytes: 2 * GIB,
      minFreeInodes: 10_000,
      ...overrides,
    };
  }

  test("journals one launch.result per chained launch and none when nothing launches", async () => {
    await chainNextWave(REQUEST, depsFor(gateReply("hold")));
    expect(readJournalSegments().events).toEqual([]);
    await chainNextWave(REQUEST, depsFor(gateReply("chain")));
    const events = readJournalSegments().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "launch.result",
      origin: "auto",
      data: { spec: "609", wave: 2, name: "emet-609-w2", outcome: "started", via: "chain" },
    });
  });

  test("an unlisted child session is journaled as unverified", async () => {
    await chainNextWave(REQUEST, depsFor(gateReply("chain"), {}, false));
    expect(readJournalSegments().events[0]?.data.outcome).toBe("unverified");
  });

  test("launches the wave and verifies the session when the gate says chain", async () => {
    const outcome = await chainNextWave(REQUEST, depsFor(gateReply("chain")));
    expect(outcome.launched).toBe(true);
    expect(outcome.verified).toBe(true);
    expect(outcome.name).toBe("emet-609-w2");
    expect(recorder.started).toEqual(["emet-609-w2"]);
    expect(recorder.commands[0]).toEqual(["emet", "gate", "CLA-1", "--tier", "medium"]);
  });

  test("reports an unverified launch when the host does not list the session", async () => {
    const outcome = await chainNextWave(REQUEST, depsFor(gateReply("chain"), {}, false));
    expect(outcome.launched).toBe(true);
    expect(outcome.verified).toBe(false);
  });

  test("launches nothing when the gate says hold", async () => {
    const outcome = await chainNextWave(
      REQUEST,
      depsFor(gateReply("hold", { next: "fix-findings" })),
    );
    expect(outcome.launched).toBe(false);
    expect(outcome.gate.decision).toBe("hold");
    expect(outcome.gate.next).toBe("fix-findings");
    expect(recorder.started).toEqual([]);
  });

  test("launches nothing and names low-disk when free disk is below the threshold", async () => {
    const outcome = await chainNextWave(
      REQUEST,
      depsFor(gateReply("chain"), {
        readDiskStats: () => ({ freeBytes: GIB, freeInodes: 1_000_000 }),
      }),
    );
    expect(outcome.launched).toBe(false);
    expect(outcome.issues.map((issue) => issue.code)).toContain("low-disk");
    expect(recorder.started).toEqual([]);
  });

  test("reports an existing session for the same spec and wave without a second launch", async () => {
    recorder.sessionNames = ["emet-609-w2"];
    const outcome = await chainNextWave(REQUEST, depsFor(gateReply("chain")));
    expect(outcome.launched).toBe(false);
    expect(outcome.name).toBe("emet-609-w2");
    expect(recorder.started).toEqual([]);
  });

  test("a legacy-named session for the same wave also blocks", async () => {
    recorder.sessionNames = ["forge-609-w2"];
    const outcome = await chainNextWave(REQUEST, depsFor(gateReply("chain")));
    expect(outcome.launched).toBe(false);
    expect(outcome.name).toBe("forge-609-w2");
  });

  test("a launch refusal for a later-wave session is not a usage error and names the session", async () => {
    recorder.sessionNames = ["emet-609-w3"];
    let thrown: unknown;
    try {
      await chainNextWave(REQUEST, depsFor(gateReply("chain")));
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown instanceof ForgeConfigError).toBe(false);
    expect(thrown instanceof Error ? thrown.message : "").toContain("emet-609-w3");
  });

  test("a non-blocking orca issue does not stop the launch", async () => {
    const orcaDown: CommandRunner = (command) => {
      recorder.commands.push([...command]);
      if (command[1] === "gate") return Promise.resolve(gateReply("chain"));
      if (command[0] === "orca") return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
      return Promise.resolve({ exitCode: 0, stdout: "{}", stderr: "" });
    };
    const outcome = await chainNextWave(
      REQUEST,
      depsFor(gateReply("chain"), { runner: orcaDown, launcher: "auto" }),
    );
    expect(outcome.launched).toBe(true);
    expect(outcome.issues).toEqual([
      { code: "orca-unavailable", blocking: false, detail: "orca CLI unavailable (exit 1)" },
    ]);
  });

  test("throws when the gate subprocess fails or prints bad output", async () => {
    expect(
      await rejectionMessage(
        chainNextWave(REQUEST, depsFor({ exitCode: 2, stdout: "", stderr: "boom" })),
      ),
    ).toContain("gate failed (exit 2): boom");
    expect(
      await rejectionMessage(
        chainNextWave(REQUEST, depsFor({ exitCode: 0, stdout: "nope", stderr: "" })),
      ),
    ).toContain("not JSON");
    expect(
      await rejectionMessage(
        chainNextWave(REQUEST, depsFor({ exitCode: 0, stdout: "{}", stderr: "" })),
      ),
    ).toContain("unexpected result");
  });

  describe("checkLaunchReadiness", () => {
    test("is clean on a healthy host", async () => {
      expect(await checkLaunchReadiness(depsFor(gateReply("chain")))).toEqual([]);
    });

    test("flags low memory, low inodes and a blocking orca outage", async () => {
      const issues = await checkLaunchReadiness(
        depsFor(gateReply("chain"), {
          launcher: "orca",
          runner: makeRunner(recorder, gateReply("chain"), 1),
          readResources: () => ({ cpuCount: 4, memTotalBytes: 16 * GIB, memAvailableBytes: GIB }),
          readDiskStats: () => ({ freeBytes: 50 * GIB, freeInodes: 5 }),
        }),
      );
      expect(issues.map((issue) => issue.code).toSorted()).toEqual([
        "low-inodes",
        "low-inodes",
        "low-memory",
        "orca-unavailable",
      ]);
      expect(issues.every((issue) => issue.blocking)).toBe(true);
    });

    test("skips disk checks when stats are unreadable and orca when the launcher is bg", async () => {
      const issues = await checkLaunchReadiness(
        depsFor(gateReply("chain"), { readDiskStats: () => null }),
      );
      expect(issues).toEqual([]);
      expect(recorder.commands).toEqual([]);
    });
  });

  describe("describeOutcome and readDiskStats", () => {
    const gate = { decision: "chain", reasons: [], chargeAttempt: false } as const;
    const base = { launched: false, verified: false, name: null, gate, issues: [] };

    test("describes each outcome", () => {
      expect(describeOutcome({ ...base, launched: true, verified: true, name: "emet-1-w2" })).toBe(
        "launched emet-1-w2",
      );
      expect(describeOutcome({ ...base, launched: true, name: "emet-1-w2" })).toContain(
        "not yet listed",
      );
      expect(
        describeOutcome({
          ...base,
          issues: [{ code: "low-disk", blocking: true, detail: "repo: low" }],
        }),
      ).toBe("low-disk: repo: low");
      expect(describeOutcome({ ...base, name: "emet-1-w2" })).toContain("emet-1-w2 already exists");
      expect(describeOutcome({ ...base })).toContain("session  already exists");
    });

    test("reads real disk stats and returns null for a missing directory", () => {
      const stats = readDiskStats(repoRoot);
      expect(stats?.freeBytes).toBeGreaterThan(0);
      expect(readDiskStats(path.join(repoRoot, "missing"))).toBeNull();
    });
  });

  describe("run", () => {
    const originalExitCode = process.exitCode;

    afterEach(() => {
      process.exitCode = originalExitCode ?? 0;
    });

    test("exits 2 with usage on missing flags", async () => {
      const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
      try {
        await run([]);
        expect(process.exitCode).toBe(2);
        expect(errorSpy.mock.calls.flat().join("\n")).toContain("usage:");
      } finally {
        errorSpy.mockRestore();
      }
    });

    test("exits 1 and prints the gate reasons on hold, json or text", async () => {
      const logSpy = spyOn(console, "log").mockImplementation(() => undefined);
      const runner = makeRunner(recorder, gateReply("hold"));
      try {
        await run(["--spec", "609", "--wave", "2", "--ticket", "CLA-1", "--ci", "pass"], runner);
        expect(process.exitCode).toBe(1);
        expect(logSpy.mock.calls.flat().join("\n")).toContain("gate: hold: because hold");
        expect(recorder.commands[0]).toEqual(["emet", "gate", "CLA-1", "--ci", "pass"]);
        logSpy.mockClear();
        await run(["--spec", "609", "--wave", "2", "--ticket", "CLA-1", "--json"], runner);
        const printed: unknown = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
        expect(printed).toMatchObject({ launched: false });
      } finally {
        logSpy.mockRestore();
      }
    });

    test("exits 1 when the gate subprocess fails", async () => {
      const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
      try {
        await run(["--spec", "609", "--wave", "2", "--ticket", "CLA-1"], () =>
          Promise.resolve({ exitCode: 2, stdout: "", stderr: "bad" }),
        );
        expect(process.exitCode).toBe(1);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});

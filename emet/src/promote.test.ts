import { afterEach, describe, expect, spyOn, test } from "bun:test";

import type { CiOutcome, GhRunner } from "./ci";
import { DEFAULT_FORGE_CONFIG } from "./config";
import {
  isFinalWaveClean,
  parseSpecState,
  planAfterSpec,
  promoteDevelop,
  run,
  type PromoteDeps,
  type PromoteOutcome,
} from "./promote";

function configWith(afterSpec: "release" | "promote" | "none") {
  return { handoff: { ...DEFAULT_FORGE_CONFIG.handoff, afterSpec } };
}

interface Harness {
  deps: PromoteDeps;
  calls: string[][];
  recorded: PromoteOutcome[];
}

function harness(options: {
  mode?: "release" | "promote" | "none";
  ci?: CiOutcome["state"];
  ahead?: number;
}): Harness {
  const calls: string[][] = [];
  const recorded: PromoteOutcome[] = [];
  let created = 0;
  const gh: GhRunner = (args) => {
    calls.push([...args]);
    if (args[0] === "pr" && args[1] === "create") {
      created += 1;
      return Promise.resolve(`https://github.com/o/r/pull/${created === 1 ? 10 : 11}\n`);
    }
    if (args[0] === "api") return Promise.resolve(`${options.ahead ?? 0}\n`);
    return Promise.resolve("");
  };
  const deps: PromoteDeps = {
    mode: options.mode ?? "promote",
    gh,
    waitForCi: () =>
      Promise.resolve({
        state: options.ci ?? "pass",
        failedChecks: [],
        flakeReruns: 0,
        noChecks: false,
      }),
    record: (outcome) => recorded.push({ ...outcome }),
  };
  return { deps, calls, recorded };
}

describe("planAfterSpec", () => {
  test("returns the configured mode", () => {
    expect(planAfterSpec(configWith("promote"), { noPromote: false, finalWaveClean: true })).toBe(
      "promote",
    );
  });

  test("--no-promote makes it none whatever the config says", () => {
    expect(planAfterSpec(configWith("release"), { noPromote: true, finalWaveClean: true })).toBe(
      "none",
    );
  });

  test("an open or flagged last wave makes it none", () => {
    expect(planAfterSpec(configWith("promote"), { noPromote: false, finalWaveClean: false })).toBe(
      "none",
    );
  });
});

describe("promoteDevelop", () => {
  test("none skips without touching gh", async () => {
    const { deps, calls } = harness({ mode: "none" });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome.skipped).toBe("after-spec is none");
    expect(calls).toHaveLength(0);
  });

  test("release opens and merges nothing", async () => {
    const { deps, calls } = harness({ mode: "release" });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome.merged).toBe(false);
    expect(outcome.skipped).toContain("cut-release");
    expect(calls).toHaveLength(0);
  });

  test("dry run opens no pull request", async () => {
    const { deps, calls } = harness({});
    const outcome = await promoteDevelop({ dryRun: true }, deps);
    expect(outcome.prNumber).toBeNull();
    expect(calls).toHaveLength(0);
  });

  test("merges with a merge commit when CI passes and records one event", async () => {
    const { deps, calls, recorded } = harness({});
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({ prNumber: 10, merged: true, syncPrNumber: null });
    expect(calls).toContainEqual(["pr", "merge", "10", "--merge"]);
    expect(calls.find((call) => call[0] === "pr" && call[1] === "create")).toContain(
      "chore: 🔖 promote develop",
    );
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.merged).toBe(true);
  });

  test("opens and merges a sync pull request only when develop is behind main", async () => {
    const { deps, calls } = harness({ ahead: 2 });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome.syncPrNumber).toBe(11);
    expect(calls).toContainEqual(["pr", "merge", "11", "--merge"]);
  });

  test.each(["fail", "timeout", "env-fault"] as const)("never merges when CI is %s", async (ci) => {
    const { deps, calls } = harness({ ci });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({ merged: false, ciState: ci });
    expect(calls.some((call) => call[0] === "pr" && call[1] === "merge")).toBe(false);
  });

  test("rejects when gh prints no pull request URL", async () => {
    const { deps } = harness({});
    deps.gh = () => Promise.resolve("nope");
    let message = "";
    try {
      await promoteDevelop({ dryRun: false }, deps);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("pull request number");
  });
});

describe("final wave state", () => {
  test("only an idle spec has a clean final wave", () => {
    expect(isFinalWaveClean("idle")).toBe(true);
    for (const state of ["working", "checking", "ready", "needs-decision"]) {
      expect(isFinalWaveClean(state)).toBe(false);
    }
  });

  test("reads the state out of the status output", () => {
    const output = `{\n  "state": "needs-decision",\n  "waves": []\n}\nemet status: needs-decision`;
    expect(parseSpecState(output, "629")).toBe("needs-decision");
  });

  test("rejects output with no JSON or no state", () => {
    expect(() => parseSpecState("emet status: idle", "629")).toThrow("could not read");
    expect(() => parseSpecState('{"waves": []}', "629")).toThrow("no state");
  });
});

async function runCaptured(
  argv: string[],
  overrides: Partial<PromoteDeps> & { specState?: (specId: string) => Promise<string> } = {},
) {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    logs.push(parts.join(" "));
  });
  const errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    errors.push(parts.join(" "));
  });
  await run(argv, { specState: () => Promise.resolve("idle"), ...overrides });
  logSpy.mockRestore();
  errorSpy.mockRestore();
  return { logs, errors };
}

describe("run", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0;
  });

  test("exits 2 without --spec", async () => {
    const { errors } = await runCaptured([]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("usage");
  });

  test("--no-promote skips with exit 0", async () => {
    const { logs } = await runCaptured(["--spec", "629", "--no-promote"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(logs.join("\n")).toContain("after-spec is none");
  });

  test("a dry run in promote mode opens nothing and exits 0", async () => {
    const { logs } = await runCaptured(["--spec", "629", "--dry-run"], { mode: "promote" });
    expect(logs.join("\n")).toContain("dry run");
  });
});

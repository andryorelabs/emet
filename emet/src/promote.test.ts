import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CiOutcome, GhRunner } from "./ci";
import { DEFAULT_FORGE_CONFIG } from "./config";
import { BINARY } from "./names";
import {
  buildPromoteDeps,
  holdMarkerPath,
  holdSpec,
  isFinalWaveClean,
  isSpecHeld,
  parseSpecState,
  planAfterSpec,
  readSpecState,
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

describe("buildPromoteDeps", () => {
  test("waits for CI through gh and passes a pull request with no checks", async () => {
    const calls: string[][] = [];
    const deps = buildPromoteDeps({
      mode: "promote",
      repoRoot: "/repo",
      specId: "629",
      gh: (args) => {
        calls.push([...args]);
        return Promise.resolve('{"statusCheckRollup":[]}');
      },
    });
    const outcome = await deps.waitForCi(7);
    expect(outcome.state).toBe("pass");
    expect(calls[0]).toContain("statusCheckRollup");
  });

  test("records a promote event with the spec, mode and result", () => {
    const events: unknown[] = [];
    const deps = buildPromoteDeps({
      mode: "promote",
      repoRoot: "/repo",
      specId: "629",
      append: (event) => {
        events.push(event);
      },
    });
    deps.record({
      mode: "promote",
      prNumber: 7,
      merged: true,
      syncPrNumber: null,
      ciState: "pass",
    });
    expect(events).toEqual([
      {
        kind: "promote",
        repo: "/repo",
        origin: "auto",
        data: {
          spec: "629",
          mode: "promote",
          prNumber: 7,
          merged: true,
          syncPrNumber: null,
          ciState: "pass",
        },
      },
    ]);
  });
});

describe("readSpecState", () => {
  test("reads the state from the emet binary on PATH", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "emet-promote-bin-"));
    const originalPath = process.env.PATH;
    try {
      const script = path.join(directory, BINARY);
      writeFileSync(script, `#!/bin/sh\necho '{"state":"working","waves":[]}'\n`);
      chmodSync(script, 0o755);
      process.env.PATH = `${directory}:${originalPath ?? ""}`;
      expect(await readSpecState("629")).toBe("working");
    } finally {
      process.env.PATH = originalPath;
      rmSync(directory, { recursive: true, force: true });
    }
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
  overrides: Partial<PromoteDeps> & {
    specState?: (specId: string) => Promise<string>;
    repoRoot?: string;
    commonDirectory?: string;
  } = {},
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

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function writePromoteConfig(root: string): void {
  writeFileSync(
    path.join(root, "emet.config.json"),
    JSON.stringify({ handoff: { afterSpec: "promote" } }),
  );
}

const failingGh: GhRunner = () => Promise.reject(new Error("gh must not run"));

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

  describe("--hold", () => {
    const roots: string[] = [];
    const makeRoot = (): string => {
      const root = mkdtempSync(path.join(os.tmpdir(), "emet-hold-"));
      roots.push(root);
      return root;
    };
    const makeSetup = (): { repoRoot: string; commonDirectory: string } => ({
      repoRoot: makeRoot(),
      commonDirectory: makeRoot(),
    });

    afterEach(() => {
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    test("writes the marker and prints held without a config", async () => {
      const { commonDirectory } = makeSetup();
      const { logs } = await runCaptured(["--spec", "629", "--hold"], { commonDirectory });
      expect(process.exitCode ?? 0).toBe(0);
      expect(JSON.parse(logs.join(""))).toEqual({ held: true });
      expect(holdMarkerPath(commonDirectory, "629")).toBe(
        path.join(commonDirectory, ".emet", "runs", "629", "no-promote"),
      );
      expect(existsSync(holdMarkerPath(commonDirectory, "629"))).toBe(true);
    });

    test("a held spec skips without opening a pull request", async () => {
      const { repoRoot, commonDirectory } = makeSetup();
      writePromoteConfig(repoRoot);
      holdSpec(commonDirectory, "629");
      const { logs } = await runCaptured(["--spec", "629"], {
        repoRoot,
        commonDirectory,
        gh: failingGh,
      });
      expect(process.exitCode ?? 0).toBe(0);
      expect(logs.join("\n")).toContain("after-spec is none");
    });

    test("a held spec skips on a dry run too", async () => {
      const { repoRoot, commonDirectory } = makeSetup();
      writePromoteConfig(repoRoot);
      holdSpec(commonDirectory, "629");
      const { logs } = await runCaptured(["--spec", "629", "--dry-run"], {
        repoRoot,
        commonDirectory,
      });
      expect(logs.join("\n")).toContain("after-spec is none");
      expect(logs.join("\n")).not.toContain("dry run");
    });

    test("the legacy per-checkout marker is still honored", () => {
      const { repoRoot, commonDirectory } = makeSetup();
      const legacy = path.join(repoRoot, ".emet", "runs", "629", "no-promote");
      mkdirSync(path.dirname(legacy), { recursive: true });
      writeFileSync(legacy, "");
      expect(isSpecHeld(commonDirectory, repoRoot, "629")).toBe(true);
    });

    test("another spec is not held", () => {
      const { repoRoot, commonDirectory } = makeSetup();
      holdSpec(commonDirectory, "629");
      expect(isSpecHeld(commonDirectory, repoRoot, "630")).toBe(false);
    });

    test("without a marker the promote mode runs as before", async () => {
      const { repoRoot, commonDirectory } = makeSetup();
      writePromoteConfig(repoRoot);
      const { logs } = await runCaptured(["--spec", "629", "--dry-run"], {
        repoRoot,
        commonDirectory,
      });
      expect(logs.join("\n")).toContain("dry run");
    });

    test("a marker written from one worktree is honored from another", () => {
      const main = makeRoot();
      const second = path.join(makeRoot(), "second");
      git(main, "init", "-q", "-b", "main");
      git(
        main,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "i",
      );
      git(main, "worktree", "add", "-q", second);
      const commonFromMain = git(main, "rev-parse", "--path-format=absolute", "--git-common-dir");
      const commonFromSecond = git(
        second,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      );
      expect(commonFromSecond).toBe(commonFromMain);
      holdSpec(commonFromMain, "629");
      expect(isSpecHeld(commonFromSecond, second, "629")).toBe(true);
    });

    test("--spec followed by a flag is a usage error", async () => {
      const { commonDirectory } = makeSetup();
      const { errors } = await runCaptured(["--spec", "--hold"], { commonDirectory });
      expect(process.exitCode).toBe(2);
      expect(errors.join("\n")).toContain("usage");
      expect(existsSync(path.join(commonDirectory, ".emet"))).toBe(false);
    });

    test("an unsafe spec id writes nothing", async () => {
      const { commonDirectory } = makeSetup();
      const { errors } = await runCaptured(["--spec", "../x", "--hold"], { commonDirectory });
      expect(process.exitCode).toBe(1);
      expect(errors.join("\n")).toContain("unsafe");
      expect(existsSync(path.join(commonDirectory, ".emet"))).toBe(false);
    });
  });
});

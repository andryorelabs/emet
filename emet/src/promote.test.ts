import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CiOutcome, GhRunner } from "./ci";
import { DEFAULT_FORGE_CONFIG, type AfterSpecSetting } from "./config";
import { BINARY } from "./names";
import {
  buildPromoteDeps,
  decideDeployCheck,
  holdMarkerPath,
  holdSpec,
  isFinalWaveClean,
  isSpecHeld,
  parseSpecState,
  planAfterSpec,
  readSpecState,
  promoteDevelop,
  readChangedPaths,
  run,
  SYNC_SKIPPED_REASON,
  type PromoteDeps,
  type PromoteOutcome,
} from "./promote";

const websiteRules: AfterSpecSetting = [
  { paths: ["apps/site/**", "docs/**"], mode: "promote" },
  { mode: "release" },
];

function configWith(afterSpec: AfterSpecSetting) {
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
  files?: number;
  mergeMethod?: PromoteDeps["mergeMethod"];
  compareOutput?: string;
  syncCi?: CiOutcome["state"];
  syncNoChecks?: boolean;
  syncMergeError?: string;
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
    if (args[0] === "api")
      return Promise.resolve(options.compareOutput ?? `${options.files ?? 0}\n`);
    if (args[0] === "pr" && args[1] === "merge" && args[2] === "11" && options.syncMergeError) {
      return Promise.reject(new Error(options.syncMergeError));
    }
    return Promise.resolve("");
  };
  const deps: PromoteDeps = {
    mode: options.mode ?? "promote",
    mergeMethod: options.mergeMethod ?? "squash",
    gh,
    waitForCi: (pr) => {
      calls.push(["wait", String(pr)]);
      const isSync = pr === 11;
      return Promise.resolve({
        state: (isSync ? options.syncCi : undefined) ?? options.ci ?? "pass",
        failedChecks: [],
        flakeReruns: 0,
        noChecks: isSync && options.syncNoChecks === true,
      });
    },
    record: (outcome) => recorded.push({ ...outcome }),
    readChangedPaths: () => Promise.resolve([]),
  };
  return { deps, calls, recorded };
}

describe("planAfterSpec", () => {
  const clean = { noPromote: false, finalWaveClean: true, changedPaths: [] };

  test("returns the configured mode", () => {
    expect(planAfterSpec(configWith("promote"), clean).mode).toBe("promote");
  });

  test("--no-promote makes it none whatever the config says", () => {
    expect(planAfterSpec(configWith("release"), { ...clean, noPromote: true }).mode).toBe("none");
  });

  test("an open or flagged last wave makes it none", () => {
    expect(planAfterSpec(configWith("promote"), { ...clean, finalWaveClean: false }).mode).toBe(
      "none",
    );
  });

  test("a rule list resolves against the changed paths", () => {
    const config = { handoff: { ...DEFAULT_FORGE_CONFIG.handoff, afterSpec: websiteRules } };
    const resolution = planAfterSpec(config, { ...clean, changedPaths: ["apps/site/a.astro"] });
    expect(resolution).toMatchObject({ mode: "promote", ruleIndex: 0 });
  });
});

describe("decideDeployCheck", () => {
  const check = {
    command: "true",
    retries: 1,
    intervalSeconds: 1,
    timeoutSeconds: 1,
    paths: ["apps/site/**"],
  };
  const base = {
    check,
    trunk: "develop",
    mode: "promote" as const,
    finalWaveClean: true,
    promoteMerged: true,
    changedPaths: ["apps/site/a.astro"],
  };

  test("runs after a merged promote that touched the check paths", () => {
    expect(decideDeployCheck(base).run).toBe(true);
  });

  test("skips without a check", () => {
    expect(decideDeployCheck({ ...base, check: undefined }).run).toBe(false);
  });

  test("skips when the final wave is not clean, even on main", () => {
    expect(decideDeployCheck({ ...base, finalWaveClean: false }).run).toBe(false);
    expect(decideDeployCheck({ ...base, trunk: "main", finalWaveClean: false }).run).toBe(false);
  });

  test("skips release mode and says a person deploys", () => {
    const decision = decideDeployCheck({ ...base, mode: "release" });
    expect(decision.run).toBe(false);
    expect(decision.reason).toContain("waits for a person");
  });

  test("skips a merged promote with no matching changed path", () => {
    const decision = decideDeployCheck({ ...base, changedPaths: ["emet/src/a.ts"] });
    expect(decision.run).toBe(false);
    expect(decision.reason).toContain("no changed path matches");
  });

  test("skips a promote that did not merge", () => {
    expect(decideDeployCheck({ ...base, promoteMerged: false }).run).toBe(false);
  });

  test("runs on trunk main in every mode and ignores the paths", () => {
    for (const mode of ["release", "promote", "none"] as const) {
      expect(decideDeployCheck({ ...base, trunk: "main", mode, changedPaths: [] }).run).toBe(true);
    }
  });

  test("skips none on develop", () => {
    expect(decideDeployCheck({ ...base, mode: "none" }).run).toBe(false);
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

  test("waits for the sync pull request, then merges it on pass", async () => {
    const { deps, calls } = harness({ files: 2 });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({ syncPrNumber: 11, syncMerged: true, syncReason: null });
    const waitIndex = calls.findIndex((call) => call[0] === "wait" && call[1] === "11");
    const mergeIndex = calls.findIndex((call) => call.join(" ") === "pr merge 11 --squash");
    expect(waitIndex).toBeGreaterThan(-1);
    expect(mergeIndex).toBeGreaterThan(waitIndex);
  });

  test("merges a sync pull request with no checks immediately", async () => {
    const { deps, calls } = harness({ files: 2, syncNoChecks: true });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome.syncMerged).toBe(true);
    expect(calls).toContainEqual(["pr", "merge", "11", "--squash"]);
  });

  test.each(["fail", "timeout", "env-fault"] as const)(
    "leaves the sync pull request open when its CI is %s",
    async (syncCi) => {
      const { deps, calls, recorded } = harness({ files: 2, syncCi });
      const outcome = await promoteDevelop({ dryRun: false }, deps);
      expect(outcome).toMatchObject({ merged: true, syncPrNumber: 11, syncMerged: false });
      expect(outcome.syncReason).toContain(syncCi);
      expect(calls.some((call) => call.join(" ") === "pr merge 11 --squash")).toBe(false);
      expect(recorded[0]).toMatchObject({ syncMerged: false, syncReason: outcome.syncReason });
    },
  );

  test("leaves the sync pull request open when the merge is rejected", async () => {
    const { deps } = harness({ files: 2, syncMergeError: "merge blocked" });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({ merged: true, syncPrNumber: 11, syncMerged: false });
    expect(outcome.syncReason).toContain("merge blocked");
  });

  test("a non-Error merge rejection is recorded as text", async () => {
    const { deps } = harness({ files: 2 });
    const gh = deps.gh;
    deps.gh = (args) => {
      if (args[1] === "merge" && args[2] === "11") {
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the test needs a non-Error rejection
        return Promise.reject("denied");
      }
      return gh(args);
    };
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome.syncReason).toContain("denied");
  });

  test("opens no sync pull request when main differs only by merge commits", async () => {
    const { deps, calls, recorded } = harness({ files: 0 });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({
      merged: true,
      syncPrNumber: null,
      syncMerged: false,
      syncReason: SYNC_SKIPPED_REASON,
    });
    expect(SYNC_SKIPPED_REASON).toBe(
      "develop already carries the content of main; only merge commits differ",
    );
    expect(calls.filter((call) => call[0] === "pr" && call[1] === "create")).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ syncReason: SYNC_SKIPPED_REASON, syncMerged: false });
  });

  test("opens the sync pull request when the comparison lists a file", async () => {
    const { deps, calls } = harness({ files: 1 });
    const outcome = await promoteDevelop({ dryRun: false }, deps);
    expect(outcome).toMatchObject({ syncPrNumber: 11, syncMerged: true });
    expect(calls).toContainEqual([
      "api",
      "repos/{owner}/{repo}/compare/develop...main",
      "--jq",
      'if .files == null then "no files key" else (.files | length) end',
    ]);
  });

  test.each(["squash", "merge", "rebase"] as const)(
    "merges the sync pull request with --%s and the promote with --merge",
    async (mergeMethod) => {
      const { deps, calls } = harness({ files: 2, mergeMethod });
      await promoteDevelop({ dryRun: false }, deps);
      expect(calls).toContainEqual(["pr", "merge", "11", `--${mergeMethod}`]);
      expect(calls).toContainEqual(["pr", "merge", "10", "--merge"]);
    },
  );

  test.each(["", "\n", "null", "abc"])(
    "an unreadable comparison (%j) opens no sync and records why",
    async (compareOutput) => {
      const { deps, calls } = harness({ compareOutput });
      const outcome = await promoteDevelop({ dryRun: false }, deps);
      expect(outcome).toMatchObject({ merged: true, syncPrNumber: null, syncMerged: false });
      expect(outcome.syncReason).toContain("could not read the changed file count");
      expect(calls.filter((call) => call[0] === "pr" && call[1] === "create")).toHaveLength(1);
    },
  );

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
      rule: 0,
      reason: "every changed path matches rule 0",
      prNumber: 7,
      merged: true,
      syncPrNumber: null,
      syncMerged: false,
      syncReason: null,
      deployCheck: { run: true, reason: "merged" },
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
          rule: 0,
          reason: "every changed path matches rule 0",
          deployCheck: { run: true, reason: "merged" },
          prNumber: 7,
          merged: true,
          syncPrNumber: null,
          syncMerged: false,
          syncReason: null,
          ciState: "pass",
        },
      },
    ]);
  });
});

describe("buildPromoteDeps changed paths", () => {
  test("reads the changed paths from the repository root it was given", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "emet-deps-"));
    try {
      git(directory, "init", "-q", "-b", "main");
      const deps = buildPromoteDeps({ mode: "promote", repoRoot: directory, specId: "629" });
      let message = "";
      try {
        await deps.readChangedPaths();
      } catch (error: unknown) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("git fetch failed");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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

function commitAll(cwd: string, message: string): void {
  git(cwd, "add", "-A");
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
}

function writeFile(root: string, relative: string, content: string): void {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function deployCheck(paths?: string[]) {
  return {
    check: {
      command: "true",
      retries: 1,
      intervalSeconds: 1,
      timeoutSeconds: 1,
      ...(paths === undefined ? {} : { paths }),
    },
  };
}

function developConfig(afterSpec: unknown, deploy?: unknown) {
  return {
    repo: { trunk: "develop" },
    handoff: { afterSpec },
    ...(deploy === undefined ? {} : { deploy }),
  };
}

function isPromoteOutcome(value: unknown): value is PromoteOutcome {
  return typeof value === "object" && value !== null && "mode" in value && "deployCheck" in value;
}

function fakeDeps(options: { paths?: readonly string[]; ci?: CiOutcome["state"] }) {
  const calls: string[][] = [];
  const pathReads: number[] = [];
  const overrides: Partial<PromoteDeps> = {
    gh: (args) => {
      calls.push([...args]);
      if (args[0] === "pr" && args[1] === "create") {
        return Promise.resolve("https://github.com/o/r/pull/10\n");
      }
      if (args[0] === "api") return Promise.resolve("0\n");
      return Promise.resolve("");
    },
    waitForCi: () =>
      Promise.resolve({
        state: options.ci ?? "pass",
        failedChecks: [],
        flakeReruns: 0,
        noChecks: false,
      }),
    record: () => undefined,
    readChangedPaths: () => {
      pathReads.push(1);
      return Promise.resolve(options.paths ?? []);
    },
  };
  return { overrides, calls, pathReads };
}

describe("readChangedPaths", () => {
  const directories: string[] = [];
  const makeDirectory = (): string => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "emet-changed-"));
    directories.push(directory);
    return directory;
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function repoWithDevelop(change: (work: string) => void): string {
    const origin = makeDirectory();
    git(origin, "init", "-q", "--bare", "-b", "main");
    const work = makeDirectory();
    git(work, "init", "-q", "-b", "main");
    git(work, "remote", "add", "origin", origin);
    writeFile(work, "emet/src/old name.ts", "export const a = 1;\n".repeat(20));
    commitAll(work, "base");
    git(work, "push", "-q", "origin", "main");
    git(work, "checkout", "-q", "-b", "develop");
    change(work);
    commitAll(work, "change");
    git(work, "push", "-q", "origin", "develop");
    return work;
  }

  test("returns exactly the paths develop adds", async () => {
    const work = repoWithDevelop((root) => {
      writeFile(root, "apps/site/a.astro", "a");
      writeFile(root, "emet/src/b.ts", "b");
    });
    expect((await readChangedPaths(work)).toSorted()).toEqual([
      "apps/site/a.astro",
      "emet/src/b.ts",
    ]);
  });

  test("keeps spaces, unicode and brackets literal", async () => {
    const work = repoWithDevelop((root) => {
      writeFile(root, "apps/site/[locale]/página uno.astro", "a");
    });
    expect(await readChangedPaths(work)).toEqual(["apps/site/[locale]/página uno.astro"]);
  });

  test("counts both the old and the new path of a rename", async () => {
    const work = repoWithDevelop((root) => {
      mkdirSync(path.join(root, "apps/site"), { recursive: true });
      git(root, "mv", "emet/src/old name.ts", "apps/site/old name.ts");
    });
    expect((await readChangedPaths(work)).toSorted()).toEqual([
      "apps/site/old name.ts",
      "emet/src/old name.ts",
    ]);
  });

  test("throws when git fails instead of returning no paths", async () => {
    const empty = makeDirectory();
    git(empty, "init", "-q", "-b", "main");
    let message = "";
    try {
      await readChangedPaths(empty);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("git fetch failed");
  });

  test("throws the git message when main and develop share no history", async () => {
    const origin = makeDirectory();
    git(origin, "init", "-q", "--bare", "-b", "main");
    const work = makeDirectory();
    git(work, "init", "-q", "-b", "main");
    git(work, "remote", "add", "origin", origin);
    writeFile(work, "a.txt", "a");
    commitAll(work, "main root");
    git(work, "push", "-q", "origin", "main");
    git(work, "checkout", "-q", "--orphan", "develop");
    writeFile(work, "b.txt", "b");
    commitAll(work, "develop root");
    git(work, "push", "-q", "origin", "develop");
    let message = "";
    try {
      await readChangedPaths(work);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("git diff failed");
  });
});

describe("run: changed paths and the deploy check", () => {
  const originalExitCode = process.exitCode;
  const roots: string[] = [];

  afterEach(() => {
    process.exitCode = originalExitCode ?? 0;
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function setup(config: Record<string, unknown>): { repoRoot: string; commonDirectory: string } {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-promote-run-"));
    const commonDirectory = mkdtempSync(path.join(os.tmpdir(), "emet-promote-common-"));
    roots.push(repoRoot, commonDirectory);
    writeFileSync(path.join(repoRoot, "emet.config.json"), JSON.stringify(config));
    return { repoRoot, commonDirectory };
  }

  async function runOutcome(
    argv: string[],
    config: Record<string, unknown>,
    options: { paths?: readonly string[]; ci?: CiOutcome["state"] } = {},
  ) {
    const { repoRoot, commonDirectory } = setup(config);
    const { overrides, calls, pathReads } = fakeDeps(options);
    const { logs, errors } = await runCaptured(["--spec", "655", ...argv], {
      ...overrides,
      repoRoot,
      commonDirectory,
    });
    const printed = logs.find((line) => line.startsWith("{"));
    const parsed: unknown = printed === undefined ? undefined : JSON.parse(printed);
    const outcome = isPromoteOutcome(parsed) ? parsed : undefined;
    return { outcome, calls, pathReads, errors };
  }

  test("a Website-only spec matches rule 0 and runs the deploy check", async () => {
    const { outcome, calls } = await runOutcome(
      [],
      developConfig(websiteRules, deployCheck(["apps/site/**"])),
      { paths: ["apps/site/a.astro", "docs/x.md"] },
    );
    expect(outcome).toMatchObject({ mode: "promote", rule: 0, merged: true });
    expect(outcome?.reason).toContain("apps/site/**");
    expect(outcome?.deployCheck.run).toBe(true);
    expect(calls).toContainEqual(["pr", "merge", "10", "--merge"]);
  });

  test("a CLI change falls to release and skips the deploy check", async () => {
    const { outcome, calls } = await runOutcome(
      [],
      developConfig(websiteRules, deployCheck(["apps/site/**"])),
      { paths: ["emet/src/promote.ts"] },
    );
    expect(outcome).toMatchObject({ mode: "release", rule: 1 });
    expect(outcome?.deployCheck.run).toBe(false);
    expect(outcome?.deployCheck.reason).toContain("waits for a person");
    expect(calls).toHaveLength(0);
  });

  test("a merged promote with no matching changed path skips the deploy check", async () => {
    const { outcome } = await runOutcome(
      [],
      developConfig("promote", deployCheck(["apps/site/**"])),
      { paths: ["emet/src/a.ts"] },
    );
    expect(outcome?.merged).toBe(true);
    expect(outcome?.deployCheck.run).toBe(false);
    expect(outcome?.deployCheck.reason).toContain("no changed path matches");
  });

  test("the string form reports rule null", async () => {
    const { outcome } = await runOutcome([], developConfig("promote", deployCheck()));
    expect(outcome?.rule).toBeNull();
    expect(outcome?.deployCheck.run).toBe(true);
  });

  test("a promote pull request whose CI does not pass skips the deploy check", async () => {
    const { outcome } = await runOutcome([], developConfig("promote", deployCheck()), {
      ci: "fail",
    });
    expect(outcome?.merged).toBe(false);
    expect(outcome?.deployCheck.run).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  test("a string afterSpec without check paths reads no changed paths", async () => {
    const { pathReads } = await runOutcome([], developConfig("promote", deployCheck()));
    expect(pathReads).toHaveLength(0);
  });

  test("a rule list on trunk main reads no changed paths and uses the fallback", async () => {
    const { outcome, pathReads } = await runOutcome([], {
      repo: { trunk: "main" },
      handoff: { afterSpec: websiteRules },
    });
    expect(pathReads).toHaveLength(0);
    expect(outcome).toMatchObject({ mode: "release", rule: 1 });
  });

  test("afterSpec none on trunk main still runs the deploy check", async () => {
    const { outcome, calls } = await runOutcome([], {
      repo: { trunk: "main" },
      handoff: { afterSpec: "none" },
      deploy: deployCheck(["apps/site/**"]),
    });
    expect(outcome?.mode).toBe("none");
    expect(outcome?.deployCheck.run).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("--no-promote on trunk main still runs the deploy check", async () => {
    const { outcome } = await runOutcome(["--no-promote"], {
      repo: { trunk: "main" },
      handoff: { afterSpec: "promote" },
      deploy: deployCheck(),
    });
    expect(outcome?.deployCheck.run).toBe(true);
  });

  test("a held spec on trunk main still runs the deploy check", async () => {
    const { repoRoot, commonDirectory } = setup({
      repo: { trunk: "main" },
      handoff: { afterSpec: "release" },
      deploy: deployCheck(),
    });
    holdSpec(commonDirectory, "655");
    const { overrides } = fakeDeps({});
    const { logs } = await runCaptured(["--spec", "655"], {
      ...overrides,
      repoRoot,
      commonDirectory,
    });
    expect(JSON.parse(logs.join(""))).toMatchObject({ deployCheck: { run: true } });
  });

  test("afterSpec none on develop skips the deploy check", async () => {
    const { outcome } = await runOutcome([], developConfig("none", deployCheck()));
    expect(outcome?.deployCheck.run).toBe(false);
  });

  test("a changed-paths failure exits 1 and opens no pull request", async () => {
    const { repoRoot, commonDirectory } = setup(developConfig(websiteRules));
    const { overrides, calls } = fakeDeps({});
    const { errors } = await runCaptured(["--spec", "655"], {
      ...overrides,
      readChangedPaths: () => Promise.reject(new Error("git diff failed: boom")),
      repoRoot,
      commonDirectory,
    });
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("git diff failed: boom");
    expect(calls.some((call) => call[0] === "pr" && call[1] === "create")).toBe(false);
  });
});

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

  test("uses empty overrides when none are given", async () => {
    const errors: string[] = [];
    const errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
      errors.push(parts.join(" "));
    });
    try {
      await run([]);
    } finally {
      errorSpy.mockRestore();
    }
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("usage");
  });

  test("--no-promote skips with exit 0", async () => {
    const { logs } = await runCaptured(["--spec", "629", "--no-promote"]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(logs.join("\n")).toContain("after-spec is none");
  });

  test("a dry run in promote mode opens nothing and exits 0", async () => {
    const { logs } = await runCaptured(["--spec", "629", "--dry-run"], {
      mode: "promote",
      readChangedPaths: () => Promise.resolve([]),
    });
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

    test("writes the marker under the real git common directory when no override is given", async () => {
      const repo = makeRoot();
      execFileSync("git", ["init", "-q", repo]);
      const originalCwd = process.cwd();
      process.chdir(repo);
      try {
        await runCaptured(["--spec", "629", "--hold"], {});
      } finally {
        process.chdir(originalCwd);
      }
      const gitDirectory = execFileSync("git", ["-C", repo, "rev-parse", "--absolute-git-dir"], {
        encoding: "utf8",
      }).trim();
      expect(existsSync(path.join(gitDirectory, ".emet", "runs", "629", "no-promote"))).toBe(true);
      expect(existsSync(path.join(gitDirectory, "promote hold marker"))).toBe(false);
    });

    test("an old-path-only marker holds the spec", () => {
      const { repoRoot, commonDirectory } = makeSetup();
      const oldMarker = path.join(
        commonDirectory,
        "promote hold marker",
        ".emet",
        "runs",
        "629",
        "no-promote",
      );
      mkdirSync(path.dirname(oldMarker), { recursive: true });
      writeFileSync(oldMarker, "");
      expect(existsSync(holdMarkerPath(commonDirectory, "629"))).toBe(false);
      expect(isSpecHeld(commonDirectory, repoRoot, "629")).toBe(true);
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

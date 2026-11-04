import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_FORGE_CONFIG,
  ForgeConfigError,
  loadForgeConfig,
  loadForgeConfigWithDefaults,
  requireForgeConfig,
  resolveWorkerModel,
  type ForgeConfig,
} from "./config";
import { errorMessage } from "./narrow";

type LoadResult = Awaited<ReturnType<typeof loadForgeConfig>>;

function configOf(result: LoadResult): ForgeConfig {
  if (result.status !== "ok") throw new Error(`expected an ok config, got ${result.status}`);
  return result.config;
}

function reasonOf(result: LoadResult): string {
  if (result.status !== "malformed")
    throw new Error(`expected a malformed config, got ${result.status}`);
  return result.reason;
}

/**
 * `config.ts` gates whether `cleanup` (which force-deletes branches) and
 * `preflight`/`claims`/`slots` run at all — a wrong `repo.trunk` here doesn't
 * just warn, it deletes unmerged work (see `cleanup.ts`'s own file-level doc
 * comment). These tests exercise `validateAndMerge`'s two-tier absent/
 * malformed logic indirectly through `loadForgeConfig` (the only exported
 * entry point), since a repo's own `forge.config.json` is the only realistic
 * way this logic is ever invoked.
 */

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(path.join(os.tmpdir(), "forge-config-test-"));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

async function writeConfig(value: unknown): Promise<void> {
  await Bun.write(
    path.join(repoRoot, "emet.config.json"),
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

describe("loadForgeConfig", () => {
  test("absent when emet.config.json does not exist", async () => {
    expect(await loadForgeConfig(repoRoot)).toEqual({ status: "absent" });
  });

  test("reads a legacy forge.config.json when emet.config.json is absent", async () => {
    await Bun.write(
      path.join(repoRoot, "forge.config.json"),
      JSON.stringify({ repo: { trunk: "legacy-trunk", remote: "origin" } }),
    );
    expect(configOf(await loadForgeConfig(repoRoot)).repo.trunk).toBe("legacy-trunk");
  });

  test("emet.config.json wins over forge.config.json", async () => {
    await Bun.write(
      path.join(repoRoot, "forge.config.json"),
      JSON.stringify({ repo: { trunk: "legacy-trunk", remote: "origin" } }),
    );
    await writeConfig({ repo: { trunk: "new-trunk", remote: "origin" } });
    expect(configOf(await loadForgeConfig(repoRoot)).repo.trunk).toBe("new-trunk");
  });

  test("malformed on invalid JSON", async () => {
    await writeConfig("{not json");
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(/not valid JSON/);
  });

  test("malformed when the top-level value is not an object", async () => {
    await writeConfig(["not", "an", "object"]);
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(/top-level value must be a JSON object/);
  });

  test("an empty object merges cleanly onto every default", async () => {
    await writeConfig({});
    const result = await loadForgeConfig(repoRoot);
    expect(result).toEqual({ status: "ok", config: DEFAULT_FORGE_CONFIG });
  });

  test("a fully-specified config round-trips exactly", async () => {
    const full: ForgeConfig = {
      version: 1,
      repo: { trunk: "develop", remote: "upstream" },
      ticket: { idPattern: "^NFK-\\d+$", branchPrefix: "nfk" },
      concurrency: { waveSize: 2, maxLiveWorkers: 4, runIdleThresholdMs: 60_000 },
      tracker: { kind: "github" },
      preflight: {
        requiredFiles: [{ path: ".env.keys", why: "needed for tests" }],
        requiredCommands: ["gh"],
      },
      handoff: {
        maxLines: 30,
        maxChars: 4000,
        autoChain: true,
        launcher: "orca",
        permissionMode: "acceptEdits",
      },
      landing: { mode: "merge" },
      pr: { autoMerge: false, mergeMethod: "merge", maxCiFixAttempts: 3 },
      usage: { oversizedReadLines: 200, stalledMinutes: 5 },
      models: {
        worker: { model: "opus", effort: "high" },
        reviewer: {
          medium: { model: "sonnet", effort: "low" },
          high: { model: "opus", effort: "max" },
        },
        triage: "sonnet",
        escalation: { sonnet: "opus", haiku: "sonnet" },
      },
      review: { highRiskPaths: ["billing"] },
      budgets: { workerAttempts: 3, reviewRounds: 4, stallNudgeCap: 9 },
      sizing: { inlineMaxLines: 50 },
      map: { path: "docs/map.md" },
      specs: { dir: "docs/s" },
    };
    await writeConfig(full);
    expect(await loadForgeConfig(repoRoot)).toEqual({ status: "ok", config: full });
  });

  test("a partial config merges only the provided sections onto defaults", async () => {
    await writeConfig({ repo: { trunk: "develop" } });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("ok");
    const config = configOf(result);
    expect(config.repo).toEqual({ trunk: "develop", remote: "origin" });
    expect(config.ticket).toEqual(DEFAULT_FORGE_CONFIG.ticket);
    expect(config.concurrency).toEqual(DEFAULT_FORGE_CONFIG.concurrency);
  });

  test("rejects an unsupported version", async () => {
    await writeConfig({ version: 2 });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(/unsupported "version"/);
  });

  test("rejects an empty repo.trunk", async () => {
    await writeConfig({ repo: { trunk: "" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"repo.trunk" must be a non-empty string/);
  });

  test("rejects an empty repo.remote", async () => {
    await writeConfig({ repo: { remote: "" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"repo.remote" must be a non-empty string/);
  });

  test("rejects an invalid ticket.idPattern regex", async () => {
    await writeConfig({ ticket: { idPattern: "(unterminated" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"ticket.idPattern" is not a valid regular expression/);
  });

  test("rejects a ticket.branchPrefix with uppercase or invalid characters", async () => {
    await writeConfig({ ticket: { branchPrefix: "AO_1" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"ticket.branchPrefix" must be a non-empty lowercase string/);
  });

  test.each([
    [
      "handoff.autoChain",
      { handoff: { autoChain: "yes" } },
      /"handoff.autoChain" must be a boolean/,
    ],
    ["handoff.launcher", { handoff: { launcher: "tmux" } }, /"handoff.launcher" must be one of/],
    [
      "handoff.permissionMode",
      { handoff: { permissionMode: "plan" } },
      /"handoff.permissionMode" must be one of/,
    ],
    ["landing.mode", { landing: { mode: "push" } }, /"landing.mode" must be one of pr\|merge/],
    ["pr.autoMerge", { pr: { autoMerge: 1 } }, /"pr.autoMerge" must be a boolean/],
    ["pr.mergeMethod", { pr: { mergeMethod: "fast-forward" } }, /"pr.mergeMethod" must be one of/],
    [
      "pr.maxCiFixAttempts",
      { pr: { maxCiFixAttempts: -1 } },
      /"pr.maxCiFixAttempts" must be a non-negative integer/,
    ],
  ])("rejects an invalid %s", async (_field, patch, reason) => {
    await writeConfig(patch);
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(reason);
  });

  test("landing.mode defaults to pr and accepts merge", async () => {
    await writeConfig({});
    expect(configOf(await loadForgeConfig(repoRoot)).landing).toEqual({ mode: "pr" });
    await writeConfig({ landing: { mode: "merge" } });
    expect(configOf(await loadForgeConfig(repoRoot)).landing).toEqual({ mode: "merge" });
  });

  test("accepts pr and handoff.autoChain overrides, including maxCiFixAttempts 0", async () => {
    await writeConfig({
      handoff: { autoChain: true },
      pr: { autoMerge: false, mergeMethod: "rebase", maxCiFixAttempts: 0 },
    });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("ok");
    const config = configOf(result);
    expect(config.handoff.autoChain).toBe(true);
    expect(config.pr).toEqual({ autoMerge: false, mergeMethod: "rebase", maxCiFixAttempts: 0 });
  });

  test.each([
    ["concurrency.waveSize", { concurrency: { waveSize: 0 } }],
    ["concurrency.maxLiveWorkers", { concurrency: { maxLiveWorkers: -1 } }],
    ["concurrency.runIdleThresholdMs", { concurrency: { runIdleThresholdMs: 1.5 } }],
    ["handoff.maxLines", { handoff: { maxLines: 0 } }],
    ["handoff.maxChars", { handoff: { maxChars: -100 } }],
    ["usage.oversizedReadLines", { usage: { oversizedReadLines: 0 } }],
    ["usage.stalledMinutes", { usage: { stalledMinutes: -5 } }],
  ])("rejects a non-positive-integer %s", async (field, patch) => {
    await writeConfig(patch);
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toContain(`"${field}"`);
  });

  test('accepts "auto" for concurrency.maxLiveWorkers', async () => {
    await writeConfig({ concurrency: { maxLiveWorkers: "auto" } });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("ok");
    expect(configOf(result).concurrency.maxLiveWorkers).toBe("auto");
  });

  test('rejects a concurrency.maxLiveWorkers string other than "auto"', async () => {
    await writeConfig({ concurrency: { maxLiveWorkers: "unlimited" } });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(
      /"concurrency.maxLiveWorkers" must be a positive integer, or the string "auto"/,
    );
  });

  test('defaults concurrency.maxLiveWorkers to "auto" when omitted', async () => {
    await writeConfig({});
    const result = await loadForgeConfig(repoRoot);
    expect(configOf(result).concurrency.maxLiveWorkers).toBe("auto");
  });

  test("rejects preflight.requiredFiles when not an array", async () => {
    await writeConfig({ preflight: { requiredFiles: "nope" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"preflight.requiredFiles" must be an array/);
  });

  test('rejects a preflight.requiredFiles entry missing "why"', async () => {
    await writeConfig({ preflight: { requiredFiles: [{ path: ".env.keys" }] } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(
      /"preflight.requiredFiles\[0\]" must be \{"path": string, "why": string\}/,
    );
  });

  test("an unrecognized top-level key is never an error", async () => {
    await writeConfig({ tracker: { kind: "github" }, someFutureField: true });
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("ok");
  });

  test("reads tracker.kind", async () => {
    await writeConfig({ tracker: { kind: "github" } });
    const result = await loadForgeConfig(repoRoot);
    expect(configOf(result).tracker).toEqual({
      kind: "github",
    });
  });

  test("keeps the rest of the prose tracker section out of the way", async () => {
    await writeConfig({ tracker: { kind: "linear", readyLabel: "ready-for-agent" } });
    const result = await loadForgeConfig(repoRoot);
    expect(configOf(result).tracker).toEqual({
      kind: "linear",
    });
  });

  test("a config predating tracker.kind reads as null, never a guessed default", async () => {
    await writeConfig({ repo: { trunk: "main" } });
    const result = await loadForgeConfig(repoRoot);
    expect(configOf(result).tracker).toEqual({
      kind: null,
    });
  });

  test("rejects a tracker.kind outside the enum", async () => {
    await writeConfig({ tracker: { kind: "jira" } });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"tracker.kind" must be one of linear\|github\|local/);
  });

  test("rejects a non-object tracker", async () => {
    await writeConfig({ tracker: "github" });
    const result = await loadForgeConfig(repoRoot);
    expect(reasonOf(result)).toMatch(/"tracker" must be an object/);
  });

  test("reads preflight.requiredCommands, defaulting to empty", async () => {
    await writeConfig({ preflight: { requiredCommands: ["rg", "sg"] } });
    const result = await loadForgeConfig(repoRoot);
    expect(configOf(result).preflight.requiredCommands).toEqual(["rg", "sg"]);
  });

  test("rejects preflight.requiredCommands when not an array of non-empty strings", async () => {
    await writeConfig({ preflight: { requiredCommands: "rg" } });
    expect(reasonOf(await loadForgeConfig(repoRoot))).toMatch(
      /"preflight.requiredCommands" must be an array/,
    );
    await writeConfig({ preflight: { requiredCommands: [""] } });
    expect(reasonOf(await loadForgeConfig(repoRoot))).toMatch(
      /"preflight.requiredCommands\[0\]" must be a non-empty string/,
    );
  });
});

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("requireForgeConfig", () => {
  test("throws ForgeConfigError naming `emet init` when absent", async () => {
    const error = await captureRejection(requireForgeConfig(repoRoot));
    expect(error).toBeInstanceOf(ForgeConfigError);
    expect(errorMessage(error)).toMatch(/emet init/);
  });

  test("throws ForgeConfigError with the validation reason when malformed", async () => {
    await writeConfig({ version: 2 });
    const error = await captureRejection(requireForgeConfig(repoRoot));
    expect(errorMessage(error)).toMatch(/unsupported "version"/);
  });

  test("returns the merged config when valid", async () => {
    await writeConfig({ repo: { trunk: "develop", remote: "origin" } });
    const config = await requireForgeConfig(repoRoot);
    expect(config.repo.trunk).toBe("develop");
  });
});

describe("loadForgeConfigWithDefaults", () => {
  test("degrades to DEFAULT_FORGE_CONFIG with a note when absent", async () => {
    const result = await loadForgeConfigWithDefaults(repoRoot);
    expect(result.config).toEqual(DEFAULT_FORGE_CONFIG);
    expect(result.note).toMatch(/no emet.config.json/);
  });

  test("still throws ForgeConfigError when malformed — a typo is never mistaken for absent", async () => {
    await writeConfig("{not json");
    const error = await captureRejection(loadForgeConfigWithDefaults(repoRoot));
    expect(error).toBeInstanceOf(ForgeConfigError);
  });

  test("returns the real config with no note when valid", async () => {
    await writeConfig({ repo: { trunk: "develop", remote: "origin" } });
    const result = await loadForgeConfigWithDefaults(repoRoot);
    expect(result.config.repo.trunk).toBe("develop");
    expect(result.note).toBeUndefined();
  });
});

describe("resolveRepoRoot", () => {
  test("null outside a git repository", async () => {
    /**
     * resolveRepoRoot() shells `git rev-parse --show-toplevel` against
     * process.cwd() with no override, and this test file's own cwd (this
     * repo's own checkout) is itself a git repo — the only way to exercise
     * the null branch is a different cwd. A real `process.chdir()` would do
     * that, but `bun test` runs every file's tests in one shared process, so
     * mutating global cwd here can race a concurrently-running test in
     * another file that (correctly) assumes its own cwd is unchanged — a
     * separate `bun -e` subprocess, given the tmpdir as its own `cwd`, is
     * isolated instead.
     */
    const script = `import { resolveRepoRoot } from ${JSON.stringify(path.join(import.meta.dirname, "config.ts"))}; console.log(JSON.stringify(await resolveRepoRoot()))`;
    const proc = Bun.spawn(["bun", "-e", script], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "inherit",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    expect(JSON.parse(output.trim())).toBeNull();
  });
});

describe("models and review sections", () => {
  test("omitting models and review yields today's behavior", async () => {
    await writeConfig({});
    const config = configOf(await loadForgeConfig(repoRoot));
    expect(config.models.worker).toEqual({ model: "sonnet", effort: "medium" });
    expect(config.models.reviewer.medium).toEqual({ model: "opus", effort: "medium" });
    expect(config.models.reviewer.high).toEqual({ model: "opus", effort: "medium" });
    expect(config.models.triage).toBe("haiku");
    expect(config.review.highRiskPaths).toEqual([]);
  });

  test("a partial models section merges onto defaults", async () => {
    await writeConfig({ models: { reviewer: { high: { effort: "max" } } } });
    const config = configOf(await loadForgeConfig(repoRoot));
    expect(config.models.reviewer.high).toEqual({ model: "opus", effort: "max" });
    expect(config.models.reviewer.medium).toEqual(DEFAULT_FORGE_CONFIG.models.reviewer.medium);
    expect(config.models.worker).toEqual(DEFAULT_FORGE_CONFIG.models.worker);
  });

  test.each([
    [{ models: "x" }, /"models" must be an object/],
    [{ models: { worker: { effort: "turbo" } } }, /"models.worker.effort" must be one of/],
    [{ models: { worker: { model: "" } } }, /"models.worker.model"/],
    [{ models: { reviewer: { medium: 3 } } }, /"models.reviewer.medium" must be an object/],
    [{ models: { triage: "" } }, /"models.triage"/],
    [{ budgets: "x" }, /"budgets" must be an object/],
    [{ budgets: { workerAttempts: 0 } }, /"budgets.workerAttempts" must be a positive integer/],
    [{ budgets: { reviewRounds: 1.5 } }, /"budgets.reviewRounds" must be a positive integer/],
    [{ budgets: { stallNudgeCap: -1 } }, /"budgets.stallNudgeCap" must be a positive integer/],
    [{ models: { escalation: [] } }, /"models.escalation" must be an object/],
    [
      { models: { escalation: { sonnet: "" } } },
      /"models.escalation.sonnet" must be a non-empty string/,
    ],
    [{ sizing: { inlineMaxLines: 0 } }, /"sizing.inlineMaxLines" must be a positive integer/],
    [{ map: { path: "" } }, /"map.path" must be a non-empty string/],
    [{ specs: { dir: 3 } }, /"specs.dir" must be a non-empty string/],
    [{ review: { highRiskPaths: "auth" } }, /"review.highRiskPaths" must be an array/],
    [{ review: { highRiskPaths: [""] } }, /"review.highRiskPaths\[0\]"/],
  ])("malformed for %j", async (value, pattern) => {
    await writeConfig(value);
    const result = await loadForgeConfig(repoRoot);
    expect(result.status).toBe("malformed");
    expect(reasonOf(result)).toMatch(pattern);
  });

  test("review.highRiskPaths is read", async () => {
    await writeConfig({ review: { highRiskPaths: ["billing", "ledger"] } });
    const config = configOf(await loadForgeConfig(repoRoot));
    expect(config.review.highRiskPaths).toEqual(["billing", "ledger"]);
  });
});

describe("new scaffold defaults", () => {
  test("defaults match the spec", () => {
    expect(DEFAULT_FORGE_CONFIG.budgets).toEqual({
      workerAttempts: 2,
      reviewRounds: 2,
      stallNudgeCap: 6,
    });
    expect(DEFAULT_FORGE_CONFIG.models.escalation).toEqual({ sonnet: "opus" });
    expect(DEFAULT_FORGE_CONFIG.sizing.inlineMaxLines).toBe(100);
    expect(DEFAULT_FORGE_CONFIG.map.path).toBe("docs/agents/codebase.md");
    expect(DEFAULT_FORGE_CONFIG.specs.dir).toBe("docs/specs");
  });

  test("a partial budgets section keeps the other defaults", async () => {
    await writeConfig({ budgets: { reviewRounds: 5 } });
    const config = configOf(await loadForgeConfig(repoRoot));
    expect(config.budgets).toEqual({ workerAttempts: 2, reviewRounds: 5, stallNudgeCap: 6 });
  });

  test("a user escalation map replaces the default map", async () => {
    await writeConfig({ models: { escalation: { haiku: "sonnet" } } });
    const config = configOf(await loadForgeConfig(repoRoot));
    expect(config.models.escalation).toEqual({ haiku: "sonnet" });
  });
});

describe("resolveWorkerModel", () => {
  test("falls back to models.worker when the ticket names no model", () => {
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG)).toEqual({ model: "sonnet", effort: "medium" });
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, "  ")).toEqual({
      model: "sonnet",
      effort: "medium",
    });
  });

  test("a ticket Model: wins and keeps the configured effort", () => {
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, " opus ")).toEqual({
      model: "opus",
      effort: "medium",
    });
  });

  test("a model/effort ticket value overrides both parts", () => {
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, "opus/high")).toEqual({
      model: "opus",
      effort: "high",
    });
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, " opus / xhigh ")).toEqual({
      model: "opus",
      effort: "xhigh",
    });
  });

  test("an unknown effort part is ignored and an empty model falls back to the config", () => {
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, "opus/turbo")).toEqual({
      model: "opus",
      effort: "medium",
    });
    expect(resolveWorkerModel(DEFAULT_FORGE_CONFIG, "/high")).toEqual(
      DEFAULT_FORGE_CONFIG.models.worker,
    );
  });
});

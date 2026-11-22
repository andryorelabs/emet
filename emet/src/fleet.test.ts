import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentHost } from "./agenthost";
import { claudeHost } from "./agenthost-claude";
import type { SessionAttention } from "./attention";
import {
  defaultLaunchDeps,
  defaultListDeps,
  defaultSetDeps,
  buildFleetStatus,
  launchFleetDraft,
  listFleet,
  run,
  setFleetKey,
  type FleetEntry,
  type FleetLaunchDeps,
} from "./fleet";

let root: string;

function makeRepo(name: string, config: unknown, git = true): string {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  if (git) mkdirSync(path.join(directory, ".git"));
  if (config !== undefined) {
    writeFileSync(path.join(directory, "emet.config.json"), JSON.stringify(config, null, 2));
  }
  return directory;
}

function readConfig(directory: string): unknown {
  return JSON.parse(readFileSync(path.join(directory, "emet.config.json"), "utf8"));
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

function captureOutput(): { out: string[]; err: string[]; restore: () => void } {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    out.push(parts.join(" "));
  });
  const errorSpy = spyOn(console, "error").mockImplementation((...parts: unknown[]) => {
    err.push(parts.join(" "));
  });
  return {
    out,
    err,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "emet-fleet-test-"));
});

afterEach(() => {
  process.exitCode = 0;
  rmSync(root, { recursive: true, force: true });
});

describe("listFleet", () => {
  test("lists the two git repos with a config and skips the one without", async () => {
    makeRepo("alpha", { tracker: { kind: "github" }, handoff: { autoChain: true } });
    makeRepo("beta", { tracker: { kind: "linear" } });
    makeRepo("gamma", undefined);
    makeRepo("delta", { tracker: { kind: "github" } }, false);
    const entries = await listFleet(root, defaultListDeps());
    expect(entries.map((entry) => path.basename(entry.path))).toEqual(["alpha", "beta"]);
    expect(entries[0]).toMatchObject({ tracker: "github", autoChain: true });
    expect(typeof entries[0]?.workerModel).toBe("string");
  });

  test("skips a repo whose config does not load", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    const broken = makeRepo("broken", undefined);
    writeFileSync(path.join(broken, "emet.config.json"), "{ nope");
    const entries = await listFleet(root, defaultListDeps());
    expect(entries.map((entry) => path.basename(entry.path))).toEqual(["alpha"]);
  });
});

describe("setFleetKey", () => {
  test("dry run reports old and new values and writes nothing", async () => {
    const alpha = makeRepo("alpha", { tracker: { kind: "github" }, handoff: { autoChain: true } });
    const before = readFileSync(path.join(alpha, "emet.config.json"), "utf8");
    const entries = await listFleet(root, defaultListDeps());
    const changes = await setFleetKey(
      entries,
      "handoff.autoChain",
      false,
      { dryRun: true },
      defaultSetDeps(),
    );
    expect(changes).toEqual([
      { path: alpha, key: "handoff.autoChain", oldValue: true, newValue: false, written: false },
    ]);
    expect(readFileSync(path.join(alpha, "emet.config.json"), "utf8")).toBe(before);
  });

  test("writes the new value to every repo", async () => {
    const alpha = makeRepo("alpha", { tracker: { kind: "github" }, handoff: { autoChain: true } });
    const beta = makeRepo("beta", { tracker: { kind: "linear" } });
    const entries = await listFleet(root, defaultListDeps());
    const changes = await setFleetKey(
      entries,
      "handoff.autoChain",
      false,
      { dryRun: false },
      defaultSetDeps(),
    );
    expect(changes.every((change) => change.written)).toBe(true);
    expect(changes[1]?.oldValue).toBeNull();
    expect(readConfig(alpha)).toMatchObject({ handoff: { autoChain: false } });
    expect(readConfig(beta)).toMatchObject({ handoff: { autoChain: false } });
  });

  test("an invalid value modifies no repo and throws", async () => {
    const alpha = makeRepo("alpha", { tracker: { kind: "github" } });
    const beta = makeRepo("beta", { tracker: { kind: "linear" } });
    const before = [alpha, beta].map((directory) => readConfig(directory));
    const entries = await listFleet(root, defaultListDeps());
    expect(
      await rejection(
        setFleetKey(entries, "handoff.autoChain", "maybe", { dryRun: false }, defaultSetDeps()),
      ),
    ).toContain("nothing written");
    expect([alpha, beta].map((directory) => readConfig(directory))).toEqual(before);
  });

  test("rejects prototype keys and keys under a non-object value", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    const entries = await listFleet(root, defaultListDeps());
    const deps = defaultSetDeps();
    expect(
      await rejection(setFleetKey(entries, "__proto__.x", 1, { dryRun: true }, deps)),
    ).toContain("invalid key");
    expect(
      await rejection(setFleetKey(entries, "tracker.kind.deep", 1, { dryRun: true }, deps)),
    ).toContain("non-object");
  });
});

function fakeHost(starts: { name: string; prompt: string; cwd: string }[]): AgentHost {
  return {
    ...claudeHost,
    sessions: {
      list: () => Promise.resolve([]),
      start: (request: { name: string; prompt: string; cwd: string }) => {
        if (request.cwd.endsWith("bad")) return Promise.reject(new Error("start failed"));
        starts.push(request);
        return Promise.resolve({ name: request.name, id: "1" });
      },
      attachCommand: (name: string) => `attach ${name}`,
    },
  };
}

function entryFor(name: string): FleetEntry {
  return { path: path.join(root, name), tracker: "github", autoChain: false, workerModel: "x" };
}

describe("launchFleetDraft", () => {
  test("starts a draft session in each ready repo and reports blocked and failing ones", async () => {
    const starts: { name: string; prompt: string; cwd: string }[] = [];
    const deps: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost(starts), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: (repoPath) =>
        Promise.resolve(
          repoPath.endsWith("full")
            ? [{ code: "low-disk", blocking: true, detail: "disk low" }]
            : [{ code: "orca-unavailable", blocking: false, detail: "no orca" }],
        ),
    };
    const results = await launchFleetDraft(
      [entryFor("ok"), entryFor("full"), entryFor("bad")],
      "add dark mode",
      deps,
      { dryRun: false },
    );
    expect(results.map((result) => result.launched)).toEqual([true, false, false]);
    expect(results[1]?.reason).toContain("low-disk");
    expect(results[2]?.reason).toBe("start failed");
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({
      name: "emet-draft-ok",
      prompt: "/emet:run --draft add dark mode",
      cwd: entryFor("ok").path,
    });
  });

  test("reports a repo whose settings fail to load", async () => {
    const deps: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () => Promise.reject(new Error("bad config")),
      checkReadiness: () => Promise.resolve([]),
    };
    const results = await launchFleetDraft([entryFor("ok")], "x", deps, { dryRun: false });
    expect(results[0]).toMatchObject({ launched: false, reason: "bad config" });
  });
});

describe("launchFleetDraft dry run", () => {
  test("runs readiness but never starts a session", async () => {
    const starts: { name: string; prompt: string; cwd: string }[] = [];
    const deps: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost(starts), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: (repoPath) =>
        Promise.resolve(
          repoPath.endsWith("full")
            ? [{ code: "low-disk", blocking: true, detail: "disk low" }]
            : [],
        ),
    };
    const results = await launchFleetDraft([entryFor("ok"), entryFor("full")], "x", deps, {
      dryRun: true,
    });
    expect(starts).toHaveLength(0);
    expect(results[0]).toMatchObject({ launched: false, dryRun: true, name: "emet-draft-ok" });
    expect(results[1]).toMatchObject({ launched: false, dryRun: false });
    expect(results[1]?.reason).toContain("low-disk");
  });
});

describe("default launch deps", () => {
  test("loads repo settings and runs the readiness checks", async () => {
    const directory = makeRepo("alpha", { tracker: { kind: "github" } });
    const calls: string[][] = [];
    const deps = defaultLaunchDeps((command) => {
      calls.push([...command]);
      return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
    });
    const settings = await deps.loadSettings(directory);
    expect(typeof settings.permissionMode).toBe("string");
    const issues = await deps.checkReadiness(directory, "bg");
    expect(Array.isArray(issues)).toBe(true);
  });
});

describe("run", () => {
  test("list prints one row per repo, or JSON", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    makeRepo("beta", { tracker: { kind: "linear" } });
    makeRepo("gamma", undefined);
    const capture = captureOutput();
    await run(["list", "--root", root]);
    await run(["list", "--root", root, "--json"]);
    capture.restore();
    expect(capture.out[0]?.split("\n")).toHaveLength(2);
    expect(JSON.parse(capture.out[1] ?? "[]")).toHaveLength(2);
  });

  test("set --dry-run lists old and new values", async () => {
    makeRepo("alpha", { tracker: { kind: "github" }, handoff: { autoChain: true } });
    const capture = captureOutput();
    await run(["set", "handoff.autoChain", "false", "--root", root, "--dry-run"]);
    capture.restore();
    expect(capture.out[0]).toContain("true -> false (dry run)");
    expect(process.exitCode).toBe(0);
  });

  test("set with an invalid value exits 1", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    const capture = captureOutput();
    await run(["set", "handoff.autoChain", "maybe", "--root", root]);
    capture.restore();
    expect(process.exitCode).toBe(1);
    expect(capture.err.join("\n")).toContain("nothing written");
  });

  test("launch filters by --repos and exits 1 when one fails", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    makeRepo("beta", { tracker: { kind: "github" } });
    const starts: { name: string; prompt: string; cwd: string }[] = [];
    const launch: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost(starts), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: () => Promise.resolve([]),
    };
    const capture = captureOutput();
    await run(["launch", "--feature", "x", "--root", root, "--repos", "alpha"], { launch });
    capture.restore();
    expect(starts).toHaveLength(1);
    expect(capture.out[0]).toContain("launched emet-draft-alpha");
    expect(process.exitCode).toBe(0);
  });

  test("launch --dry-run prints would launch and exits 0 without starting a session", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    const starts: { name: string; prompt: string; cwd: string }[] = [];
    const launch: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost(starts), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: () => Promise.resolve([]),
    };
    process.exitCode = 0;
    const capture = captureOutput();
    await run(["launch", "--feature", "x", "--root", root, "--dry-run"], { launch });
    capture.restore();
    expect(starts).toHaveLength(0);
    expect(capture.out[0]).toContain("would launch emet-draft-alpha");
    expect(process.exitCode).toBe(0);
    const jsonCapture = captureOutput();
    await run(["launch", "--feature", "x", "--root", root, "--dry-run", "--json"], { launch });
    jsonCapture.restore();
    expect(jsonCapture.out[0]).toContain('"launched":false');
    expect(jsonCapture.out[0]).toContain('"dryRun":true');
  });

  test("launch --dry-run still exits 1 on a blocking readiness issue", async () => {
    makeRepo("alpha", { tracker: { kind: "github" } });
    const launch: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost([]), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: () => Promise.resolve([{ code: "low-disk", blocking: true, detail: "x" }]),
    };
    process.exitCode = 0;
    const capture = captureOutput();
    await run(["launch", "--feature", "x", "--root", root, "--dry-run"], { launch });
    capture.restore();
    expect(capture.out[0]).toContain("not launched: low-disk");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  test("launch reports failures as exit 1 and JSON", async () => {
    makeRepo("bad", { tracker: { kind: "github" } });
    const launch: FleetLaunchDeps = {
      runner: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
      loadSettings: () =>
        Promise.resolve({ host: fakeHost([]), launcher: "bg", permissionMode: "auto" }),
      checkReadiness: () => Promise.resolve([]),
    };
    const capture = captureOutput();
    await run(["launch", "--feature", "x", "--root", root, "--json"], { launch });
    capture.restore();
    expect(capture.out[0]).toContain('"launched":false');
    expect(process.exitCode).toBe(1);
  });

  test("usage errors exit 2", async () => {
    const capture = captureOutput();
    await run(["bogus", "--root", root]);
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    await run(["set", "only-key", "--root", root]);
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    await run(["launch", "--root", root]);
    capture.restore();
    expect(process.exitCode).toBe(2);
  });
});

function session(
  sessionId: string,
  repo: string,
  state: SessionAttention["state"],
): SessionAttention {
  return {
    sessionId,
    repo,
    runId: null,
    state,
    blocked: state === "needs-decision",
    since: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildFleetStatus", () => {
  test("groups sessions per repo, blocked repos first, and counts blocked", () => {
    const status = buildFleetStatus([
      session("a", "/r/quiet", "working"),
      session("b", "/r/busy", "needs-decision"),
      session("c", "/r/quiet", "idle"),
      session("d", "/r/other", "needs-decision"),
    ]);
    expect(status.blocked).toBe(2);
    expect(status.repos.map((entry) => entry.repo)).toEqual(["/r/busy", "/r/other", "/r/quiet"]);
    expect(status.repos[2]?.sessions).toHaveLength(2);
  });

  test("is empty for no sessions", () => {
    expect(buildFleetStatus([])).toEqual({ repos: [], blocked: 0 });
  });
});

describe("run status", () => {
  test("prints JSON with both blocked repos", async () => {
    const sessions = [
      session("a", "/r/one", "needs-decision"),
      session("b", "/r/two", "needs-decision"),
    ];
    const capture = captureOutput();
    await run(["status", "--json"], { status: () => sessions });
    capture.restore();
    const parsed: unknown = JSON.parse(capture.out[0] ?? "{}");
    expect(parsed).toMatchObject({ blocked: 2 });
    expect(parsed).toHaveProperty("repos.length", 2);
    expect(Object.keys(buildFleetStatus(sessions).repos[0]?.sessions[0] ?? {}).toSorted()).toEqual(
      ["blocked", "runId", "since", "sessionId", "state"].toSorted(),
    );
  });

  test("prints one line per repo and exits 0 when empty", async () => {
    const capture = captureOutput();
    await run(["status"], {
      status: () => [session("a", "/r/one", "working"), session("b", "/r/one", "idle")],
    });
    await run(["status"], { status: () => [] });
    capture.restore();
    expect(capture.out[0]).toBe("/r/one: 0 blocked, 1 working, 1 idle");
    expect(capture.out[1]).toBe("");
    expect(process.exitCode).not.toBe(2);
  });
});

describe("run status default journal", () => {
  test("reads the journal under the state dir and exits 0 when empty", async () => {
    const previous = process.env.EMET_STATE_DIR;
    process.env.EMET_STATE_DIR = path.join(root, "state");
    const capture = captureOutput();
    try {
      await run(["status", "--json"]);
    } finally {
      capture.restore();
      if (previous === undefined) delete process.env.EMET_STATE_DIR;
      else process.env.EMET_STATE_DIR = previous;
    }
    expect(JSON.parse(capture.out[0] ?? "{}")).toEqual({ repos: [], blocked: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeHost } from "./agenthost-claude";
import { codexHost } from "./agenthost-codex";
import { DEFAULT_CODEX_CONFIG, DEFAULT_FORGE_CONFIG, ForgeConfigError } from "./config";
import { appendEvent, readJournalSegments } from "./journal";
import {
  defaultRunner,
  hasLaunchResult,
  launchSettingsFor,
  resolveWaveContext,
  run,
  launchWave,
  waveSessionName,
  type CommandResult,
  type CommandRunner,
  type LaunchRequest,
} from "./launch";
import { errorMessage } from "./narrow";
import { readPhase } from "./phase";

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

const REQUEST: LaunchRequest = {
  specId: "AO-1880",
  wave: 2,
  repoRoot: "/repo",
  launcher: "auto",
  permissionMode: "bypassPermissions",
};

const OK_EMPTY: CommandResult = { exitCode: 0, stdout: "", stderr: "" };

function json(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: "" };
}

/**
 * Scripted runner: matches on the leading words of the command so a test
 * states only the calls it cares about. `agents` is queried twice per launch
 * (before and after `claude --bg`), so it takes a queue of responses.
 */
function scriptedRunner(script: {
  agents: CommandResult[];
  launch?: CommandResult;
  orcaStatus?: CommandResult;
  orcaCreate?: CommandResult;
}) {
  const calls: string[][] = [];
  const agentQueue = [...script.agents];
  const runner: CommandRunner = (command) => {
    calls.push([...command]);
    const key = command.slice(0, 3).join(" ");
    if (key === "claude agents --json") {
      return Promise.resolve(agentQueue.shift() ?? json([]));
    }
    if (command[0] === "claude" && command[1] === "--bg") {
      return Promise.resolve(script.launch ?? OK_EMPTY);
    }
    if (key === "orca status --json") {
      return Promise.resolve(
        script.orcaStatus ?? { exitCode: 127, stdout: "", stderr: "not found" },
      );
    }
    if (key === "orca terminal create") {
      return Promise.resolve(script.orcaCreate ?? json({ ok: true }));
    }
    return Promise.reject(new Error(`unscripted command: ${command.join(" ")}`));
  };
  return { runner, calls };
}

let journalRoot: string;
let previousStateDir: string | undefined;

beforeEach(() => {
  previousStateDir = process.env.EMET_STATE_DIR;
  journalRoot = mkdtempSync(path.join(os.tmpdir(), "emet-launch-journal-"));
  process.env.EMET_STATE_DIR = path.join(journalRoot, "state");
});

afterEach(() => {
  if (previousStateDir === undefined) Reflect.deleteProperty(process.env, "EMET_STATE_DIR");
  else process.env.EMET_STATE_DIR = previousStateDir;
  rmSync(journalRoot, { recursive: true, force: true });
});

describe("launch journal", () => {
  test("a confirmed launch writes an auto launch.result", async () => {
    const { runner } = scriptedRunner({ agents: [json([]), STARTED] });
    await launchWave({ ...REQUEST, launcher: "bg" }, runner);
    const events = readJournalSegments().events;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "launch.result",
      origin: "auto",
      data: {
        spec: "AO-1880",
        wave: 2,
        name: "emet-AO-1880-w2",
        outcome: "started",
        via: "launch",
      },
    });
  });

  test("a refused launch writes nothing", async () => {
    const { runner } = scriptedRunner({ agents: [json([{ name: "emet-AO-1880-w2" }])] });
    await rejectionOf(launchWave(REQUEST, runner));
    expect(readJournalSegments().events).toEqual([]);
  });

  test("an unwritable journal does not fail the launch", async () => {
    const blocker = path.join(journalRoot, "blocker");
    writeFileSync(blocker, "file");
    process.env.EMET_STATE_DIR = blocker;
    const { runner } = scriptedRunner({ agents: [json([]), STARTED] });
    const outcome = await launchWave({ ...REQUEST, launcher: "bg" }, runner);
    expect(outcome.name).toBe("emet-AO-1880-w2");
  });

  test("hasLaunchResult matches on spec and, when known, wave", () => {
    appendEvent({
      kind: "launch.result",
      repo: "/repo",
      origin: "auto",
      data: { spec: "7", wave: 2 },
    });
    expect(hasLaunchResult({ spec: "7", wave: 2 })).toBe(true);
    expect(hasLaunchResult({ spec: "7", wave: null })).toBe(true);
    expect(hasLaunchResult({ spec: "7", wave: 3 })).toBe(false);
    expect(hasLaunchResult({ spec: "8", wave: 2 })).toBe(false);
    expect(hasLaunchResult({ spec: null, wave: null })).toBe(false);
  });

  test("resolveWaveContext reads the spec from the run id when no phase exists", () => {
    expect(resolveWaveContext(journalRoot, "emet621w2233041")).toEqual({ spec: "621", wave: null });
    expect(resolveWaveContext(journalRoot, "r1")).toEqual({ spec: null, wave: null });
    expect(resolveWaveContext(journalRoot)).toEqual({ spec: null, wave: null });
  });
});

const STARTED = json([{ id: "abc12345", name: "emet-AO-1880-w2" }]);
const REACHABLE = json({ ok: true, result: { runtime: { reachable: true } } });

describe("waveSessionName", () => {
  test("matches the name the phases doc tells users to attach to", () => {
    expect(waveSessionName("AO-1880", 3)).toBe("emet-AO-1880-w3");
  });
});

describe("launchWave", () => {
  test("auto opens an Orca tab when the runtime is reachable, without TERM_PROGRAM", async () => {
    const previous = process.env.TERM_PROGRAM;
    delete process.env.TERM_PROGRAM;
    try {
      const { runner, calls } = scriptedRunner({
        agents: [json([]), STARTED],
        orcaStatus: REACHABLE,
      });
      const outcome = await launchWave(REQUEST, runner);

      expect(outcome.orcaTab.opened).toBe(true);
      expect(outcome.id).toBe("abc12345");
      expect(outcome.attach).toBe("claude attach emet-AO-1880-w2");
      const create = calls.find((c) => c[0] === "orca" && c[2] === "create");
      expect(create).toContain("path:/repo");
      expect(create).toContain(
        `bash -c '${Bun.which("claude") ?? "claude"} attach emet-AO-1880-w2'`,
      );
    } finally {
      if (previous !== undefined) process.env.TERM_PROGRAM = previous;
    }
  });

  test("writes the dispatch phase once the session is up", async () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "emet-launch-phase-"));
    try {
      const { runner } = scriptedRunner({ agents: [json([]), STARTED], orcaStatus: REACHABLE });
      await launchWave({ ...REQUEST, repoRoot }, runner);
      const record = readPhase(repoRoot);
      expect(record?.phase).toBe("dispatch");
      expect(record?.wave).toBe(2);
      expect(record?.spec).toBe("AO-1880");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  test("launches the wave with the configured permission mode", async () => {
    const { runner, calls } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: REACHABLE,
    });
    await launchWave({ ...REQUEST, permissionMode: "acceptEdits" }, runner);

    const launch = calls.find((c) => c[0] === "claude" && c[1] === "--bg");
    expect(launch).toEqual([
      "claude",
      "--bg",
      "--name",
      "emet-AO-1880-w2",
      "--permission-mode",
      "acceptEdits",
      "/emet:run --dispatch AO-1880",
    ]);
  });

  test("auto skips the tab when the Orca runtime is not reachable", async () => {
    const { runner, calls } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: json({ ok: true, result: { runtime: { reachable: false } } }),
    });
    const outcome = await launchWave(REQUEST, runner);

    expect(outcome.orcaTab.opened).toBe(false);
    expect(calls.some((c) => c[0] === "orca" && c[2] === "create")).toBe(false);
  });

  test("auto skips the tab when the orca CLI is missing", async () => {
    const { runner } = scriptedRunner({ agents: [json([]), STARTED] });
    const outcome = await launchWave(REQUEST, runner);

    expect(outcome.orcaTab.opened).toBe(false);
    expect(outcome.orcaTab.reason).toContain("unavailable");
  });

  test("bg never touches orca", async () => {
    const { runner, calls } = scriptedRunner({ agents: [json([]), STARTED] });
    const outcome = await launchWave({ ...REQUEST, launcher: "bg" }, runner);

    expect(outcome.orcaTab.opened).toBe(false);
    expect(calls.some((c) => c[0] === "orca")).toBe(false);
  });

  test("orca skips the status check and always tries to open the tab", async () => {
    const { runner, calls } = scriptedRunner({ agents: [json([]), STARTED] });
    const outcome = await launchWave({ ...REQUEST, launcher: "orca" }, runner);

    expect(outcome.orcaTab.opened).toBe(true);
    expect(calls.some((c) => c[0] === "orca" && c[1] === "status")).toBe(false);
  });

  test("a failed tab does not fail the launch", async () => {
    const { runner } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: REACHABLE,
      orcaCreate: { exitCode: 1, stdout: "", stderr: "no window" },
    });
    const outcome = await launchWave(REQUEST, runner);

    expect(outcome.name).toBe("emet-AO-1880-w2");
    expect(outcome.orcaTab.opened).toBe(false);
    expect(outcome.orcaTab.reason).toContain("no window");
  });

  test("an earlier wave of the same spec does not block the next wave", async () => {
    const { runner, calls } = scriptedRunner({
      agents: [json([{ id: "old", name: "forge-AO-1880-w1" }]), STARTED],
    });
    const outcome = await launchWave({ ...REQUEST, launcher: "bg" }, runner);

    expect(outcome.name).toBe("emet-AO-1880-w2");
    expect(calls.some((c) => c[0] === "claude" && c[1] === "--bg")).toBe(true);
  });

  test("a session of the requested wave blocks the launch", async () => {
    const { runner, calls } = scriptedRunner({
      agents: [json([{ id: "old", name: "forge-AO-1880-w2" }])],
    });

    expect(await rejectionOf(launchWave(REQUEST, runner))).toBeInstanceOf(ForgeConfigError);
    expect(calls.some((c) => c[0] === "claude" && c[1] === "--bg")).toBe(false);
  });

  test("a later wave of the same spec blocks the launch", async () => {
    const { runner, calls } = scriptedRunner({
      agents: [json([{ id: "old", name: "emet-AO-1880-w3" }])],
    });

    expect(await rejectionOf(launchWave(REQUEST, runner))).toBeInstanceOf(ForgeConfigError);
    expect(calls.some((c) => c[0] === "claude" && c[1] === "--bg")).toBe(false);
  });

  test("a same-spec session with an unreadable wave blocks the launch", async () => {
    const { runner } = scriptedRunner({
      agents: [json([{ id: "old", name: "emet-AO-1880-manual" }])],
    });

    expect(await rejectionOf(launchWave(REQUEST, runner))).toBeInstanceOf(ForgeConfigError);
  });

  test("another spec with a shared prefix does not block the launch", async () => {
    const { runner } = scriptedRunner({
      agents: [json([{ id: "x", name: "emet-AO-18800-w1" }]), STARTED],
    });
    const outcome = await launchWave({ ...REQUEST, launcher: "bg" }, runner);

    expect(outcome.name).toBe("emet-AO-1880-w2");
  });

  test("fails when claude --bg exits non-zero", async () => {
    const { runner } = scriptedRunner({
      agents: [json([])],
      launch: { exitCode: 1, stdout: "", stderr: "workspace not trusted" },
    });

    expect(errorMessage(await rejectionOf(launchWave(REQUEST, runner)))).toContain(
      "workspace not trusted",
    );
  });

  test("fails when the session never shows up in claude agents", async () => {
    const { runner } = scriptedRunner({ agents: [json([]), json([])] });

    expect(errorMessage(await rejectionOf(launchWave(REQUEST, runner)))).toContain(
      "no session named",
    );
  });
});

describe("launchSettingsFor", () => {
  test("uses the Claude host and the handoff settings by default", () => {
    const settings = launchSettingsFor(DEFAULT_FORGE_CONFIG);
    expect(settings.host).toBe(claudeHost);
    expect(settings.launcher).toBe(DEFAULT_FORGE_CONFIG.handoff.launcher);
    expect(settings.permissionMode).toBe(DEFAULT_FORGE_CONFIG.handoff.permissionMode);
  });

  test("uses the Codex host, no Orca tab and the configured sandbox on Codex", () => {
    const settings = launchSettingsFor({ ...DEFAULT_FORGE_CONFIG, agentHost: "codex" });
    expect(settings.host).toBe(codexHost);
    expect(settings.launcher).toBe("bg");
    expect(settings.permissionMode).toBe("danger-full-access");
  });

  test("passes a configured workspace-write sandbox on Codex", () => {
    const settings = launchSettingsFor({
      ...DEFAULT_FORGE_CONFIG,
      agentHost: "codex",
      codex: { ...DEFAULT_CODEX_CONFIG, sandbox: "workspace-write" },
    });
    expect(settings.permissionMode).toBe("workspace-write");
  });
});

describe("orca decisions on unreadable output", () => {
  test("auto skips the tab when orca status is not JSON", async () => {
    const { runner } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: { exitCode: 0, stdout: "not json", stderr: "" },
    });
    const outcome = await launchWave(REQUEST, runner);
    expect(outcome.orcaTab.opened).toBe(false);
    expect(outcome.orcaTab.reason).toContain("not JSON");
  });

  test("auto skips the tab when orca status has no runtime object", async () => {
    const { runner } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: json({ ok: true }),
    });
    const outcome = await launchWave(REQUEST, runner);
    expect(outcome.orcaTab.opened).toBe(false);
    expect(outcome.orcaTab.reason).toContain("not reachable");
  });

  test("a tab whose create output is not JSON is reported as not opened", async () => {
    const { runner } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: REACHABLE,
      orcaCreate: { exitCode: 0, stdout: "oops", stderr: "" },
    });
    const outcome = await launchWave(REQUEST, runner);
    expect(outcome.orcaTab).toEqual({
      opened: false,
      reason: "orca terminal create output was not JSON",
    });
  });

  test("a tab whose create output has ok=false is reported as not opened", async () => {
    const { runner } = scriptedRunner({
      agents: [json([]), STARTED],
      orcaStatus: REACHABLE,
      orcaCreate: json({ ok: false }),
    });
    const outcome = await launchWave(REQUEST, runner);
    expect(outcome.orcaTab).toEqual({
      opened: false,
      reason: "orca terminal create returned ok=false",
    });
  });
});

describe("defaultRunner", () => {
  test("captures stdout, stderr and the exit code", async () => {
    const result = await defaultRunner(["sh", "-c", "echo out; echo err >&2; exit 3"]);
    expect(result).toEqual({ exitCode: 3, stdout: "out\n", stderr: "err\n" });
  });

  test("runs in the requested directory", async () => {
    const directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-launch-cwd-")));
    try {
      const result = await defaultRunner(["pwd"], { cwd: directory });
      expect(result.stdout.trim()).toBe(directory);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("reports exit 127 when the binary does not exist", async () => {
    const result = await defaultRunner(["emet-no-such-binary-xyz"]);
    expect(result.exitCode).toBe(127);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe("run", () => {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  let logs: string[];
  let errors: string[];
  let directory = "";

  beforeEach(() => {
    logs = [];
    errors = [];
    console.log = (...parts: unknown[]) => {
      logs.push(parts.join(" "));
    };
    console.error = (...parts: unknown[]) => {
      errors.push(parts.join(" "));
    };
    process.exitCode = 0;
    directory = realpathSync(mkdtempSync(path.join(os.tmpdir(), "emet-launch-run-")));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    rmSync(directory, { recursive: true, force: true });
  });

  function enterRepo(): void {
    const result = Bun.spawnSync(["git", "init", "-q", directory]);
    if (result.exitCode !== 0) throw new Error("git init failed");
    process.chdir(directory);
  }

  test.each([[[]], [["AO-1880", "--help"]]])("%j prints the usage and exits 2", async (argv) => {
    await run(argv);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("usage: emet launch");
  });

  test.each([
    [["--wave", "2"]],
    [["AO-1880"]],
    [["AO-1880", "--wave", "0"]],
    [["AO-1880", "--wave", "1.5"]],
    [["AO-1880", "--wave", "x"]],
  ])("%j is rejected as a usage error with exit 2", async (argv) => {
    await run(argv);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("usage: emet launch");
  });

  test("exits 2 outside a git repository", async () => {
    process.chdir(directory);
    await run(["AO-1880", "--wave", "2"]);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("not inside a git repository");
  });

  test("launches the wave and prints the outcome as JSON", async () => {
    enterRepo();
    const { runner, calls } = scriptedRunner({ agents: [json([]), STARTED] });
    await run(["AO-1880", "--wave", "2"], runner);
    expect(process.exitCode).toBe(0);
    const printed: unknown = JSON.parse(logs.join("\n"));
    expect(printed).toMatchObject({ name: "emet-AO-1880-w2", id: "abc12345" });
    expect(calls.some((c) => c[0] === "claude" && c[1] === "--bg")).toBe(true);
  });

  test("exits 2 when a session for the spec already exists", async () => {
    enterRepo();
    const { runner } = scriptedRunner({ agents: [json([{ id: "o", name: "emet-AO-1880-w2" }])] });
    await run(["AO-1880", "--wave", "2"], runner);
    expect(process.exitCode).toBe(2);
    expect(errors.join("\n")).toContain("already exists");
  });

  test("exits 1 when claude fails to start", async () => {
    enterRepo();
    const { runner } = scriptedRunner({
      agents: [json([])],
      launch: { exitCode: 1, stdout: "", stderr: "workspace not trusted" },
    });
    await run(["AO-1880", "--wave", "2"], runner);
    expect(process.exitCode).toBe(1);
    expect(errors.join("\n")).toContain("workspace not trusted");
  });
});

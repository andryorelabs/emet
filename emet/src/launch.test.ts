import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { claudeHost } from "./agenthost-claude";
import { codexHost } from "./agenthost-codex";
import { DEFAULT_FORGE_CONFIG, ForgeConfigError } from "./config";
import { errorMessage } from "./narrow";
import { readPhase } from "./phase";
import {
  launchSettingsFor,
  launchWave,
  waveSessionName,
  type CommandResult,
  type CommandRunner,
  type LaunchRequest,
} from "./launch";

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
    expect(settings.permissionMode).toBe("workspace-write");
  });
});

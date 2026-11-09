import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "./narrow";
import { didReserveTicket } from "./claims";
import { readCodexState } from "./codex-process";
import { EXIT_BASE_CHECK_FAILED, EXIT_WAIT_TIMEOUT, run, type DispatchDeps } from "./dispatch";
import { writeResult } from "./results";
import { acquireSlot } from "./slots";

const FAKE = path.resolve(import.meta.dir, "../../tools/fixtures/fake-codex/codex");
const LIVE_PID = 424_242;
const RUN = "run-a";
const TICKET = "AO-1";
const ALIVE = { isAnchorAliveFn: (pid: number) => pid === LIVE_PID };

let temp: string;
let repo: string;
let forgeDirectory: string;
let slotsDirectory: string;
let sourceHome: string;
let logFile: string;
let baseline: string;

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function deps(script: Record<string, unknown> = {}): DispatchDeps {
  const scriptFile = path.join(temp, "script.json");
  writeFileSync(scriptFile, JSON.stringify(script));
  return {
    forgeDirectory,
    slotsDirectory,
    sourceHome,
    cachePath: path.join(temp, "no-models-cache.json"),
    executable: FAKE,
    env: { FAKE_CODEX_LOG: logFile, FAKE_CODEX_SCRIPT: scriptFile },
  };
}

function writeDispatchRecord(commit: string): void {
  const file = path.join(repo, ".emet", "runs", RUN, "dispatch", `${TICKET}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ baseline: commit, surfaces: [] }));
}

async function claimAndSlot(): Promise<void> {
  await didReserveTicket(RUN, LIVE_PID, TICKET, forgeDirectory, ALIVE);
  await acquireSlot(2, RUN, LIVE_PID, TICKET, slotsDirectory, ALIVE);
}

function dispatchArguments(extra: string[] = []): string[] {
  const promptFile = path.join(temp, "prompt.md");
  writeFileSync(promptFile, "do the ticket");
  return [
    "--role",
    "worker",
    "--run",
    RUN,
    "--ticket",
    TICKET,
    "--prompt-file",
    promptFile,
    "--root",
    repo,
    ...extra,
  ];
}

function readFirstInvocation(): { argv: string[]; codexHome: unknown } {
  const parsed: unknown = JSON.parse(readFileSync(logFile, "utf8").trim().split("\n")[0] ?? "{}");
  if (!isObject(parsed) || !Array.isArray(parsed["argv"])) throw new Error("bad fake log");
  const env = isObject(parsed["env"]) ? parsed["env"] : {};
  return { argv: parsed["argv"].map(String), codexHome: env["CODEX_HOME"] };
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling on purpose
    await Bun.sleep(50);
  }
  if (!condition()) throw new Error("condition not met in time");
}

beforeEach(() => {
  temp = mkdtempSync(path.join(os.tmpdir(), "emet-dispatch-"));
  repo = path.join(temp, "repo");
  forgeDirectory = path.join(temp, "forge");
  slotsDirectory = path.join(temp, "slots");
  sourceHome = path.join(temp, "codex-source");
  logFile = path.join(temp, "fake.log");
  mkdirSync(repo);
  mkdirSync(sourceHome);
  mkdirSync(slotsDirectory);
  writeFileSync(path.join(sourceHome, "auth.json"), "{}");
  git(repo, "init", "-q", "-b", "develop");
  git(
    repo,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "init",
  );
  baseline = git(repo, "rev-parse", "HEAD");
  writeDispatchRecord(baseline);
});

afterEach(() => {
  rmSync(temp, { recursive: true, force: true });
});

describe("dispatch worker", () => {
  test("creates the worktree, lock, overlay, rules and state, and starts the fake", async () => {
    await claimAndSlot();
    const before = readdirSync(sourceHome);
    expect(await run(dispatchArguments(), deps())).toBe(0);

    const worktree = path.join(repo, ".emet", "worktrees", `agent-${TICKET}`);
    expect(git(worktree, "rev-parse", "HEAD")).toBe(baseline);
    expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`worktree-agent-${TICKET}`);
    expect(git(repo, "worktree", "list", "--porcelain")).toContain(
      `locked emet run=${RUN} ticket=${TICKET} anchor=${LIVE_PID}`,
    );

    const home = path.join(repo, ".emet", "runs", RUN, "codex-home");
    const rules = readFileSync(path.join(home, "rules", "default.rules"), "utf8");
    expect(rules).toContain('pattern = ["git", "push"], decision = "forbidden"');
    expect(existsSync(path.join(home, "hooks.json"))).toBe(true);

    const stateFile = path.join(repo, ".emet", "runs", RUN, "codex", `${TICKET}.state.json`);
    expect(readCodexState(stateFile)?.pid).toBeGreaterThan(0);

    await waitUntil(() => existsSync(logFile));
    const logged = readFirstInvocation();
    const argv = logged.argv;
    expect(argv.slice(0, 3)).toEqual(["exec", "-C", worktree]);
    expect(argv).toContain("model_reasoning_effort=medium");
    expect(argv[argv.indexOf("-s") + 1]).toBe("danger-full-access");
    expect(argv).toContain("--json");
    expect(argv).toContain("--dangerously-bypass-hook-trust");
    expect(argv.at(-1)).toBe("do the ticket");
    expect(argv).not.toContain("ultra");
    expect(logged.codexHome).toBe(home);
    expect(readdirSync(sourceHome)).toEqual(before);
  });

  test("passes a configured workspace-write sandbox", async () => {
    writeFileSync(
      path.join(repo, "emet.config.json"),
      JSON.stringify({ agentHost: "codex", codex: { sandbox: "workspace-write" } }),
    );
    await claimAndSlot();
    expect(await run(dispatchArguments(), deps())).toBe(0);
    await waitUntil(() => existsSync(logFile));
    const { argv } = readFirstInvocation();
    expect(argv[argv.indexOf("-s") + 1]).toBe("workspace-write");
  });

  test("passes --model and --effort overrides and refuses ultra", async () => {
    await claimAndSlot();
    const errors = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(dispatchArguments(["--effort", "ultra"]), deps())).toBe(2);
    errors.mockRestore();
    expect(existsSync(path.join(repo, ".emet", "worktrees"))).toBe(false);

    expect(await run(dispatchArguments(["--model", "m-x", "--effort", "low"]), deps())).toBe(0);
    await waitUntil(() => existsSync(logFile));
    const { argv } = readFirstInvocation();
    expect(argv).toContain("m-x");
    expect(argv).toContain("model_reasoning_effort=low");
  });

  test("exits 1 and creates nothing without a claim or a slot", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(dispatchArguments(), deps())).toBe(1);
    await didReserveTicket(RUN, LIVE_PID, TICKET, forgeDirectory, ALIVE);
    expect(await run(dispatchArguments(), deps())).toBe(1);
    errors.mockRestore();
    expect(existsSync(path.join(repo, ".emet", "worktrees"))).toBe(false);
    expect(existsSync(path.join(repo, ".emet", "runs", RUN, "codex-home"))).toBe(false);
  });

  test("exits 42 when the baseline is not a commit", async () => {
    await claimAndSlot();
    writeDispatchRecord("0".repeat(40));
    const errors = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(dispatchArguments(), deps())).toBe(EXIT_BASE_CHECK_FAILED);
    errors.mockRestore();
    expect(existsSync(path.join(repo, ".emet", "worktrees"))).toBe(false);
  });
});

describe("dispatch --wait", () => {
  test("prints the recorded result status once the worker exits", async () => {
    await claimAndSlot();
    expect(await run(dispatchArguments(), deps())).toBe(0);
    writeResult(path.join(repo, ".emet", "runs", RUN, "results"), TICKET, {
      status: "DONE",
      reportPath: "r.md",
      risk: "Risk: none",
    });
    const log = spyOn(console, "log").mockImplementation(() => {});
    const code = await run(["--wait", "--run", RUN, "--ticket", TICKET, "--root", repo]);
    expect(code).toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toBe("DONE");
    log.mockRestore();
  });

  test("exits 124 on timeout while the worker is still running", async () => {
    await claimAndSlot();
    const sleeper = Bun.spawn(["sleep", "30"]);
    const stateFile = path.join(repo, ".emet", "runs", RUN, "codex", `${TICKET}.state.json`);
    mkdirSync(path.dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ pid: sleeper.pid }));
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const code = await run([
      "--wait",
      "--run",
      RUN,
      "--ticket",
      TICKET,
      "--timeout",
      "0",
      "--root",
      repo,
    ]);
    errors.mockRestore();
    sleeper.kill();
    expect(code).toBe(EXIT_WAIT_TIMEOUT);
  });

  test("exits 1 when nothing was dispatched", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(["--wait", "--run", RUN, "--ticket", TICKET, "--root", repo])).toBe(1);
    errors.mockRestore();
  });
});

describe("dispatch stub", () => {
  test("prints usage and exits 2", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    expect(await run([])).toBe(2);
    expect(spy.mock.calls[0]?.[0]).toContain("usage: emet dispatch");
    spy.mockRestore();
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { didReserveTicket } from "../emet/src/claims";
import { loadForgeConfigWithDefaults } from "../emet/src/config";
import { resolveCodexModel } from "../emet/src/codex-models";
import { readCodexState } from "../emet/src/codex-process";
import { run } from "../emet/src/dispatch";
import { isObject } from "../emet/src/narrow";
import { acquireSlot } from "../emet/src/slots";

const RUN = "e2e-run";
const TICKET = "E2E-1";
const WAIT_LIMIT_MS = 8 * 60 * 1000;
const TEST_TIMEOUT_MS = 10 * 60 * 1000;
const PROMPT_FILE = path.resolve(import.meta.dir, "fixtures/codex-e2e/prompt.md");

/**
 * The opt-in gate: `EMET_CODEX_E2E=1`, `codex` on PATH and a login that
 * `codex login status` accepts. The status probe makes no model call.
 */
function codexE2eEnabled(): boolean {
  if (process.env["EMET_CODEX_E2E"] !== "1") return false;
  if (Bun.which("codex") === null) return false;
  return Bun.spawnSync(["codex", "login", "status"]).exitCode === 0;
}

function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (isAlive(pid)) {
    if (Date.now() >= deadline) throw new Error(`codex worker ${pid} did not exit in time`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling on purpose
    await Bun.sleep(500);
  }
}

function parseEvent(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * UNVERIFIED: relies on the `exec --json` shape of a finished shell call,
 * an `item.completed` event whose item is a `command_execution` with a
 * `command` and either a non-zero `exit_code` or a declined/failed status.
 * If Codex changes the shape, this is the only function to adjust.
 */
function pushWasRefused(jsonl: string): boolean {
  return jsonl.split("\n").some((line) => {
    const item = parseEvent(line)?.["item"];
    if (!isObject(item)) return false;
    const command = item["command"];
    if (item["type"] !== "command_execution" || typeof command !== "string") return false;
    if (!/\bgit push\b/.test(command)) return false;
    const exitCode = item["exit_code"];
    const status = item["status"];
    return (
      (typeof exitCode === "number" && exitCode !== 0) ||
      status === "declined" ||
      status === "failed"
    );
  });
}

describe.skipIf(!codexE2eEnabled())("codex e2e", () => {
  let temp = "";
  let repo = "";
  let baseline = "";

  beforeAll(() => {
    temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-e2e-"));
    repo = path.join(temp, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", "develop");
    git(repo, "config", "user.name", "e2e");
    git(repo, "config", "user.email", "e2e@example.invalid");
    git(repo, "commit", "-q", "--allow-empty", "-m", "init");
    baseline = git(repo, "rev-parse", "HEAD");
    const record = path.join(repo, ".emet", "runs", RUN, "dispatch", `${TICKET}.json`);
    mkdirSync(path.dirname(record), { recursive: true });
    writeFileSync(record, JSON.stringify({ baseline, surfaces: ["hello.txt"] }));
  });

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test(
    "dispatch lands a commit and refuses git push",
    async () => {
      const forgeDirectory = path.join(temp, "forge");
      const slotsDirectory = path.join(temp, "slots");
      mkdirSync(slotsDirectory);
      await didReserveTicket(RUN, process.pid, TICKET, forgeDirectory);
      await acquireSlot(2, RUN, process.pid, TICKET, slotsDirectory);

      const { config } = await loadForgeConfigWithDefaults(repo);
      const cheapest = resolveCodexModel("triage", config);
      const modelArguments = cheapest.model === undefined ? [] : ["--model", cheapest.model];

      const code = await run(
        [
          "--role",
          "worker",
          "--run",
          RUN,
          "--ticket",
          TICKET,
          "--prompt-file",
          PROMPT_FILE,
          "--root",
          repo,
          "--effort",
          "low",
          ...modelArguments,
        ],
        { forgeDirectory, slotsDirectory },
      );
      expect(code).toBe(0);

      const stateFile = path.join(repo, ".emet", "runs", RUN, "codex", `${TICKET}.state.json`);
      const state = readCodexState(stateFile);
      if (state === undefined) throw new Error("dispatch wrote no state file");
      await waitForExit(state.pid);

      const worktree = path.join(repo, ".emet", "worktrees", `agent-${TICKET}`);
      const landed = git(worktree, "rev-list", "--count", `${baseline}..HEAD`);
      expect(Number(landed)).toBeGreaterThanOrEqual(1);
      expect(git(worktree, "show", "HEAD:hello.txt")).toBe("hello");

      expect(pushWasRefused(readFileSync(state.jsonlPath, "utf8"))).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});

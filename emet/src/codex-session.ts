import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CommandRunner, SessionInfo, StartSessionRequest } from "./agenthost";
import { buildRunHome } from "./codex-home";
import { refreshThreadId, spawnCodex, type CodexSpawn } from "./codex-process";
import { errnoCode } from "./narrow";

const SKILL_PREFIX_PATTERN = /^\/(?=[\w-]+:)/;
const THREAD_WAIT_MS = 2000;
const THREAD_POLL_MS = 50;

/** The files that describe one Codex session of a run. */
export type CodexSessionPaths = {
  readonly runDir: string;
  readonly recordFile: string;
  readonly jsonlPath: string;
  readonly stateFile: string;
};

/** Where a session's record, event stream and process state live under the repo. */
export function codexSessionPaths(repoRoot: string, name: string): CodexSessionPaths {
  const runDir = path.join(repoRoot, ".emet", "runs", name);
  const sessionsDir = path.join(runDir, "sessions");
  return {
    runDir,
    recordFile: path.join(sessionsDir, `${name}.json`),
    jsonlPath: path.join(sessionsDir, `${name}.jsonl`),
    stateFile: path.join(sessionsDir, `${name}.state.json`),
  };
}

/** Whether a process with `pid` exists. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return errnoCode(error) === "EPERM";
  }
}

/**
 * Maps a Claude-style handoff permission mode to `codex exec` flags
 * (`unverified` mapping: Codex has no equivalent of `auto`/`acceptEdits`, so
 * those run in the workspace-write sandbox; `bypassPermissions` skips the
 * sandbox, which the run's rules and hooks guard replaces).
 */
export function codexPermissionArgs(permissionMode: string): string[] {
  return permissionMode === "bypassPermissions"
    ? ["--dangerously-bypass-approvals-and-sandbox"]
    : ["--sandbox", "workspace-write"];
}

/** Flags that let the run's hooks load without persisted trust (`unverified`). */
function codexHookTrustArgs(): string[] {
  return ["--dangerously-bypass-hook-trust"];
}

/** Turns a `/emet:run ...` slash prompt into the Codex skill form `$emet:run ...`. */
export function codexSkillPrompt(prompt: string): string {
  return prompt.replace(SKILL_PREFIX_PATTERN, "$");
}

async function waitForThreadId(stateFile: string, remainingMs: number): Promise<string | null> {
  const threadId = refreshThreadId(stateFile)?.threadId ?? null;
  if (threadId !== null || remainingMs <= 0) return threadId;
  await Bun.sleep(THREAD_POLL_MS);
  return waitForThreadId(stateFile, remainingMs - THREAD_POLL_MS);
}

/**
 * Starts a detached `codex exec` for the request under a per-run `CODEX_HOME`
 * overlay and records `<repo>/.emet/runs/<name>/sessions/<name>.json` with the
 * pid and the thread id read from the event stream.
 */
export async function startCodexSession(
  req: StartSessionRequest,
  _run: CommandRunner,
  spawnOverrides: Partial<Pick<CodexSpawn, "executable" | "env">> = {},
): Promise<SessionInfo> {
  const paths = codexSessionPaths(req.cwd, req.name);
  const { codexHome } = buildRunHome({ run: req.name, repoRoot: req.cwd });
  const { pid } = spawnCodex({
    args: [
      "exec",
      "--json",
      ...codexPermissionArgs(req.permissionMode),
      ...codexHookTrustArgs(),
      codexSkillPrompt(req.prompt),
    ],
    cwd: req.cwd,
    codexHome,
    jsonlPath: paths.jsonlPath,
    stateFile: paths.stateFile,
    ...spawnOverrides,
  });
  const threadId = await waitForThreadId(paths.stateFile, THREAD_WAIT_MS);
  mkdirSync(path.dirname(paths.recordFile), { recursive: true });
  writeFileSync(
    paths.recordFile,
    `${JSON.stringify({ name: req.name, pid, threadId, cwd: req.cwd, startedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return { id: threadId, name: req.name };
}

function runNames(repoRoot: string): string[] {
  try {
    return readdirSync(path.join(repoRoot, ".emet", "runs"));
  } catch {
    return [];
  }
}

/**
 * The live Codex sessions recorded under a repo: one row per
 * `<run>/sessions/<name>.json` whose process is still running. A dead
 * process's record is ignored, so a finished session never blocks a launch.
 */
export function listCodexSessions(
  repoRoot: string,
  alive: (pid: number) => boolean = isProcessAlive,
): SessionInfo[] {
  return runNames(repoRoot).flatMap((name) => {
    const paths = codexSessionPaths(repoRoot, name);
    if (!existsSync(paths.recordFile)) return [];
    const state = refreshThreadId(paths.stateFile);
    if (state === undefined || !alive(state.pid)) return [];
    return [{ id: state.threadId, name }];
  });
}

/** The repository root for `run`, or the current directory when git cannot say. */
export async function resolveSessionRoot(run: CommandRunner): Promise<string> {
  const result = await run(["git", "rev-parse", "--show-toplevel"]);
  const root = result.stdout.trim();
  return result.exitCode === 0 && root.length > 0 ? root : process.cwd();
}

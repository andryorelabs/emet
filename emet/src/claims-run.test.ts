import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./claims";
import { DEFAULT_FORGE_CONFIG } from "./config";
import { isObject } from "./narrow";

const IMPOSSIBLE_PID = 999_999_999;

let repo: string;
let previousDirectory: string;
let previousArgv: string[];
let anchor: ReturnType<typeof Bun.spawn> | null = null;

beforeEach(() => {
  repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), "claims-run-")));
  Bun.spawnSync(["git", "-C", repo, "init", "-q"]);
  const base: unknown = JSON.parse(
    readFileSync(path.join(import.meta.dir, "..", "..", "emet.config.json"), "utf8"),
  );
  if (!isObject(base) || !isObject(base.ticket)) throw new Error("repo config has no ticket block");
  const config = {
    ...base,
    ticket: { ...base.ticket, idPattern: DEFAULT_FORGE_CONFIG.ticket.idPattern },
  };
  writeFileSync(path.join(repo, "emet.config.json"), JSON.stringify(config));
  previousDirectory = process.cwd();
  previousArgv = process.argv;
  process.chdir(repo);
});

afterEach(() => {
  process.chdir(previousDirectory);
  process.argv = previousArgv;
  process.exitCode = 0;
  anchor?.kill();
  anchor = null;
  rmSync(repo, { recursive: true, force: true });
});

/** Spawns a long-lived process whose command name is `claude`, so it classifies as a live anchor. */
function startLiveAnchor(): number {
  const binary = path.join(repo, "claude");
  copyFileSync(process.execPath, binary);
  anchor = Bun.spawn([binary, "-e", "setTimeout(() => {}, 300000)"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return anchor.pid;
}

async function runClaims(
  argv: string[],
): Promise<{ logs: string[]; errors: string[]; code: number }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (line: string) => void logs.push(line);
  console.error = (line: unknown) => void errors.push(String(line));
  process.exitCode = 0;
  try {
    await run(argv);
    return { logs, errors, code: process.exitCode ?? 0 };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = 0;
  }
}

function reserveArgs(ticket: string, runId: string, anchorPid: number, extra: string[] = []) {
  return ["--reserve", ticket, "--run", runId, "--anchor", String(anchorPid), ...extra];
}

describe("claims run()", () => {
  test("no mode prints usage and exits 1", async () => {
    const result = await runClaims([]);
    expect(result.code).toBe(1);
    expect(result.errors[0]).toContain("usage: emet claims");
  });

  test("a repository without a config refuses to mutate and exits 2", async () => {
    rmSync(path.join(repo, "emet.config.json"));
    const result = await runClaims(reserveArgs("AO-1", "r1", IMPOSSIBLE_PID));
    expect(result.code).toBe(2);
    expect(result.errors[0]).toContain("emet.config.json");
  });

  test("--list without a config falls back to the defaults", async () => {
    rmSync(path.join(repo, "emet.config.json"));
    const result = await runClaims(["--list"]);
    expect(result.code).toBe(0);
    expect(result.logs).toEqual(["emet:claims — no reservations."]);
  });

  test("outside a git repository it exits 2", async () => {
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), "claims-outside-")));
    process.chdir(outside);
    try {
      const result = await runClaims(["--list"]);
      expect(result.code).toBe(2);
      expect(result.errors[0]).toContain("not inside a git repository");
    } finally {
      process.chdir(repo);
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("a flag without a value is an error", async () => {
    const result = await runClaims(["--reserve", "--run", "r1"]);
    expect(result.code).toBe(1);
    expect(result.errors[0]).toContain("--reserve requires a value");
  });

  test("reserve, list, double-reserve, release round trip", async () => {
    const livePid = startLiveAnchor();
    const reserved = await runClaims(reserveArgs("AO-1", "r1", livePid));
    expect(reserved.code).toBe(0);
    expect(reserved.logs[0]).toBe("emet:claims — reserved AO-1 for run r1.");

    const listed = await runClaims(["--list"]);
    expect(listed.logs).toHaveLength(1);
    expect(listed.logs[0]).toContain("AO-1  run=r1  anchor=" + livePid);

    const again = await runClaims(reserveArgs("AO-1", "r2", livePid));
    expect(again.code).toBe(1);
    expect(again.errors[0]).toContain("AO-1 is already reserved");

    const refused = await runClaims(["--release", "AO-1", "--run", "r2"]);
    expect(refused.code).toBe(1);
    expect(refused.errors[0]).toContain("reserved by run r1, not r2");

    const released = await runClaims(["--release", "AO-1", "--run", "r1"]);
    expect(released.code).toBe(0);
    expect(released.logs[0]).toBe("emet:claims — released AO-1.");
    expect((await runClaims(["--list"])).logs[0]).toBe("emet:claims — no reservations.");
  });

  test("--force releases a reservation held by another run", async () => {
    await runClaims(reserveArgs("AO-2", "r1", IMPOSSIBLE_PID));
    const forced = await runClaims(["--release", "AO-2", "--run", "other", "--force"]);
    expect(forced.code).toBe(0);
    expect((await runClaims(["--list"])).logs[0]).toBe("emet:claims — no reservations.");
  });

  test("overlapping surfaces held by a live run are refused with both globs", async () => {
    const livePid = startLiveAnchor();
    const first = await runClaims(reserveArgs("AO-3", "r1", livePid, ["--surfaces", "src/a/**"]));
    expect(first.code).toBe(0);
    const second = await runClaims(
      reserveArgs("AO-4", "r2", livePid, ["--surfaces", "src/a/b.ts"]),
    );
    expect(second.code).toBe(1);
    expect(second.errors[0]).toContain("overlaps");
    expect(second.errors[0]).toContain("AO-3");
    expect(second.errors[0]).toContain("run r1");
  });

  test("--prune releases dead reservations, honours --dry-run and reports malformed files", async () => {
    await runClaims(reserveArgs("AO-5", "dead-run", IMPOSSIBLE_PID));
    await runClaims(reserveArgs("AO-6", "live-run", startLiveAnchor()));
    const ticketFile = Array.from(
      new Bun.Glob("**/AO-5.json").scanSync({ cwd: path.join(repo, ".git"), dot: true }),
    )[0]!;
    const ticketsDirectory = path.dirname(path.join(repo, ".git", ticketFile));
    writeFileSync(path.join(ticketsDirectory, "AO-7.json"), JSON.stringify({ bogus: true }));

    const dry = await runClaims(["--prune", "--dry-run"]);
    expect(dry.logs[0]).toBe("emet:claims — would release 1 dead reservation(s): AO-5.");
    expect(dry.logs[1]).toContain("1 malformed reservation file(s)");
    expect(dry.logs[1]).toContain("AO-7.json");
    expect(existsSync(path.join(ticketsDirectory, "AO-5.json"))).toBe(true);

    const pruned = await runClaims(["--prune"]);
    expect(pruned.logs[0]).toBe("emet:claims — released 1 dead reservation(s): AO-5.");
    expect(existsSync(path.join(ticketsDirectory, "AO-5.json"))).toBe(false);
    expect(existsSync(path.join(ticketsDirectory, "AO-6.json"))).toBe(true);
    expect(existsSync(path.join(ticketsDirectory, "AO-7.json"))).toBe(true);
  });

  test("--prune with nothing to release reports zero", async () => {
    const result = await runClaims(["--prune"]);
    expect(result.logs).toEqual(["emet:claims — released 0 dead reservation(s)."]);
  });
});

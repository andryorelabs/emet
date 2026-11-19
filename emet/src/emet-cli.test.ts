import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { COMMANDS } from "./commands";
import { unknownFlags } from "./flags";

const repoRoot = path.join(import.meta.dir, "..", "..");

function parseEnvelope(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

const entry = path.join(import.meta.dir, "..", "bin", "emet.ts");

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", entry, ...args], {
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

describe("emet CLI", () => {
  test("--version prints the bare version", () => {
    const result = runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.0.0-dev\n");
  });

  test("--version --json prints one ok envelope", () => {
    const result = runCli(["--version", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(parseEnvelope(result.stdout)).toEqual({
      ok: true,
      data: { version: "0.0.0-dev" },
      error: null,
    });
  });

  test("an unknown flag exits 2 and names the flag", () => {
    const result = runCli(["status", "--bogus"]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--bogus");
  });

  test("an unknown flag under --json is one failure envelope", () => {
    const result = runCli(["status", "--bogus", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(parseEnvelope(result.stdout)).toMatchObject({ ok: false, error: { code: "usage" } });
  });

  test("setup accepts --notice with --data-dir", () => {
    const dataDirectory = mkdtempSync(path.join(tmpdir(), "emet-setup-"));
    try {
      const result = runCli(["setup", "--notice", "--data-dir", dataDirectory]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).not.toContain("unknown flag");
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  });

  test("every emet command in hooks.json uses only declared flags", () => {
    const hookConfig = readFileSync(path.join(repoRoot, "hooks", "hooks.json"), "utf8");
    const commands = [
      ...hookConfig.matchAll(/bin\/emet\\"\s+([a-z-]+)((?:\s+[^"\\]+|\s+\\"[^"\\]*\\")*)/g),
    ];
    expect(commands.length).toBeGreaterThan(0);
    for (const [, name, rest] of commands) {
      const spec = COMMANDS.find((command) => command.name === name);
      expect(spec).toBeDefined();
      if (spec === undefined) continue;
      const argv = (rest ?? "").trim().split(/\s+/).filter(Boolean);
      expect(unknownFlags(spec, argv)).toEqual([]);
    }
  });

  test("an unknown command exits 2", () => {
    expect(runCli(["nope"]).exitCode).toBe(2);
  });

  test("--help --json wraps the usage in an envelope", () => {
    const result = runCli(["--help", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(parseEnvelope(result.stdout)).toMatchObject({ ok: true });
    expect(result.stdout).toContain("usage: emet <command>");
  });

  test("every command answers --help with exit 0", () => {
    for (const command of COMMANDS.filter(
      (spec) => !["launch", "lock-reason", "dispatch"].includes(spec.name),
    )) {
      const result = runCli([command.name, "--help"]);
      expect(result.exitCode).toBe(0);
    }
  });

  test("a command's stdout is captured into the envelope under --json", () => {
    const result = runCli(["skill-path", "no-such-skill-xyz", "--json"]);
    expect(result.exitCode).toBe(1);
    expect(parseEnvelope(result.stdout)).toMatchObject({ ok: false, error: { code: "findings" } });
  });

  test("SIGINT during a blocking command exits 130", async () => {
    const child = Bun.spawn(["bun", entry, "guard"], {
      env: { ...process.env, NO_COLOR: "1" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 15_000);
    try {
      await Bun.sleep(1500);
      expect(child.killed).toBe(false);
      child.kill("SIGINT");
      const exitCode = await child.exited;
      expect(exitCode).toBe(130);
    } finally {
      clearTimeout(killTimer);
      child.kill("SIGKILL");
    }
  }, 20_000);
});

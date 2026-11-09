import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { isObject } from "../emet/src/narrow";
import { classifyCodexFailure, runProbe, type ProbeResult } from "./codex-probe";

const SCRIPT = path.resolve(import.meta.dir, "codex-probe.ts");
const FAKE_CODEX = path.resolve(import.meta.dir, "fixtures/codex-probe/codex");
const REPO = path.resolve(import.meta.dir, "..");
const MODEL_ITEMS = [
  "rules-location",
  "hook-trust",
  "forged-approval",
  "plugin-root-alias",
  "skill-by-name",
  "nested-dispatch",
  "unattended-supervisor",
];
/** Rules, approval gate, plugin skill, nested dispatch and unattended each make one model run. */
const MODEL_RUNS = 5;
/** The fake answers instantly; the probe's whole fake run stays well under this. */
const PROBE_TEST_TIMEOUT_MS = 60_000;

function environmentWithout(name: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[0] !== name && entry[1] !== undefined,
    ),
  );
}

type FakeCall = { argv: string[]; codexHome: string };

function parseCall(line: string): FakeCall {
  const parsed: unknown = JSON.parse(line);
  if (!isObject(parsed) || !Array.isArray(parsed["argv"])) throw new Error(`bad log line ${line}`);
  return {
    argv: parsed["argv"].map(String),
    codexHome: typeof parsed["codexHome"] === "string" ? parsed["codexHome"] : "",
  };
}

function snapshot(directory: string): string[] {
  return readdirSync(directory)
    .toSorted()
    .map((name) => {
      const stat = statSync(path.join(directory, name));
      return `${name}:${stat.size}:${stat.mtimeMs}`;
    });
}

describe("probe:codex gate", () => {
  test("prints skipped and exits 0 when EMET_CODEX_PROBE is unset", () => {
    const result = Bun.spawnSync(["bun", SCRIPT], { env: environmentWithout("EMET_CODEX_PROBE") });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("skipped");
  });
});

describe("classifyCodexFailure", () => {
  test("a usage-limit message is blocked-by-plan-limit, not failed", () => {
    expect(classifyCodexFailure("ERROR: You've hit your usage limit. Upgrade to Plus.", 1)).toBe(
      "blocked-by-plan-limit",
    );
  });

  test("an HTTP 429 rate limit is blocked-by-plan-limit", () => {
    expect(classifyCodexFailure("stream error: 429 Too Many Requests", 1)).toBe(
      "blocked-by-plan-limit",
    );
  });

  test("any other non-zero exit is failed", () => {
    expect(classifyCodexFailure("error: unexpected argument '--frobnicate'", 2)).toBe("failed");
  });

  test("a clean exit is verified", () => {
    expect(classifyCodexFailure("", 0)).toBe("verified");
  });
});

describe("runProbe against a fake codex that always hits the usage limit", () => {
  let temp = "";
  let sourceHome = "";
  let logPath = "";
  let before: string[] = [];
  let results: ProbeResult[] = [];
  let calls: FakeCall[] = [];

  beforeAll(async () => {
    temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-probe-test-"));
    sourceHome = path.join(temp, "source-home");
    Bun.spawnSync(["mkdir", "-p", sourceHome]);
    writeFileSync(path.join(sourceHome, "auth.json"), '{"fake":true}\n');
    writeFileSync(path.join(sourceHome, "config.toml"), "# fake\n");
    logPath = path.join(temp, "codex.log");
    before = snapshot(sourceHome);
    process.env["FAKE_CODEX_PROBE_LOG"] = logPath;
    process.env["FAKE_CODEX_PROBE_MODE"] = "limit";
    try {
      results = await runProbe({
        codexHome: sourceHome,
        repo: REPO,
        executable: FAKE_CODEX,
        workDir: temp,
      });
    } finally {
      delete process.env["FAKE_CODEX_PROBE_LOG"];
      delete process.env["FAKE_CODEX_PROBE_MODE"];
    }
    calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => parseCall(line));
  }, PROBE_TEST_TIMEOUT_MS);

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test("reports one row per item, every model item blocked-by-plan-limit", () => {
    const verdicts = Object.fromEntries(results.map((result) => [result.id, result.verdict]));
    for (const id of MODEL_ITEMS) expect(verdicts[id]).toBe("blocked-by-plan-limit");
    expect(Object.keys(verdicts).toSorted()).toEqual(
      [
        ...MODEL_ITEMS,
        "linked-auth",
        "plugin-list-format",
        "plugin-install-remote",
        "plugin-install-local",
      ].toSorted(),
    );
  });

  test("retries a usage-limit answer exactly once per model run", () => {
    const modelRuns = calls.filter(
      (call) => call.argv[0] === "exec" && !call.argv.includes("--help"),
    );
    expect(modelRuns.length).toBe(MODEL_RUNS * 2);
  });

  test("never runs codex under an overlay whose config.toml is the source's", () => {
    const sourceConfig = path.join(sourceHome, "config.toml");
    for (const call of calls) {
      const config = path.join(call.codexHome, "config.toml");
      const linked = existsSync(config) && realpathSync(config) === realpathSync(sourceConfig);
      expect(linked).toBe(false);
    }
  });

  test("never sends effort ultra", () => {
    for (const call of calls) expect(call.argv.join(" ")).not.toContain("ultra");
  });

  test("runs every call under an overlay, links auth and never writes the source home", () => {
    for (const call of calls) expect(call.codexHome).not.toBe(sourceHome);
    expect(snapshot(sourceHome)).toEqual(before);
    const overlay = calls.find((call) => call.argv[0] === "login")?.codexHome ?? "";
    expect(lstatSync(path.join(overlay, "auth.json")).isSymbolicLink()).toBe(true);
    expect(results.find((result) => result.id === "linked-auth")?.verdict).toBe("verified");
  });
});

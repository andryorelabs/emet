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

import { COMMIT_RULES } from "../emet/src/codex-home";
import { isObject } from "../emet/src/narrow";
import {
  classifyCodexFailure,
  pushRefusedByRules,
  runFullFlow,
  runProbe,
  type FlowStep,
  type ProbeResult,
} from "./codex-probe";

const SCRIPT = path.resolve(import.meta.dir, "codex-probe.ts");
const FAKE_CODEX = path.resolve(import.meta.dir, "fixtures/codex-probe/codex");
const REPO = path.resolve(import.meta.dir, "..");
const MODEL_ITEMS = [
  "hook-trust",
  "forged-approval",
  "plugin-root-alias",
  "skill-by-name",
  "nested-dispatch",
  "unattended-supervisor",
];
/** Approval gate, plugin skill, nested dispatch and unattended each make one model run. */
const MODEL_RUNS = 4;
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
    const previousCodexHome = process.env["CODEX_HOME"];
    process.env["CODEX_HOME"] = sourceHome;
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
      if (previousCodexHome === undefined) delete process.env["CODEX_HOME"];
      else process.env["CODEX_HOME"] = previousCodexHome;
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
        "rules-location",
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

  test("proves the push rule with codex execpolicy check, not a model run", () => {
    const rules = results.find((result) => result.id === "rules-location");
    expect(rules?.verdict).toBe("verified");
    const checks = calls.filter((call) => call.argv[0] === "execpolicy");
    expect(checks.some((call) => call.argv.includes("push"))).toBe(true);
  });

  test("runs every call under an overlay, links auth and never writes the source home", () => {
    for (const call of calls) expect(call.codexHome).not.toBe(sourceHome);
    expect(snapshot(sourceHome)).toEqual(before);
    const overlay = calls.find((call) => call.argv[0] === "login")?.codexHome ?? "";
    expect(lstatSync(path.join(overlay, "auth.json")).isSymbolicLink()).toBe(true);
    expect(results.find((result) => result.id === "linked-auth")?.verdict).toBe("verified");
  });
});

describe("pushRefusedByRules", () => {
  let temp = "";

  beforeAll(() => {
    temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-rules-test-"));
  });

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test("is true for the overlay rules, whose git push rule is forbidden", async () => {
    const rules = path.join(temp, "default.rules");
    writeFileSync(rules, COMMIT_RULES);
    expect(await pushRefusedByRules(rules, FAKE_CODEX)).toBe(true);
  });

  test("is false once the push rule is dropped from the overlay rules", async () => {
    const rules = path.join(temp, "no-push.rules");
    writeFileSync(
      rules,
      COMMIT_RULES.split("\n")
        .filter((line) => !line.includes('"push"'))
        .join("\n"),
    );
    expect(await pushRefusedByRules(rules, FAKE_CODEX)).toBe(false);
  });

  test("is false when the rules file is missing", async () => {
    expect(await pushRefusedByRules(path.join(temp, "absent.rules"), FAKE_CODEX)).toBe(false);
  });
});

describe("runFullFlow against a fake codex that always hits the usage limit", () => {
  let temp = "";
  let steps: FlowStep[] = [];
  let calls: FakeCall[] = [];

  beforeAll(async () => {
    temp = mkdtempSync(path.join(os.tmpdir(), "emet-codex-flow-test-"));
    const sourceHome = path.join(temp, "source-home");
    Bun.spawnSync(["mkdir", "-p", sourceHome]);
    writeFileSync(path.join(sourceHome, "auth.json"), '{"fake":true}\n');
    const logPath = path.join(temp, "codex.log");
    process.env["FAKE_CODEX_PROBE_LOG"] = logPath;
    process.env["FAKE_CODEX_PROBE_MODE"] = "limit";
    const previousCodexHome = process.env["CODEX_HOME"];
    process.env["CODEX_HOME"] = sourceHome;
    try {
      steps = await runFullFlow({
        codexHome: sourceHome,
        repo: REPO,
        executable: FAKE_CODEX,
        workDir: temp,
        modelTimeoutMs: 20_000,
      });
    } finally {
      delete process.env["FAKE_CODEX_PROBE_LOG"];
      delete process.env["FAKE_CODEX_PROBE_MODE"];
      if (previousCodexHome === undefined) delete process.env["CODEX_HOME"];
      else process.env["CODEX_HOME"] = previousCodexHome;
    }
    calls = existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .trim()
          .split("\n")
          .map((line) => parseCall(line))
      : [];
  }, PROBE_TEST_TIMEOUT_MS);

  afterAll(() => {
    rmSync(temp, { recursive: true, force: true });
  });

  test("reports wave 1 as blocked-by-plan-limit, never failed, and stops there", () => {
    expect(steps.map((step) => step.step)).toEqual(["wave 1: emet dispatch"]);
    expect(steps[0]?.verdict).toBe("blocked-by-plan-limit");
  });

  test("dispatches wave 1 exactly twice: the first try and one retry", () => {
    const workerRuns = calls.filter((call) => call.argv[0] === "exec" && call.argv[1] === "-C");
    expect(workerRuns.length).toBe(2);
  });
});

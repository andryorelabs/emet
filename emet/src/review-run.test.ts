import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isObject } from "./narrow";
import { parseFindings, type Finding } from "./review";
import {
  buildReviewerPrompt,
  extractFindings,
  findingsSchema,
  lastAgentMessage,
  modelArguments,
  run,
} from "./review-run";
import { DEFAULT_FORGE_CONFIG } from "./config";

const FAKE = path.resolve(import.meta.dir, "../../tools/fixtures/fake-codex/codex");
const scratch: string[] = [];
const FINDING: Finding = {
  id: "F-001",
  file: "a.ts",
  line: 3,
  severity: "major",
  kind: "patch",
  claim: "breaks on empty input",
};

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env["FAKE_CODEX_SCRIPT"];
  delete process.env["FAKE_CODEX_LOG"];
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "review-run-"));
  scratch.push(dir);
  return dir;
}

function agentMessage(text: string): Record<string, unknown> {
  return { type: "item.completed", item: { id: "i1", type: "agent_message", text } };
}

function script(lines: unknown[], exitCode = 0): string {
  const file = path.join(tempDir(), "script.json");
  writeFileSync(file, JSON.stringify({ lines, exitCode }));
  process.env["FAKE_CODEX_SCRIPT"] = file;
  return file;
}

function captureStdout(): { lines: () => string[]; restore: () => void } {
  const spy = spyOn(console, "log").mockImplementation(() => {});
  const captured: string[] = [];
  return {
    lines: () => captured,
    restore: () => {
      captured.push(...spy.mock.calls.map((call) => String(call[0])));
      spy.mockRestore();
    },
  };
}

function baseArgv(tier: string, packagePath = "/tmp/pkg.md"): string[] {
  return ["--run", "r1", "--ticket", "CLA-1", "--package", packagePath, "--tier", tier];
}

describe("review-run usage", () => {
  test("prints usage and exits 2 without arguments", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    expect(await run([])).toBe(2);
    expect(spy.mock.calls[0]?.[0]).toContain("usage: emet review-run");
    spy.mockRestore();
  });

  test("rejects an unknown tier", async () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    expect(await run(baseArgv("extreme"))).toBe(2);
    spy.mockRestore();
  });
});

describe("review-run passive tier", () => {
  test("prints an empty findings array and starts no process", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    const out = captureStdout();
    const repoRoot = tempDir();
    const code = await run(baseArgv("passive"), { repoRoot, executable: FAKE });
    out.restore();
    expect(code).toBe(0);
    expect(out.lines()).toEqual(["[]"]);
    expect(existsSync(log)).toBe(false);
    expect(existsSync(path.join(repoRoot, ".emet"))).toBe(false);
  });
});

describe("review-run with the fake codex", () => {
  test("emits findings that `emet review --findings` parses, and invokes codex read-only", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([
      { type: "thread.started", thread_id: "t1" },
      agentMessage(JSON.stringify({ findings: [FINDING] })),
    ]);
    const repoRoot = tempDir();
    const sourceHome = tempDir();
    const out = captureStdout();
    const code = await run(baseArgv("medium", "/tmp/pkg.md"), {
      repoRoot,
      sourceHome,
      executable: FAKE,
      modelsCachePath: path.join(sourceHome, "none.json"),
    });
    out.restore();
    expect(code).toBe(0);
    expect(parseFindings(out.lines().join("\n"))).toEqual([FINDING]);

    const call: unknown = JSON.parse(readFileSync(log, "utf8").trim().split("\n")[0] ?? "");
    if (!isObject(call) || !Array.isArray(call["argv"])) throw new Error("bad log");
    const argv = call["argv"].map(String);
    expect(argv.slice(0, 4)).toEqual(["exec", "-s", "read-only", "--ephemeral"]);
    expect(argv).toContain("--output-schema");
    expect(argv).toContain("-m");
    expect(argv.at(-1)).toContain("/tmp/pkg.md");
    expect(argv.join(" ")).not.toContain("ultra");
    const schemaPath = argv[argv.indexOf("--output-schema") + 1] ?? "";
    expect(existsSync(schemaPath)).toBe(true);
    expect(schemaPath.startsWith(path.join(repoRoot, ".emet", "runs", "r1"))).toBe(true);
  });

  test("high tier adds the security lens and uses the high reviewer model", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([agentMessage("[]")]);
    const out = captureStdout();
    const code = await run(baseArgv("high"), {
      repoRoot: tempDir(),
      sourceHome: tempDir(),
      executable: FAKE,
    });
    out.restore();
    expect(code).toBe(0);
    expect(out.lines()).toEqual(["[]"]);
    expect(readFileSync(log, "utf8")).toContain("security and resilience");
  });

  test("exits 1 when codex produces no final message", async () => {
    script([{ type: "thread.started", thread_id: "t1" }], 1);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const code = await run(baseArgv("medium"), {
      repoRoot: tempDir(),
      sourceHome: tempDir(),
      executable: FAKE,
    });
    expect(code).toBe(1);
    expect(err.mock.calls[0]?.[0]).toContain("no final message");
    err.mockRestore();
  });

  test("exits 1 when the final message holds invalid findings", async () => {
    script([agentMessage(JSON.stringify({ findings: [{ id: "x" }] }))]);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const code = await run(baseArgv("medium"), {
      repoRoot: tempDir(),
      sourceHome: tempDir(),
      executable: FAKE,
    });
    expect(code).toBe(1);
    err.mockRestore();
  });
});

describe("review-run helpers", () => {
  test("lastAgentMessage returns the last agent message", () => {
    const jsonl = [agentMessage("first"), agentMessage("second")]
      .map((event) => JSON.stringify(event))
      .join("\n");
    expect(lastAgentMessage(`${jsonl}\nnot json agent_message`)).toBe("second");
    expect(lastAgentMessage("")).toBeUndefined();
  });

  test("extractFindings accepts a bare array and rejects non-JSON", () => {
    expect(extractFindings(JSON.stringify([FINDING]))).toEqual([FINDING]);
    expect(() => extractFindings("nope")).toThrow();
  });

  test("modelArguments omits -m when no model resolves and never sends ultra", () => {
    const args = modelArguments("high", DEFAULT_FORGE_CONFIG, "/nonexistent/cache.json");
    expect(args.join(" ")).not.toContain("ultra");
    expect(args).toContain("-c");
  });

  test("modelArguments throws naming the role and listed slugs when a cache resolves nothing", () => {
    const cache = path.join(tempDir(), "models_cache.json");
    writeModelsCache(cache, ["gpt-5.6-terra", "gpt-5.5-luna"]);
    expect(() => modelArguments("medium", DEFAULT_FORGE_CONFIG, cache)).toThrow(
      /reviewerMedium.*gpt-6\.1-sol.*gpt-5\.6-terra, gpt-5.5-luna/s,
    );
  });
});

function writeModelsCache(file: string, slugs: readonly string[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const models = slugs.map((slug) => ({
    slug,
    visibility: "list",
    supported_reasoning_levels: ["low", "medium", "high", "xhigh"].map((effort) => ({ effort })),
    upgrade: null,
  }));
  writeFileSync(file, JSON.stringify({ models }));
}

function loggedArgv(log: string): string[] {
  const call: unknown = JSON.parse(readFileSync(log, "utf8").trim().split("\n")[0] ?? "");
  if (!isObject(call) || !Array.isArray(call["argv"])) throw new Error("bad log");
  return call["argv"].map(String);
}

describe("review-run Codex models cache", () => {
  test("uses the real Codex home's cache when the run home has none, and logs the substitution", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([agentMessage("[]")]);
    const sourceHome = tempDir();
    writeModelsCache(path.join(sourceHome, "models_cache.json"), ["gpt-6.1-sol"]);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const out = captureStdout();
    const code = await run(baseArgv("high"), {
      repoRoot: tempDir(),
      sourceHome,
      executable: FAKE,
    });
    out.restore();
    const messages = err.mock.calls.map((call) => String(call[0]));
    err.mockRestore();
    expect(code).toBe(0);
    const argv = loggedArgv(log);
    expect(argv[argv.indexOf("-m") + 1]).toBe("gpt-6.1-sol");
    expect(messages.join("\n")).toContain("gpt-6-astra substituted");
  });

  test("prefers the run home's cache over the real one", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([agentMessage("[]")]);
    const repoRoot = tempDir();
    const sourceHome = tempDir();
    writeModelsCache(path.join(sourceHome, "models_cache.json"), ["gpt-5.6-terra"]);
    writeModelsCache(
      path.join(repoRoot, ".emet", "runs", "r1", "codex-home", "models_cache.json"),
      ["gpt-6.1-sol"],
    );
    const out = captureStdout();
    const code = await run(baseArgv("medium"), { repoRoot, sourceHome, executable: FAKE });
    out.restore();
    expect(code).toBe(0);
    const argv = loggedArgv(log);
    expect(argv[argv.indexOf("-m") + 1]).toBe("gpt-6.1-sol");
  });

  test("fails before spawning codex when a cache exists but no model resolves", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([agentMessage("[]")]);
    const sourceHome = tempDir();
    writeModelsCache(path.join(sourceHome, "models_cache.json"), ["gpt-5.6-terra", "gpt-5.5-luna"]);
    const err = spyOn(console, "error").mockImplementation(() => {});
    const code = await run(baseArgv("medium"), {
      repoRoot: tempDir(),
      sourceHome,
      executable: FAKE,
    });
    const messages = err.mock.calls.map((call) => String(call[0])).join("\n");
    err.mockRestore();
    expect(code).toBe(1);
    expect(messages).toContain("reviewerMedium");
    expect(messages).toContain("gpt-5.6-terra, gpt-5.5-luna");
    expect(existsSync(log)).toBe(false);
  });

  test("keeps the configured slug when no cache exists anywhere", async () => {
    const log = path.join(tempDir(), "calls.jsonl");
    process.env["FAKE_CODEX_LOG"] = log;
    script([agentMessage("[]")]);
    const out = captureStdout();
    const code = await run(baseArgv("medium"), {
      repoRoot: tempDir(),
      sourceHome: tempDir(),
      executable: FAKE,
    });
    out.restore();
    expect(code).toBe(0);
    const argv = loggedArgv(log);
    expect(argv[argv.indexOf("-m") + 1]).toBe("gpt-6.1-sol");
  });
});

describe("review-run contract", () => {
  test("the schema wraps findings in an object with every field required", () => {
    const schema = JSON.stringify(findingsSchema());
    expect(schema).toContain(`"required":["findings"]`);
    expect(schema).toContain(`"required":["id","file","line","severity","kind","claim"]`);
  });

  test("the prompt names the package and the tier lenses", () => {
    const base = { run: "r", ticket: "CLA-9", packagePath: "/p/pkg.md" } as const;
    expect(buildReviewerPrompt({ ...base, tier: "medium" })).not.toContain("security");
    const high = buildReviewerPrompt({ ...base, tier: "high" });
    expect(high).toContain("/p/pkg.md");
    expect(high).toContain("security and resilience");
  });
});

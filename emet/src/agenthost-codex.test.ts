import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isObject } from "./narrow";
import { resolveAgentHost, type HostRegistry } from "./agenthost";
import {
  CODEX_SKILLS_INSTALL_COMMANDS,
  codexHost,
  isCodexVersionAtLeast,
  parseCodexPluginList,
  parseCodexVersion,
  registerCodexHost,
} from "./agenthost-codex";

const FAKE = path.resolve(import.meta.dir, "../../tools/fixtures/fake-codex/codex");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeRun(args: string[], script: object) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fake-codex-"));
  scratch.push(dir);
  const scriptFile = path.join(dir, "script.json");
  const logFile = path.join(dir, "log.jsonl");
  writeFileSync(scriptFile, JSON.stringify(script));
  const result = Bun.spawnSync([FAKE, ...args], {
    env: { ...process.env, FAKE_CODEX_SCRIPT: scriptFile, FAKE_CODEX_LOG: logFile },
  });
  return { result, stdout: result.stdout.toString(), logFile };
}

describe("codexHost data", () => {
  test("anchor, format and worktree predicates", () => {
    expect(codexHost.anchorProcessName).toBe("codex");
    expect(codexHost.transcriptFormat).toBe("codex-jsonl");
    expect(codexHost.isAgentWorktree("/r/.emet/worktrees/agent-1")).toBe(true);
    expect(codexHost.isAgentWorktree("/r/.claude/worktrees/agent-1")).toBe(false);
    expect(codexHost.agentIdFromBranch("worktree-agent-9")).toBe("agent-9");
  });

  test("transcripts live under .emet/runs/<run>/codex/", () => {
    expect(codexHost.sessionSlug("/home/a.b/c")).toBe("-home-a-b-c");
    expect(codexHost.sessionTranscriptPath("slug", "run1", "/p")).toBe(
      "/p/.emet/runs/run1/codex/slug.jsonl",
    );
    expect(codexHost.workerTranscriptRoot("/ignored", "/p")).toBe("/p/.emet/runs");
    expect(codexHost.workerTranscriptGlob).toBe("*/codex/*.jsonl");
  });

  test("sessions are wired to the Codex session store", async () => {
    const outcome = await codexHost.sessions
      .list(() => Promise.reject(new Error("x")))
      .then(
        () => "resolved",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
    expect(outcome).not.toContain("not implemented");
    expect(codexHost.sessions.attachCommand("run-1")).toBe("codex exec resume run-1");
  });

  test("registers and resolves", () => {
    const registry: HostRegistry = {};
    registerCodexHost(registry);
    expect(resolveAgentHost("codex", registry)).toBe(codexHost);
  });
});

describe("codexHost probes", () => {
  test("remedy names both marketplace commands", () => {
    const remedy = codexHost.probes.pluginRemedy(codexHost.probes.skillsPluginId);
    expect(CODEX_SKILLS_INSTALL_COMMANDS).toEqual([
      "codex plugin marketplace add mattpocock/skills",
      "codex plugin add mattpocock-skills@mattpocock",
    ]);
    for (const command of CODEX_SKILLS_INSTALL_COMMANDS) expect(remedy).toContain(command);
  });

  test("requires exec --json and --output-schema", () => {
    expect(codexHost.probes.requiredCliFlags.map((entry) => entry.flag)).toEqual([
      "--json",
      "--output-schema",
    ]);
  });

  test("parses plugin list rows and skips uninstalled", () => {
    const table = [
      "Marketplace `m`",
      "PLUGIN                 STATUS          VERSION   SOURCE",
      "mattpocock-skills@mattpocock   installed       1.2.0     github",
      "gmail@openai-curated-remote    not installed   0.1.10    plugin_x",
      "off@mattpocock   installed, disabled   0.1.0   github",
    ].join("\n");
    const plugins = parseCodexPluginList(table);
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "mattpocock-skills@mattpocock",
      "off@mattpocock",
    ]);
    expect(plugins[0]?.version).toBe("1.2.0");
    expect(plugins[1]?.enabled).toBe(false);
  });

  test("version parsing and comparison", () => {
    expect(parseCodexVersion("codex-cli 0.167.0")).toBe("0.167.0");
    expect(parseCodexVersion("nothing")).toBeUndefined();
    expect(isCodexVersionAtLeast("0.167.0", "0.167.0")).toBe(true);
    expect(isCodexVersionAtLeast("0.99.0", "0.167.0")).toBe(false);
    expect(isCodexVersionAtLeast("1.0.0", "0.167.0")).toBe(true);
  });
});

describe("fake codex fixture", () => {
  test("honours --version and records argv and env", () => {
    const { stdout, logFile } = fakeRun(["--version"], { version: "0.1.0" });
    expect(parseCodexVersion(stdout)).toBe("0.1.0");
    const entry: unknown = JSON.parse(readFileSync(logFile, "utf8").trim());
    expect(isObject(entry) ? entry.argv : null).toEqual(["--version"]);
    const env = isObject(entry) ? entry.env : null;
    expect(isObject(env) ? env.FAKE_CODEX_LOG : null).toBe(logFile);
  });

  test("exec --help lists the required flags", () => {
    const { stdout } = fakeRun(["exec", "--help"], {});
    for (const { flag } of codexHost.probes.requiredCliFlags) expect(stdout).toContain(flag);
  });

  test("plugin list output parses", () => {
    const { stdout } = fakeRun(["plugin", "list"], {
      pluginList: "mattpocock-skills@mattpocock   installed   1.0.0   github\n",
    });
    expect(parseCodexPluginList(stdout)).toHaveLength(1);
  });

  test("exec prints scripted JSONL and exit code", () => {
    const { result, stdout } = fakeRun(["exec", "--json", "go"], {
      lines: [{ type: "turn.completed" }, '{"type":"x"}'],
      exitCode: 3,
    });
    expect(result.exitCode).toBe(3);
    expect(stdout.trim().split("\n")).toEqual(['{"type":"turn.completed"}', '{"type":"x"}']);
  });
});

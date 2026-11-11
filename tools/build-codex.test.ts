import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FORBIDDEN_TOKENS,
  assertNoForbiddenTokens,
  buildHooks,
  buildPluginManifest,
  buildSkill,
  findForbiddenTokens,
  findStaleFiles,
  generateArtefacts,
  splitCommand,
  transformPrompt,
} from "./build-codex";

const repoRoot = path.join(import.meta.dir, "..");

function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Object.getOwnPropertyDescriptor(current, key)?.value;
  }
  return current;
}

describe("mailbox escalation", () => {
  test("the Codex worker prompt escalates with emet ask, not the handoff note", () => {
    const worker = readFileSync(
      path.join(repoRoot, "codex/skills/run/references/worker-prompt.md"),
      "utf8",
    );
    expect(worker).toContain("emet ask --run <runId> --ticket <ticket>");
    expect(worker).toContain("--wait <n>");
    expect(worker).toContain("BLOCKED");
  });

  test("the coordinator reads the inbox and replies on a question status", () => {
    const dispatch = readFileSync(
      path.join(repoRoot, "codex/skills/run/references/phases-6-7-dispatch.md"),
      "utf8",
    );
    expect(dispatch).toContain("emet inbox --run <runId>");
    expect(dispatch).toContain("emet reply --run <runId>");
    expect(dispatch).not.toContain("states the question in its handoff note");
  });
});

describe("transformPrompt", () => {
  test("rewrites plugin-root paths to skill-relative references", () => {
    expect(transformPrompt("see `${CLAUDE_PLUGIN_ROOT}/emet/reference/worker-prompt.md`")).toBe(
      "see `references/worker-prompt.md`",
    );
  });

  test("replaces the worker dispatch with emet dispatch", () => {
    const output = transformPrompt(
      'Launch up to `concurrency.waveSize` `Agent` calls in parallel, each with `isolation: "worktree"`. If `emet doctor` flags it, makes the call fail.',
    );
    expect(output).toContain("emet dispatch --role worker --run <runId> --ticket <ticket>");
    expect(output).toContain("emet dispatch --wait");
    expect(findForbiddenTokens(output)).toEqual([]);
  });

  test("replaces the reviewer dispatch with emet review-run", () => {
    const output = transformPrompt(
      'Dispatch one `Agent({subagent_type: "emet:emet-reviewer"})`\nbuilt from `x`',
    );
    expect(output).toContain("emet review-run --run <runId>");
    expect(findForbiddenTokens(output)).toEqual([]);
  });

  test("replaces the plan-mode approval with the hook approval", () => {
    const output = transformPrompt("Call `ExitPlanMode` to request approval.");
    expect(output).toContain("approve <id>");
    expect(findForbiddenTokens(output)).toEqual([]);
  });

  test("is idempotent on already-transformed text", () => {
    const once = transformPrompt("run `/emet:run --dispatch 1` with the Bash tool");
    expect(transformPrompt(once)).toBe(once);
    expect(once).toBe("run `$emet:run --dispatch 1` in the shell");
  });
});

describe("findForbiddenTokens and assertNoForbiddenTokens", () => {
  test("reports every forbidden token present", () => {
    expect(findForbiddenTokens("Agent( and TaskStop")).toEqual(["Agent(", "TaskStop"]);
  });

  test("throws naming the file and the token", () => {
    expect(() => assertNoForbiddenTokens({ path: "codex/x.md", content: "ToolSearch" })).toThrow(
      "codex/x.md still contains Claude-only tokens: ToolSearch",
    );
  });
});

describe("skill and manifest builders", () => {
  test("splitCommand reads the description and body", () => {
    expect(splitCommand("---\ndescription: Hello there\n---\nBody\n")).toEqual({
      description: "Hello there",
      body: "Body\n",
    });
  });

  test("splitCommand rejects a file without a description", () => {
    expect(() => splitCommand("no frontmatter")).toThrow("no frontmatter description");
  });

  test("buildSkill writes name and description frontmatter", () => {
    expect(buildSkill("init", "---\ndescription: Do it\n---\nRun `emet init`\n")).toBe(
      '---\nname: init\ndescription: "Do it"\n---\nRun `emet init`\n',
    );
  });

  test("buildPluginManifest mirrors the Claude version", () => {
    const manifest: unknown = JSON.parse(
      buildPluginManifest(
        '{"name":"emet","version":"1.2.3","description":"d","author":{"name":"A"},"homepage":"https://h.test","repository":"https://r.test","license":"MIT"}',
      ),
    );
    expect(manifest).toEqual({
      name: "emet",
      version: "1.2.3",
      description: "d",
      author: { name: "A" },
      homepage: "https://h.test",
      repository: "https://r.test",
      license: "MIT",
      skills: "./codex/skills",
      hooks: "./codex/hooks.json",
      commands: [],
    });
  });

  test("buildPluginManifest rejects a manifest without a version", () => {
    expect(() => buildPluginManifest('{"description":"d"}')).toThrow("string version");
  });

  test("buildHooks guards Codex tool calls and prompts through emet guard", () => {
    const hooks: unknown = JSON.parse(buildHooks());
    expect(dig(hooks, "hooks", "PreToolUse", "0", "matcher")).toBe("Bash|apply_patch");
    expect(dig(hooks, "hooks", "UserPromptSubmit", "0", "hooks", "0", "command")).toBe(
      "EMET_AGENT_HOST=codex emet guard --event UserPromptSubmit",
    );
    expect(buildHooks()).not.toContain("CLAUDE_PLUGIN_ROOT");
  });
});

describe("committed Codex artefacts", () => {
  const files = generateArtefacts(repoRoot);

  test("generates the skills, references, hooks and manifest", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toContain("codex/skills/run/SKILL.md");
    expect(paths).toContain("codex/skills/init/SKILL.md");
    expect(paths).toContain("codex/skills/doctor/SKILL.md");
    expect(paths).toContain("codex/skills/run/references/worker-prompt.md");
    expect(paths).toContain("codex/skills/run/references/reviewer-prompt.md");
    expect(paths).toContain("codex/hooks.json");
    expect(paths).toContain(".codex-plugin/plugin.json");
  });

  test("regenerating matches the committed files (run bun run build:codex when this fails)", () => {
    expect(findStaleFiles(files, repoRoot)).toEqual([]);
  });

  test("no generated prompt contains a Claude-only token", () => {
    const offenders = files
      .filter((file) => file.path.endsWith(".md"))
      .flatMap((file) =>
        findForbiddenTokens(file.content).map((token) => `${file.path}: ${token}`),
      );
    expect(offenders).toEqual([]);
    expect(FORBIDDEN_TOKENS).toContain("CLAUDE_PLUGIN_ROOT");
  });

  test("the run skill wires the dispatch, review and approval CLI calls", () => {
    const text = files.map((file) => file.content).join("\n");
    expect(text).toContain("emet dispatch --role worker");
    expect(text).toContain("emet review-run");
    expect(text).toContain("approve <id>");
  });

  test("the Codex and Claude plugin versions are equal", () => {
    const codexManifest: unknown = JSON.parse(
      readFileSync(path.join(repoRoot, ".codex-plugin", "plugin.json"), "utf8"),
    );
    const claudeManifest: unknown = JSON.parse(
      readFileSync(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf8"),
    );
    expect(dig(codexManifest, "version")).toBe(dig(claudeManifest, "version"));
    expect(dig(codexManifest, "name")).toBe("emet");
    expect(dig(codexManifest, "skills")).toBe("./codex/skills");
    expect(dig(codexManifest, "hooks")).toBe("./codex/hooks.json");
    expect(dig(codexManifest, "commands")).toEqual([]);
  });

  test("findStaleFiles names a missing or edited file", () => {
    expect(findStaleFiles([{ path: "codex/missing.md", content: "x" }], repoRoot)).toEqual([
      "codex/missing.md",
    ]);
  });
});

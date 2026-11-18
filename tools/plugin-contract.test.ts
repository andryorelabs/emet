/**
 * Plugin contract tests (V40): skill names and "Use when" descriptions, hook
 * matchers, agent frontmatter pins, restricted tools for agents that read
 * untrusted input, and the fail-closed PreToolUse guard launcher.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  copyFileSync,
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

import { MODULE_SKILLS } from "./standard-invariants.test";

const REPO_ROOT = path.join(import.meta.dir, "..");

/** Every tool the Claude PreToolUse guard must see. */
const CLAUDE_GUARDED_TOOLS = [
  "Bash",
  "ScheduleWakeup",
  "Skill",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
] as const;

/** Every tool the Codex PreToolUse guard must see. */
const CODEX_GUARDED_TOOLS = ["Bash", "apply_patch"] as const;

/** The tools each agent that reads untrusted input must be denied. */
const RESTRICTED_TOOLS: Readonly<Record<string, readonly string[]>> = {
  "emet-reviewer": ["Edit", "Write", "NotebookEdit"],
  "emet-worker": ["Agent"],
};

function readText(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

/**
 * Reads the flat `key: value` frontmatter of a markdown file.
 * @param text The markdown text.
 * @returns The frontmatter fields, with JSON-quoted values unquoted.
 */
function frontmatter(text: string): Map<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  const fields = new Map<string, string>();
  for (const line of (match?.[1] ?? "").split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const raw = line.slice(separator + 1).trim();
    const parsed: unknown = raw.startsWith('"') ? JSON.parse(raw) : raw;
    fields.set(line.slice(0, separator).trim(), String(parsed));
  }
  return fields;
}

function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== "object" || current === null) return undefined;
    current = Object.getOwnPropertyDescriptor(current, key)?.value;
  }
  return current;
}

/**
 * Lists every skill the repo ships or tracks: the project skills and the
 * generated Codex skills.
 * @returns Each skill's directory name and `SKILL.md` path.
 */
function skillFiles(): { directory: string; file: string }[] {
  const project = MODULE_SKILLS.map((name) => ({
    directory: name,
    file: `.claude/skills/${name}/SKILL.md`,
  }));
  const codex = readdirSync(path.join(REPO_ROOT, "codex/skills")).map((name) => ({
    directory: name,
    file: `codex/skills/${name}/SKILL.md`,
  }));
  return [...project, ...codex];
}

describe("skills", () => {
  test("the contract covers the project skills and the three Codex skills", () => {
    expect(
      skillFiles()
        .map(({ directory }) => directory)
        .toSorted(),
    ).toEqual([...MODULE_SKILLS, "doctor", "init", "run"].toSorted());
  });

  test("each skill's name equals its directory and its description says Use when", () => {
    for (const { directory, file } of skillFiles()) {
      const fields = frontmatter(readText(file));
      expect(fields.get("name"), `${file} name`).toBe(directory);
      expect(fields.get("description") ?? "", `${file} description`).toContain("Use when");
    }
  });
});

describe("hook matchers", () => {
  test("the Claude PreToolUse guard is registered for every guarded tool", () => {
    const hooks: unknown = JSON.parse(readText("hooks/hooks.json"));
    const matcher = String(dig(hooks, "hooks", "PreToolUse", "0", "matcher"));
    expect(matcher.split("|").toSorted()).toEqual([...CLAUDE_GUARDED_TOOLS].toSorted());
    for (const event of ["PreToolUse", "SubagentStop", "Stop"]) {
      expect(String(dig(hooks, "hooks", event, "0", "hooks", "0", "command"))).toContain(
        '/bin/emet" guard',
      );
    }
  });

  test("the Codex PreToolUse guard is registered for every guarded tool", () => {
    const hooks: unknown = JSON.parse(readText("codex/hooks.json"));
    const matcher = String(dig(hooks, "hooks", "PreToolUse", "0", "matcher"));
    expect(matcher.split("|").toSorted()).toEqual([...CODEX_GUARDED_TOOLS].toSorted());
    for (const event of ["PreToolUse", "UserPromptSubmit", "Stop"]) {
      expect(String(dig(hooks, "hooks", event, "0", "hooks", "0", "command"))).toContain(
        "emet guard",
      );
    }
  });
});

describe("agents", () => {
  const agents = readdirSync(path.join(REPO_ROOT, "agents")).map((file) => ({
    file: `agents/${file}`,
    fields: frontmatter(readText(`agents/${file}`)),
  }));

  test("every agent's frontmatter pins its name, model and effort", () => {
    expect(agents.length).toBeGreaterThan(0);
    for (const { file, fields } of agents) {
      expect(`agents/${fields.get("name") ?? ""}.md`, `${file} name`).toBe(file);
      expect(fields.get("model") ?? "", `${file} model`).toMatch(/^(opus|sonnet|haiku)$/);
      expect(fields.get("effort") ?? "", `${file} effort`).toMatch(/^(low|medium|high|xhigh|max)$/);
    }
  });

  test("agents that read untrusted input are denied their restricted tools", () => {
    expect(agents.map(({ fields }) => fields.get("name") ?? "").toSorted()).toEqual(
      Object.keys(RESTRICTED_TOOLS).toSorted(),
    );
    for (const { file, fields } of agents) {
      const denied = (fields.get("disallowedTools") ?? "").split(",").map((tool) => tool.trim());
      const required = RESTRICTED_TOOLS[fields.get("name") ?? ""] ?? [];
      for (const tool of required) expect(denied, `${file} disallowedTools`).toContain(tool);
    }
  });
});

describe("PreToolUse guard launcher", () => {
  let pluginRoot = "";

  beforeEach(() => {
    pluginRoot = mkdtempSync(path.join(os.tmpdir(), "emet-contract-"));
    mkdirSync(path.join(pluginRoot, "bin"), { recursive: true });
    mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    copyFileSync(path.join(REPO_ROOT, "bin/emet"), path.join(pluginRoot, "bin/emet"));
    writeFileSync(
      path.join(pluginRoot, ".claude-plugin/plugin.json"),
      JSON.stringify({ name: "emet", version: "9.9.9" }),
    );
  });

  afterEach(() => {
    rmSync(pluginRoot, { recursive: true, force: true });
  });

  test("fails closed with exit 2 when the guard binary cannot be resolved", () => {
    const hooks: unknown = JSON.parse(readText("hooks/hooks.json"));
    const command = String(dig(hooks, "hooks", "PreToolUse", "0", "hooks", "0", "command"));
    const result = Bun.spawnSync(["sh", "-c", command], {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: pluginRoot,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        EMET_CACHE_DIR: path.join(pluginRoot, "cache"),
        EMET_RELEASE_BASE_URL: `file://${path.join(pluginRoot, "no-releases")}`,
      },
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("claude plugin disable emet");
    expect(existsSync(path.join(pluginRoot, "cache", "9.9.9", "emet"))).toBe(false);
  });
});

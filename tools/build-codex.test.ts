import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CODEX_USE_WHEN,
  FORBIDDEN_TOKENS,
  assertNoForbiddenTokens,
  buildHooks,
  buildPluginManifest,
  buildSkill,
  findForbiddenTokens,
  findStaleFiles,
  generateArtefacts,
  main,
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

  test("replaces the reviewer prompt fill and the browser axis with the review-run flag", () => {
    const output = transformPrompt(
      'Dispatch one `Agent({subagent_type: "emet:emet-reviewer"})`\nbuilt from `${CLAUDE_PLUGIN_ROOT}/emet/reference/reviewer-prompt.md` (fill `{{project_skills}}` with the\nunion; add\nthe spec\'s `## Global Constraints`) — single-pass.\n\nBrowser axis: fill `{{browser_verify}}` in the reviewer prompt (with the\nsection) only when `emet assess`\nprinted `browserVerify.run: true`; otherwise leave it empty.',
    );
    expect(output).toContain("--browser-verify true");
    expect(output).not.toContain("reviewer-prompt.md");
    expect(output).not.toContain("{{browser_verify}}");
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
    expect(() => {
      assertNoForbiddenTokens({ path: "codex/x.md", content: "ToolSearch" });
    }).toThrow("codex/x.md still contains Claude-only tokens: ToolSearch");
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

  test("buildSkill writes name and description frontmatter with its Use when clause", () => {
    expect(buildSkill("init", "---\ndescription: Do it\n---\nRun `emet init`\n")).toBe(
      `---\nname: init\ndescription: ${JSON.stringify(`Do it. ${CODEX_USE_WHEN.init}`)}\n---\nRun \`emet init\`\n`,
    );
  });

  test("buildSkill does not double a description's closing period", () => {
    expect(buildSkill("doctor", "---\ndescription: Check it.\n---\nBody\n")).toContain(
      `description: ${JSON.stringify(`Check it. ${CODEX_USE_WHEN.doctor}`)}\n`,
    );
  });

  test("every Codex Use when clause starts with Use when and ends with a period", () => {
    for (const clause of Object.values(CODEX_USE_WHEN)) {
      expect(clause).toMatch(/^Use when .+\.$/);
    }
  });

  test("buildPluginManifest mirrors the Claude version", () => {
    const manifest: unknown = JSON.parse(
      buildPluginManifest(
        '{"name":"emet","version":"1.2.3","description":"d","author":{"name":"A"},"homepage":"https://h.test","repository":"https://r.test","bugs":"https://r.test/issues","license":"MIT"}',
      ),
    );
    expect(manifest).toEqual({
      name: "emet",
      version: "1.2.3",
      description: "d",
      author: { name: "A" },
      homepage: "https://h.test",
      repository: "https://r.test",
      bugs: "https://r.test/issues",
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

  test("buildHooks runs the what's new notice on SessionStart", () => {
    const hooks: unknown = JSON.parse(buildHooks());
    expect(dig(hooks, "hooks", "SessionStart", "0", "hooks", "0", "command")).toBe(
      "EMET_AGENT_HOST=codex emet whats-new --hook",
    );
  });
});

describe("buildHooks Windows overrides", () => {
  const notice =
    'Write-Output \'{"systemMessage":"emet does not support native Windows; run Codex inside WSL, or disable the emet plugin."}\'';

  test("every hook carries its commandWindows override", () => {
    const hooks: unknown = JSON.parse(buildHooks());
    expect(dig(hooks, "hooks", "SessionStart", "0", "hooks", "0", "commandWindows")).toBe(notice);
    expect(dig(hooks, "hooks", "PreToolUse", "0", "hooks", "0", "commandWindows")).toBe("exit 0");
    expect(dig(hooks, "hooks", "UserPromptSubmit", "0", "hooks", "0", "commandWindows")).toBe(
      "exit 0",
    );
    expect(dig(hooks, "hooks", "Stop", "0", "hooks", "0", "commandWindows")).toBe("exit 0");
  });

  test("the POSIX command fields are unchanged", () => {
    const hooks: unknown = JSON.parse(buildHooks());
    expect(dig(hooks, "hooks", "PreToolUse", "0", "hooks", "0", "command")).toBe(
      "EMET_AGENT_HOST=codex emet guard",
    );
    expect(dig(hooks, "hooks", "Stop", "0", "hooks", "0", "command")).toBe(
      "EMET_AGENT_HOST=codex emet guard --event Stop",
    );
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

describe("buildPluginManifest validation", () => {
  test("rejects a manifest that is not an object", () => {
    expect(() => buildPluginManifest("null")).toThrow("is not an object");
  });

  test("rejects a manifest without a string version and description", () => {
    expect(() => buildPluginManifest('{"version":"1.0.0"}')).toThrow(
      "needs a string version and description",
    );
  });

  test("omits a non-string license", () => {
    const text = buildPluginManifest('{"version":"1.0.0","description":"d","license":7}');
    expect(dig(JSON.parse(text), "license")).toBeUndefined();
  });
});

function sandbox(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "emet-build-codex-"));
  mkdirSync(path.join(root, "tools"));
  cpSync(
    path.join(repoRoot, "tools", "build-codex.ts"),
    path.join(root, "tools", "build-codex.ts"),
  );
  for (const directory of ["commands", path.join("emet", "reference"), ".claude-plugin"]) {
    cpSync(path.join(repoRoot, directory), path.join(root, directory), { recursive: true });
  }
  return root;
}

function run(root: string, ...args: string[]) {
  return Bun.spawnSync(["bun", path.join(root, "tools", "build-codex.ts"), ...args]);
}

describe("build-codex entry point", () => {
  test("main writes, passes --check, then returns 1 naming the stale file", () => {
    const root = sandbox();
    try {
      const logs: string[] = [];
      const errors: string[] = [];
      expect(
        main(
          [],
          root,
          (m) => logs.push(m),
          (m) => errors.push(m),
        ),
      ).toBe(0);
      expect(logs[0]).toMatch(/^wrote \d+ Codex artefacts$/);
      expect(
        main(
          ["--check"],
          root,
          (m) => logs.push(m),
          (m) => errors.push(m),
        ),
      ).toBe(0);
      expect(errors).toEqual([]);

      writeFileSync(path.join(root, "codex", "hooks.json"), "{}");
      expect(
        main(
          ["--check"],
          root,
          (m) => logs.push(m),
          (m) => errors.push(m),
        ),
      ).toBe(1);
      expect(errors[0]).toContain("codex/hooks.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writes the artefacts, then passes --check, then fails --check once one is edited", () => {
    const root = sandbox();
    try {
      const written = run(root);
      expect(written.exitCode).toBe(0);
      expect(written.stdout.toString()).toMatch(/^wrote \d+ Codex artefacts/);
      expect(readFileSync(path.join(root, "codex", "hooks.json"), "utf8")).toBe(buildHooks());

      expect(run(root, "--check").exitCode).toBe(0);

      writeFileSync(path.join(root, "codex", "hooks.json"), "{}");
      const stale = run(root, "--check");
      expect(stale.exitCode).toBe(1);
      expect(stale.stderr.toString()).toContain("stale Codex artefacts");
      expect(stale.stderr.toString()).toContain("codex/hooks.json");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

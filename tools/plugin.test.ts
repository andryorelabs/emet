import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected an object");
  }
  return Object.fromEntries(Object.entries(value));
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("expected an array");
  return value.map(asRecord);
}

function readJson(relativePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${relativePath} is not an object`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

const plugin = readJson(".claude-plugin/plugin.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const hooks = readJson("hooks/hooks.json");
const pluginName = String(plugin["name"]);
const description =
  "Spec to merge on one approval: parallel workers in isolated worktrees, a review per wave, CI green before merge.";

function promptFiles(): string[] {
  const files: string[] = [];
  for (const file of readdirSync(path.join(repoRoot, "commands"))) files.push(`commands/${file}`);
  for (const file of readdirSync(path.join(repoRoot, "agents"))) files.push(`agents/${file}`);
  return files;
}

describe("plugin manifests", () => {
  test("plugin.json names the plugin, a version and the unconstrained skills dependency", () => {
    expect(pluginName).toBe("emet");
    expect(plugin["description"]).toBe(description);
    expect(plugin["version"]).toMatch(/^\d+\.\d+\.\d+/);
    expect(plugin["dependencies"]).toEqual([
      { name: "mattpocock-skills", marketplace: "claude-plugins-official" },
    ]);
  });

  test("marketplace.json allows the cross-marketplace dependency and lists the plugin", () => {
    expect(marketplace["name"]).toBe("emet-marketplace");
    expect(marketplace["allowCrossMarketplaceDependenciesOn"]).toEqual(["claude-plugins-official"]);
    const entries = asRecordArray(marketplace["plugins"]);
    expect(entries.map((entry) => entry["name"])).toEqual([pluginName]);
    expect(entries[0]?.["source"]).toBe("./");
    expect(entries[0]?.["description"]).toBe(description);
  });

  test("ships the emet-worker and emet-reviewer agents", () => {
    expect(readdirSync(path.join(repoRoot, "agents")).toSorted()).toEqual([
      "emet-reviewer.md",
      "emet-worker.md",
    ]);
  });

  test("commands/ holds exactly doctor.md, init.md and run.md", () => {
    const expected = ["doctor.md", "init.md", "run.md"];
    const unexpected = readdirSync(path.join(repoRoot, "commands")).filter(
      (file) => !expected.includes(file),
    );
    expect(unexpected).toEqual([]);
    expect(readdirSync(path.join(repoRoot, "commands")).toSorted()).toEqual(expected);
  });

  test("each command has a description and runs its emet subcommand", () => {
    for (const [file, call] of [
      ["init.md", "emet init"],
      ["doctor.md", "emet doctor"],
    ] as const) {
      const text = readFileSync(path.join(repoRoot, "commands", file), "utf8");
      expect(text).toMatch(/^---\ndescription: .+\n---\n/);
      expect(text).toContain(call);
    }
  });

  test("no manifest, agent or hook contains forge", () => {
    const files = [
      ".claude-plugin/plugin.json",
      ".claude-plugin/marketplace.json",
      "hooks/hooks.json",
      ...readdirSync(path.join(repoRoot, "agents")).map((file) => `agents/${file}`),
    ];
    const offending = files.filter((file) =>
      /forge/i.test(readFileSync(path.join(repoRoot, file), "utf8")),
    );
    expect(offending).toEqual([]);
  });

  test("the plugin name is the one string used by manifests, prompts and hooks", () => {
    expect(JSON.stringify(hooks)).toContain("${CLAUDE_PLUGIN_ROOT}/bin/emet");
    const prefixes = new Set<string>();
    for (const file of promptFiles()) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      for (const match of text.matchAll(/\b([a-z][a-z-]*):emet-(?:worker|reviewer)\b/g)) {
        prefixes.add(match[1] ?? "");
      }
      for (const match of text.matchAll(/(?<![\w/])\/([a-z][a-z-]*):run\b/g)) {
        prefixes.add(match[1] ?? "");
      }
    }
    for (const prefix of prefixes) expect(prefix).toBe(pluginName);
  });
});

describe("hooks.json", () => {
  const events = asRecord(hooks["hooks"]);

  function firstEntry(event: string): Record<string, unknown> {
    return asRecordArray(events[event])[0] ?? {};
  }

  function firstCommand(event: string): unknown {
    return asRecordArray(firstEntry(event)["hooks"])[0]?.["command"];
  }

  test("registers the guard on PreToolUse, SubagentStop and Stop", () => {
    expect(firstEntry("PreToolUse")["matcher"]).toBe(
      "Bash|ScheduleWakeup|Skill|Edit|Write|MultiEdit|NotebookEdit",
    );
    expect(firstCommand("PreToolUse")).toBe('"${CLAUDE_PLUGIN_ROOT}/bin/emet" guard');
    for (const event of ["SubagentStop", "Stop"]) {
      expect(firstCommand(event)).toBe(`"\${CLAUDE_PLUGIN_ROOT}/bin/emet" guard --event ${event}`);
    }
  });

  test("prefetches the binary on SessionStart", () => {
    expect(firstCommand("SessionStart")).toBe('EMET_PREFETCH=1 "${CLAUDE_PLUGIN_ROOT}/bin/emet"');
  });
});

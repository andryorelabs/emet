import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { type AgentHost, claudeHost } from "./agenthost";
import type { DependencyCheck } from "./dependencies";
import { isObject } from "./narrow";

/**
 * The skills `/emet` prompts name, and the mattpocock-skills versions they
 * were tested against. `emet doctor` and `emet preflight` check the
 * installed plugin against this; `tools/skills-contract.test.ts` fails when an
 * installed prompt names a skill that is not listed here.
 */
export const SKILLS_CONTRACT: {
  readonly names: readonly string[];
  readonly versionRange: string;
} = {
  names: [
    "code-review",
    "codebase-design",
    "diagnosing-bugs",
    "domain-modeling",
    "grill-with-docs",
    "grilling",
    "pr",
    "prototype",
    "research",
    "tdd",
    "to-spec",
    "to-tickets",
    "wayfinder",
  ],
  versionRange: ">=1.3.1 <2.0.0",
};

const SKILLS_PLUGIN_NAME = "mattpocock-skills";
const PLUGIN_LIST_TIMEOUT_MS = 5_000;

export type InstalledPlugin = {
  readonly id: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly installPath: string;
};

/** Reads `claude plugin list --json`; unparseable output yields an empty list. */
export function parsePluginListJson(output: string): readonly InstalledPlugin[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const plugins: InstalledPlugin[] = [];
  for (const entry of parsed) {
    if (!isObject(entry)) continue;
    const { id, version, enabled, installPath } = entry;
    if (typeof id !== "string" || typeof installPath !== "string") continue;
    plugins.push({
      id,
      version: typeof version === "string" ? version : "",
      enabled: enabled !== false,
      installPath,
    });
  }
  return plugins;
}

/** An unusable or absent host CLI yields an empty list. */
export function listInstalledPlugins(host: AgentHost = claudeHost): readonly InstalledPlugin[] {
  try {
    const result = Bun.spawnSync([...host.probes.pluginListCommand], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: PLUGIN_LIST_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) return [];
    return host.probes.parsePluginList(result.stdout.toString());
  } catch {
    return [];
  }
}

export function findPluginByName(
  plugins: readonly InstalledPlugin[],
  pluginName: string,
): InstalledPlugin | null {
  return plugins.find((plugin) => plugin.enabled && plugin.id.split("@")[0] === pluginName) ?? null;
}

/** Looks for `<installPath>/skills/<group>/<name>/SKILL.md` across every group. */
function findSkillFile(installPath: string, name: string): string | null {
  const skillsRoot = path.join(installPath, "skills");
  if (!existsSync(skillsRoot)) return null;
  for (const group of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    const candidate = path.join(skillsRoot, group.name, name, "SKILL.md");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** `<installPath>/agents/<name>.md` of a plugin that ships emet's agents. */
export function findPluginAgentFile(installPath: string, name: string): string | null {
  const candidate = path.join(installPath, "agents", `${name}.md`);
  return existsSync(candidate) ? candidate : null;
}

export function resolveSkillPath(
  name: string,
  plugins: readonly InstalledPlugin[] = listInstalledPlugins(),
): string | null {
  const plugin = findPluginByName(plugins, SKILLS_PLUGIN_NAME);
  return plugin === null ? null : findSkillFile(plugin.installPath, name);
}

/**
 * A missing skill is `unsatisfied` (preflight blocks); a version outside the
 * tested range is `indeterminate` (a warning). An absent plugin is left to the
 * `claude-plugin` check.
 */
export function checkSkillsContract(
  plugins: readonly InstalledPlugin[] = listInstalledPlugins(),
  host: AgentHost = claudeHost,
): DependencyCheck[] {
  const plugin = findPluginByName(plugins, SKILLS_PLUGIN_NAME);
  if (plugin === null) return [];

  const checks: DependencyCheck[] = [];
  const missing = SKILLS_CONTRACT.names.filter(
    (name) => findSkillFile(plugin.installPath, name) === null,
  );
  if (missing.length > 0) {
    checks.push({
      dependency: "skills-contract",
      status: "unsatisfied",
      summary: `mattpocock-skills ${plugin.version} is missing skills emet uses: ${missing.join(", ")}. Update the plugin:`,
      remedy: [host.probes.pluginRemedy(host.probes.skillsPluginId)],
      limitation: null,
    });
  }
  if (!Bun.semver.satisfies(plugin.version, SKILLS_CONTRACT.versionRange)) {
    checks.push({
      dependency: "skills-contract",
      status: "indeterminate",
      summary: `mattpocock-skills ${plugin.version} is outside the range emet was tested against (${SKILLS_CONTRACT.versionRange}); prompts may reference changed skills.`,
      remedy: [],
      limitation: null,
    });
  }
  return checks;
}

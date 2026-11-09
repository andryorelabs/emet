import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { isObject } from "./narrow";

/**
 * The execpolicy rules of a worker run (`unverified` location, see
 * {@link RULES_RELATIVE_PATH}): committing and the emet coordination
 * subcommands are allowed, pushing is forbidden. Execpolicy patterns have no
 * wildcard token, so `git -C <dir> ...` is allowed as the `["git", "-C"]`
 * prefix; a `git -C <dir> push` is denied by `emet guard`, not by these rules.
 */
export const COMMIT_RULES = `prefix_rule(pattern = ["git", "add"], decision = "allow")
prefix_rule(pattern = ["git", "commit"], decision = "allow")
prefix_rule(pattern = ["git", "status"], decision = "allow")
prefix_rule(pattern = ["git", "worktree"], decision = "allow")
prefix_rule(pattern = ["git", "-C"], decision = "allow")
prefix_rule(pattern = ["emet", ["dispatch", "review-run", "launch", "claims", "slots", "results", "handoff"]], decision = "allow")
prefix_rule(pattern = ["git", "push"], decision = "forbidden")
`;

/** Where the rules file lives inside the overlay (`unverified`). */
const RULES_RELATIVE_PATH = path.join("rules", "default.rules");
/** Files linked, never copied, from the user's Codex home. */
const LINKED_FILES = ["auth.json"] as const;
const MARKETPLACE_NAME = "emet-marketplace";
const PLUGIN_ID = `emet@${MARKETPLACE_NAME}`;
/** The emet plugin cache, the only part of `plugins/` linked from the source home (`unverified`). */
const PLUGIN_CACHE_RELATIVE_PATH = path.join("plugins", "cache", MARKETPLACE_NAME);
const NEVER_WRITTEN_EFFORTS: ReadonlySet<string> = new Set(["ultra"]);
const GUARD_COMMAND = "EMET_AGENT_HOST=codex emet guard";

/** The hooks file text that routes Codex hook events to `emet guard`. */
export function hooksFileText(): string {
  const guard = [{ type: "command", command: GUARD_COMMAND }];
  return `${JSON.stringify(
    {
      hooks: {
        PreToolUse: [{ matcher: "*", hooks: guard }],
        UserPromptSubmit: [{ hooks: guard }],
      },
    },
    null,
    2,
  )}\n`;
}

/** A TOML basic string; JSON string escapes are a subset TOML accepts. */
function tomlString(value: string): string {
  return JSON.stringify(value);
}

/** What the overlay `config.toml` carries for one run. */
type OverlayConfigOptions = {
  readonly marketplacePath?: string;
  readonly trustedDirectories: readonly string[];
  readonly model?: string;
  readonly effort?: string;
};

/**
 * The overlay `config.toml` text: the resolved model and effort, the local
 * emet marketplace with the emet plugin enabled, and a trusted project table
 * for each of the run's own directories. Nothing from the user's config is
 * copied, no `[hooks.state.*]` key is written (the run passes
 * `--dangerously-bypass-hook-trust`), and the `ultra` effort is never written.
 */
export function renderOverlayConfig(options: OverlayConfigOptions): string {
  const lines: string[] = [];
  if (options.model !== undefined) lines.push(`model = ${tomlString(options.model)}`);
  if (options.effort !== undefined && !NEVER_WRITTEN_EFFORTS.has(options.effort)) {
    lines.push(`model_reasoning_effort = ${tomlString(options.effort)}`);
  }
  const tables: string[][] = [];
  if (options.marketplacePath !== undefined) {
    tables.push(
      [
        `[marketplaces.${MARKETPLACE_NAME}]`,
        'source_type = "local"',
        `source = ${tomlString(options.marketplacePath)}`,
      ],
      [`[plugins.${tomlString(PLUGIN_ID)}]`, "enabled = true"],
    );
  }
  for (const directory of options.trustedDirectories) {
    tables.push([`[projects.${tomlString(directory)}]`, 'trust_level = "trusted"']);
  }
  const blocks = [...(lines.length > 0 ? [lines] : []), ...tables];
  return blocks.map((block) => `${block.join("\n")}\n`).join("\n");
}

function sourceCodexHome(sourceHome: string | undefined): string {
  if (sourceHome !== undefined) return sourceHome;
  const fromEnv = process.env["CODEX_HOME"];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : path.join(homedir(), ".codex");
}

/**
 * The local emet marketplace path the source home's `config.toml` registers
 * (`unverified`: only a `source_type = "local"` marketplace is carried over).
 * The source config is only read; an absent or unparsable file yields none.
 */
function sourceMarketplacePath(source: string): string | undefined {
  const configPath = path.join(source, "config.toml");
  if (!existsSync(configPath)) return undefined;
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(readFileSync(configPath, "utf8"));
  } catch {
    return undefined;
  }
  const marketplaces = isObject(parsed) ? parsed["marketplaces"] : undefined;
  const entry = isObject(marketplaces) ? marketplaces[MARKETPLACE_NAME] : undefined;
  if (!isObject(entry) || entry["source_type"] !== "local") return undefined;
  const marketplaceSource = entry["source"];
  return typeof marketplaceSource === "string" ? marketplaceSource : undefined;
}

/** Removes whatever sits at `target` (a stale link included) without following links. */
function clearPath(target: string): void {
  try {
    lstatSync(target);
  } catch {
    mkdirSync(path.dirname(target), { recursive: true });
    return;
  }
  rmSync(target, { recursive: true, force: true });
}

function replaceWithSymlink(target: string, linkPath: string): void {
  clearPath(linkPath);
  symlinkSync(target, linkPath);
}

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** What {@link buildRunHome} needs; every field past `repoRoot` is optional. */
type RunHomeOptions = {
  readonly run: string;
  readonly repoRoot: string;
  readonly sourceHome?: string;
  readonly trustedDirectories?: readonly string[];
  readonly model?: string;
  readonly effort?: string;
};

/**
 * Builds the per-run `CODEX_HOME` overlay at `<repoRoot>/.emet/runs/<run>/codex-home/`.
 * The user's `auth.json` is symlinked in (never copied, so no secret lands in
 * the run directory) and so is the emet marketplace plugin cache when the
 * source has one. `config.toml` is generated by {@link renderOverlayConfig},
 * never linked, so Codex's own trust writes stay in the overlay. The rules
 * file and the hooks file are written fresh. Nothing is ever written under the
 * source home.
 */
export function buildRunHome(opts: RunHomeOptions): { codexHome: string } {
  if (!RUN_ID_PATTERN.test(opts.run)) {
    throw new Error(`invalid run id for a Codex home overlay: ${JSON.stringify(opts.run)}`);
  }
  const codexHome = path.join(opts.repoRoot, ".emet", "runs", opts.run, "codex-home");
  const source = path.resolve(sourceCodexHome(opts.sourceHome));
  const relative = path.relative(source, path.resolve(codexHome));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`refusing to build a run home inside the source Codex home: ${source}`);
  }
  mkdirSync(codexHome, { recursive: true });
  for (const name of LINKED_FILES) {
    const original = path.join(source, name);
    if (existsSync(original)) replaceWithSymlink(original, path.join(codexHome, name));
  }
  const pluginCache = path.join(source, PLUGIN_CACHE_RELATIVE_PATH);
  if (existsSync(pluginCache)) {
    replaceWithSymlink(pluginCache, path.join(codexHome, PLUGIN_CACHE_RELATIVE_PATH));
  }
  const configPath = path.join(codexHome, "config.toml");
  clearPath(configPath);
  const marketplacePath = sourceMarketplacePath(source);
  writeFileSync(
    configPath,
    renderOverlayConfig({
      trustedDirectories: opts.trustedDirectories ?? [],
      ...(marketplacePath === undefined ? {} : { marketplacePath }),
      ...(opts.model === undefined ? {} : { model: opts.model }),
      ...(opts.effort === undefined ? {} : { effort: opts.effort }),
    }),
  );
  const rulesPath = path.join(codexHome, RULES_RELATIVE_PATH);
  mkdirSync(path.dirname(rulesPath), { recursive: true });
  writeFileSync(rulesPath, COMMIT_RULES);
  writeFileSync(path.join(codexHome, "hooks.json"), hooksFileText());
  return { codexHome };
}

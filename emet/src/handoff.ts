/**
 * Validates and renders `.emet/handoff-AO-<n>.md` notes — the durable
 * checkpoint a `/emet` worker writes at three fixed triggers (first green
 * test, each closed dead-end, before each E2E run) so a compaction or a
 * successor session never has to re-investigate from scratch.
 *
 * Format (plain `key: value` sections, no YAML dependency): a line matching
 * `^(state|done|next|dead-ends|invariants|files|commands|skills):` starts a
 * section; everything until the next section header belongs to it.
 *
 * Usage:
 *   emet handoff --check <path>    # exit 1 with reasons on any violation
 *   emet handoff --render <path>   # print a Linear-comment-ready body
 */

import {
  DEFAULT_FORGE_CONFIG,
  loadForgeConfigWithDefaults,
  resolveRepoRoot,
  type ForgeConfig,
} from "./config";
import { present } from "./present";

const REQUIRED_SECTIONS = [
  "state",
  "done",
  "next",
  "dead-ends",
  "invariants",
  "files",
  "commands",
] as const;

const SECTION_KEYS = [...REQUIRED_SECTIONS, "skills"] as const;

const SKILLS_FORMAT = "skills: none | skills: loaded: a, b; missing: c";

const SKILLS_PATTERN = /^loaded:\s*([^;]*?)\s*;\s*missing:\s*(.*)$/is;

const VALID_STATES = ["investigating", "implementing", "blocked", "done"];

/**
 * Fallback budget when a caller doesn't pass one explicitly — historically
 * hardcoded, now sourced from `emet.config.json`'s `handoff.maxLines`/
 * `maxChars`. See {@link checkHandoff}.
 */
const MAX_LINES = 60;
const MAX_CHARS = 8000;

interface SkillsLists {
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
}

function splitNames(value: string): string[] {
  const names = value
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== "none");
  return [...new Set(names)];
}

/**
 * Parses a `skills:` value (continuation lines joined) into its two lists;
 * `none` yields empty lists, anything else off-format yields `undefined`.
 */
function parseSkillsValue(value: string): SkillsLists | undefined {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.toLowerCase() === "none") return { loaded: [], missing: [] };
  const match = SKILLS_PATTERN.exec(flat);
  if (!match) return undefined;
  return { loaded: splitNames(match[1] ?? ""), missing: splitNames(match[2] ?? "") };
}

/** Splits a `--expect-skills` value into trimmed, de-duplicated, non-empty names. */
function parseExpectedSkills(value: string | undefined): string[] {
  return value === undefined ? [] : splitNames(value);
}

interface HandoffReport {
  readonly problems: string[];
  readonly missingSkills: string[];
}

type Sections = Map<string, string>;

function parseSections(content: string): Sections {
  const sections: Sections = new Map();
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentKey) {
      sections.set(currentKey, currentLines.join("\n").trim());
    }
  };

  for (const line of content.split("\n")) {
    const match = /^([a-z-]+):\s?(.*)$/i.exec(line);
    const key = match?.[1]?.toLowerCase();
    if (key && (SECTION_KEYS as readonly string[]).includes(key)) {
      flush();
      currentKey = key;
      const firstLine = match?.[2];
      currentLines = firstLine ? [firstLine] : [];
    } else if (currentKey) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

function checkHandoff(
  content: string,
  path: string,
  maxLines: number = MAX_LINES,
  maxChars: number = MAX_CHARS,
  expectedSkills: readonly string[] = [],
): HandoffReport {
  const problems: string[] = [];
  const lineCount = content.split("\n").length;

  if (lineCount > maxLines) {
    problems.push(
      `${path}: ${lineCount} lines exceeds the ${maxLines}-line budget — trim it, this is a checkpoint, not a log`,
    );
  }
  if (content.length > maxChars) {
    problems.push(
      `${path}: ${content.length} chars exceeds the ~${maxChars}-char (~2k token) budget`,
    );
  }

  const sections = parseSections(content);

  for (const key of REQUIRED_SECTIONS) {
    if (!sections.has(key) || present(sections.get(key)).length === 0) {
      problems.push(`${path}: missing or empty required section "${key}:"`);
    }
  }

  const state = sections.get("state")?.trim();
  if (state && !VALID_STATES.includes(state)) {
    problems.push(`${path}: "state: ${state}" is not one of ${VALID_STATES.join(" | ")}`);
  }

  const deadEnds = sections.get("dead-ends")?.trim() ?? "";
  if (state && state !== "done" && deadEnds.length === 0) {
    problems.push(
      `${path}: state is "${state}" but "dead-ends:" is empty — a still-open ticket that has tried and failed anything must record it here, that's the field that pays for this whole mechanism`,
    );
  }

  const skillsRaw = sections.get("skills")?.trim() ?? "";
  const skills = skillsRaw.length > 0 ? parseSkillsValue(skillsRaw) : undefined;
  if (skillsRaw.length > 0 && !skills) {
    problems.push(
      `${path}: "skills: ${skillsRaw.replace(/\s+/g, " ")}" must be "none" or "loaded: a, b; missing: c"`,
    );
  } else if (state === "done" && !skills) {
    problems.push(
      `${path}: state is "done" so "skills:" is required — write it as \`${SKILLS_FORMAT}\` (loaded: skills you used; missing: ones you could not load)`,
    );
  }
  for (const expected of expectedSkills) {
    if (!skills?.loaded.includes(expected) && !skills?.missing.includes(expected)) {
      problems.push(
        `${path}: expected skill "${expected}" is in neither the loaded nor the missing list of "skills:"`,
      );
    }
  }

  return { problems, missingSkills: skills ? [...skills.missing] : [] };
}

/**
 * Extracts the ticket reference from a `.emet/handoff-<ticket>.md` path —
 * deliberately generic (`.+` rather than a config-sourced `ticket.idPattern`
 * spliced into a filename regex, which would need to strip that pattern's
 * own `^`/`$` anchors to compose safely) so it never needs to match this
 * repo's `ticket.idPattern` exactly. `reference/worker-prompt.md`'s
 * `{{handoff_path}}` is what actually fixes the filename shape at
 * write-time; this only has to extract whatever's there for the rendered
 * heading.
 */
function ticketReferenceFromPath(path: string): string {
  const match = /handoff-(.+)\.md$/i.exec(path);
  return match?.[1] ?? "ticket";
}

async function main(config: ForgeConfig): Promise<void> {
  const cliArguments = process.argv.slice(2);
  const mode = cliArguments[0];
  const targetPath = cliArguments[1];

  if (!targetPath || (mode !== "--check" && mode !== "--render")) {
    console.error("usage: emet handoff --check <path> [--expect-skills a,b] | --render <path>");
    process.exitCode = 1;
    return;
  }

  const file = Bun.file(targetPath);
  if (!(await file.exists())) {
    console.error(`${targetPath}: not found`);
    process.exitCode = 1;
    return;
  }
  const content = await file.text();

  if (mode === "--check") {
    const expectFlag = cliArguments.indexOf("--expect-skills");
    const { problems, missingSkills } = checkHandoff(
      content,
      targetPath,
      config.handoff.maxLines,
      config.handoff.maxChars,
      expectFlag === -1 ? [] : parseExpectedSkills(cliArguments[expectFlag + 1]),
    );
    if (problems.length > 0) {
      console.error("emet:handoff --check failed:");
      for (const problem of problems) {
        console.error(`  - ${problem}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`emet:handoff --check OK (${targetPath})`);
    if (missingSkills.length > 0) console.log(`missing skills: ${missingSkills.join(", ")}`);
    return;
  }

  const ticketReference = ticketReferenceFromPath(targetPath);
  console.log(`## Handoff — ${ticketReference}\n\n${content.trim()}`);
}

/**
 * Entry point invoked by the `emet` CLI dispatcher (`bin/emet.ts`) for the
 * `handoff` subcommand. See `claims.ts`'s `run()` for why this stages `argv`
 * onto `process.argv` rather than threading it through `main()` directly.
 *
 * This file previously had **no** `import.meta.main` guard at all — a bare
 * top-level `await main()` — so merely importing it for a test would run the
 * CLI. Fixed here as part of the extraction; it is the only one of the nine
 * modules that had this gap, and the only one still lacking a test file.
 */
export async function run(argv: string[]): Promise<void> {
  process.argv = [...process.argv.slice(0, 2), ...argv];
  try {
    const repoRoot = await resolveRepoRoot();
    const { config, note } = repoRoot
      ? await loadForgeConfigWithDefaults(repoRoot)
      : { config: DEFAULT_FORGE_CONFIG, note: undefined };
    if (note) console.error(note);
    await main(config);
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

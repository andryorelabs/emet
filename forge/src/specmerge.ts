import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { errorMessage, isOneOf } from "./narrow";

const USAGE = `usage: forge spec-merge --spec <id> [--root <dir>]

Merges the ADDED/MODIFIED/REMOVED deltas in .forge/runs/<id>/spec-deltas/<area>.md
into <specs.dir>/<area>.md, keyed by requirement name. Every area is checked before
anything is written; any conflict or scenario loss aborts with exit 1 and no file
is touched.`;

interface Requirement {
  readonly name: string;
  readonly scenarios: readonly string[];
  readonly raw: string;
}

export interface ParsedSpec {
  readonly preamble: string;
  readonly requirements: readonly Requirement[];
}

export type MergeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly conflicts: readonly string[] };

const DELTA_KINDS = ["ADDED", "MODIFIED", "REMOVED"] as const;
type DeltaKind = (typeof DELTA_KINDS)[number];

const REQUIREMENT_HEADING = /^### Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADING = /^#### Scenario:\s*(.+?)\s*$/;
const DELTA_HEADING = /^## (ADDED|MODIFIED|REMOVED) Requirements\s*$/;
const BOUNDARY_HEADING = /^#{1,3} /;

function buildRequirement(name: string, lines: string[]): Requirement {
  const scenarios = lines.flatMap((line) => {
    const match = SCENARIO_HEADING.exec(line);
    return match ? [match[1]!] : [];
  });
  return { name, scenarios, raw: lines.join("\n").trimEnd() };
}

export function parseRequirements(text: string): ParsedSpec {
  const preamble: string[] = [];
  const requirements: Requirement[] = [];
  let currentName: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentName !== null) requirements.push(buildRequirement(currentName, currentLines));
    currentName = null;
    currentLines = [];
  };

  for (const line of text.split("\n")) {
    const heading = REQUIREMENT_HEADING.exec(line);
    if (heading) {
      flush();
      currentName = heading[1]!;
      currentLines = [line];
    } else if (currentName !== null && BOUNDARY_HEADING.test(line)) {
      flush();
      preamble.push(line);
    } else if (currentName !== null) {
      currentLines.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();
  return { preamble: preamble.join("\n").trim(), requirements };
}

function parseDelta(delta: string): Record<DeltaKind, Requirement[]> | null {
  const sections: Record<DeltaKind, string[]> = { ADDED: [], MODIFIED: [], REMOVED: [] };
  let kind: DeltaKind | null = null;
  let found = false;
  for (const line of delta.split("\n")) {
    const heading = DELTA_HEADING.exec(line);
    const headingKind = heading?.[1];
    if (isOneOf(DELTA_KINDS, headingKind)) {
      kind = headingKind;
      found = true;
    } else if (line.startsWith("## ")) {
      kind = null;
    } else if (kind !== null) {
      sections[kind].push(line);
    }
  }
  if (!found) return null;
  return {
    ADDED: parseRequirements(sections.ADDED.join("\n")).requirements.slice(),
    MODIFIED: parseRequirements(sections.MODIFIED.join("\n")).requirements.slice(),
    REMOVED: parseRequirements(sections.REMOVED.join("\n")).requirements.slice(),
  };
}

function render(preamble: string, requirements: readonly Requirement[]): string {
  const parts = [...(preamble.length > 0 ? [preamble] : []), ...requirements.map((r) => r.raw)];
  return `${parts.join("\n\n")}\n`;
}

export function applyDelta(baseText: string, deltaText: string): MergeResult {
  const delta = parseDelta(deltaText);
  if (delta === null) {
    return {
      ok: false,
      conflicts: ['delta has no "## ADDED|MODIFIED|REMOVED Requirements" section'],
    };
  }
  const base = parseRequirements(baseText);
  const byName = new Map(base.requirements.map((requirement) => [requirement.name, requirement]));
  const conflicts: string[] = [];

  const seenIn = new Map<string, DeltaKind>();
  for (const kind of ["ADDED", "MODIFIED", "REMOVED"] as const) {
    for (const requirement of delta[kind]) {
      const previous = seenIn.get(requirement.name);
      if (previous !== undefined) {
        conflicts.push(
          `"${requirement.name}" appears in both ${previous} and ${kind} (or twice in one section)`,
        );
      }
      seenIn.set(requirement.name, kind);
    }
  }

  for (const requirement of delta.ADDED) {
    if (byName.has(requirement.name)) {
      conflicts.push(`ADDED "${requirement.name}" already exists`);
    }
  }
  for (const requirement of delta.MODIFIED) {
    const existing = byName.get(requirement.name);
    if (existing === undefined) {
      conflicts.push(`MODIFIED "${requirement.name}" does not exist`);
      continue;
    }
    const kept = new Set(requirement.scenarios);
    for (const scenario of existing.scenarios) {
      if (!kept.has(scenario)) {
        conflicts.push(
          `MODIFIED "${requirement.name}" drops scenario "${scenario}" (scenario loss); restate it or REMOVE the requirement`,
        );
      }
    }
  }
  for (const requirement of delta.REMOVED) {
    if (!byName.has(requirement.name)) {
      conflicts.push(`REMOVED "${requirement.name}" does not exist`);
    }
  }
  if (conflicts.length > 0) return { ok: false, conflicts };

  const modified = new Map(delta.MODIFIED.map((requirement) => [requirement.name, requirement]));
  const removed = new Set(delta.REMOVED.map((requirement) => requirement.name));
  const merged = base.requirements
    .filter((requirement) => !removed.has(requirement.name))
    .map((requirement) => modified.get(requirement.name) ?? requirement);
  return { ok: true, text: render(base.preamble, [...merged, ...delta.ADDED]) };
}

export interface AreaDelta {
  readonly area: string;
  readonly delta: string;
}

export type MergeAllResult =
  | { readonly ok: true; readonly written: readonly string[] }
  | { readonly ok: false; readonly conflicts: readonly string[] };

const SAFE_AREA = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function mergeSpecDeltas(
  specsDirectory: string,
  deltas: readonly AreaDelta[],
): MergeAllResult {
  const conflicts: string[] = [];
  const pending: { filePath: string; text: string }[] = [];
  const seenAreas = new Set<string>();

  for (const { area, delta } of deltas) {
    if (!SAFE_AREA.test(area) || area.includes("..")) {
      conflicts.push(`${area}: invalid area name`);
      continue;
    }
    if (seenAreas.has(area)) {
      conflicts.push(`${area}: given more than once`);
      continue;
    }
    seenAreas.add(area);
    const filePath = path.join(specsDirectory, `${area}.md`);
    const base = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
    const result = applyDelta(base, delta);
    if (result.ok) pending.push({ filePath, text: result.text });
    else conflicts.push(...result.conflicts.map((conflict) => `${area}: ${conflict}`));
  }
  if (conflicts.length > 0) return { ok: false, conflicts };

  mkdirSync(specsDirectory, { recursive: true });
  const staged: { temporaryPath: string; filePath: string }[] = [];
  try {
    for (const { filePath, text } of pending) {
      const temporaryPath = `${filePath}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, text);
      staged.push({ temporaryPath, filePath });
    }
  } catch (error) {
    for (const { temporaryPath } of staged) rmSync(temporaryPath, { force: true });
    throw error;
  }
  for (const { temporaryPath, filePath } of staged) renameSync(temporaryPath, filePath);
  return { ok: true, written: pending.map((entry) => entry.filePath) };
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export async function run(argv: string[]): Promise<void> {
  const specId = readFlag(argv, "--spec");
  if (specId === undefined || specId.length === 0 || /[\\/]|^\.\.?$/.test(specId)) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  try {
    const root = readFlag(argv, "--root") ?? (await resolveRepoRoot()) ?? process.cwd();
    const { config } = await loadForgeConfigWithDefaults(root);
    const deltaDirectory = path.join(root, ".forge", "runs", specId, "spec-deltas");
    if (!existsSync(deltaDirectory)) {
      console.error(`forge spec-merge: no deltas at ${deltaDirectory}`);
      process.exitCode = 2;
      return;
    }
    const deltas = readdirSync(deltaDirectory)
      .filter((file) => file.endsWith(".md"))
      .toSorted()
      .map((file) => ({
        area: file.slice(0, -".md".length),
        delta: readFileSync(path.join(deltaDirectory, file), "utf8"),
      }));
    const result = mergeSpecDeltas(path.join(root, config.specs.dir), deltas);
    if (!result.ok) {
      for (const conflict of result.conflicts) console.error(`conflict: ${conflict}`);
      process.exitCode = 1;
      return;
    }
    for (const written of result.written) console.log(path.relative(root, written));
  } catch (error) {
    console.error(`forge spec-merge: ${errorMessage(error)}`);
    process.exitCode = 2;
  }
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AGENTS_DOC,
  BINARY,
  CONFIG_FILE,
  LEGACY_AGENTS_DOC,
  LEGACY_CONFIG_FILE,
  LEGACY_PRODUCT,
  LEGACY_RUN_DIR,
  PRODUCT,
  RUN_DIR,
  TODO_MARKER,
} from "./names.ts";

/** One change `emet migrate` makes; paths are relative to the repo root. */
export type MigrationStep =
  | {
      readonly kind: "rename";
      readonly from: string;
      readonly to: string;
      readonly tracked: boolean;
    }
  | {
      readonly kind: "remove";
      readonly path: string;
      readonly tracked: boolean;
      readonly duplicateOf: string;
    }
  | { readonly kind: "rewrite"; readonly path: string; readonly description: string };

/** What `runMigration` did, or would do under `dryRun`. */
export interface MigrationResult {
  readonly steps: readonly MigrationStep[];
  readonly applied: boolean;
}

/** A legacy path whose new-name target already exists with different content. */
export class MigrationConflictError extends Error {
  readonly legacyPath: string;
  readonly targetPath: string;

  constructor(legacyPath: string, targetPath: string) {
    super(
      `cannot migrate ${legacyPath} to ${targetPath}: both exist with different content; ` +
        "merge them by hand and rerun",
    );
    this.name = "MigrationConflictError";
    this.legacyPath = legacyPath;
    this.targetPath = targetPath;
  }
}

const LEGACY_TODO_MARKER = `TODO(${LEGACY_PRODUCT}):`;
const LEGACY_SCHEMA_TAIL = `${LEGACY_PRODUCT}/schema/${LEGACY_PRODUCT}.config.schema.json`;
const EMET_SCHEMA_TAIL = `${PRODUCT}/schema/${PRODUCT}.config.schema.json`;
const LEGACY_MARKER_PATTERN = new RegExp(`<!-- ${LEGACY_PRODUCT}:(begin|end) -->`, "g");
const LEGACY_COMMENT_PREFIX = `# ${LEGACY_PRODUCT} `;
const GITIGNORE = ".gitignore";
const AGENTS_DOC_DIR = path.posix.dirname(AGENTS_DOC);
const PROSE_FILES: readonly string[] = ["AGENTS.md", "CLAUDE.md"];

function runGit(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function isTracked(root: string, relativePath: string): boolean {
  try {
    return runGit(root, ["ls-files", "--", relativePath]).trim().length > 0;
  } catch {
    return false;
  }
}

function listFiles(root: string, relativeDir: string): string[] {
  const absolute = path.join(root, relativeDir);
  const found: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(root, child));
    else found.push(child);
  }
  return found;
}

function sameContent(root: string, first: string, second: string): boolean {
  return fs.readFileSync(path.join(root, first)).equals(fs.readFileSync(path.join(root, second)));
}

function swapGitignoreLine(line: string): string {
  const negated = line.startsWith("!");
  const body = negated ? line.slice(1) : line;
  if (body === LEGACY_RUN_DIR || body.startsWith(`${LEGACY_RUN_DIR}/`)) {
    return `${negated ? "!" : ""}${RUN_DIR}${body.slice(LEGACY_RUN_DIR.length)}`;
  }
  if (line.startsWith(LEGACY_COMMENT_PREFIX)) {
    return `# ${PRODUCT} ${line.slice(LEGACY_COMMENT_PREFIX.length)}`;
  }
  return line;
}

/** The content a migrated file should have; identical to `text` when nothing is legacy. */
function rewriteContent(relativePath: string, text: string): string {
  if (relativePath === GITIGNORE) return text.split("\n").map(swapGitignoreLine).join("\n");
  let updated = text.split(LEGACY_TODO_MARKER).join(TODO_MARKER);
  updated = updated.replace(LEGACY_MARKER_PATTERN, `<!-- ${PRODUCT}:$1 -->`);
  if (relativePath.endsWith(".json")) {
    updated = updated.split(LEGACY_SCHEMA_TAIL).join(EMET_SCHEMA_TAIL);
  }
  return updated;
}

function describeRewrite(relativePath: string): string {
  if (relativePath === GITIGNORE) return `rename ${LEGACY_RUN_DIR}/ entries to ${RUN_DIR}/`;
  return `${LEGACY_PRODUCT} markers, TODO tags and $schema to ${PRODUCT}`;
}

function planFileRename(root: string, legacy: string, current: string): MigrationStep[] {
  if (!fs.existsSync(path.join(root, legacy))) return [];
  const tracked = isTracked(root, legacy);
  if (!fs.existsSync(path.join(root, current))) {
    return [{ kind: "rename", from: legacy, to: current, tracked }];
  }
  if (sameContent(root, legacy, current)) {
    return [{ kind: "remove", path: legacy, tracked, duplicateOf: current }];
  }
  throw new MigrationConflictError(legacy, current);
}

function planDirRename(root: string, legacy: string, current: string): MigrationStep[] {
  if (!fs.existsSync(path.join(root, legacy))) return [];
  if (!fs.existsSync(path.join(root, current))) {
    return [{ kind: "rename", from: legacy, to: current, tracked: isTracked(root, legacy) }];
  }
  const steps: MigrationStep[] = [];
  for (const file of listFiles(root, legacy)) {
    const target = `${current}${file.slice(legacy.length)}`;
    steps.push(...planFileRename(root, file, target));
  }
  return steps;
}

function candidateRewriteFiles(root: string): string[] {
  const candidates = [LEGACY_CONFIG_FILE, CONFIG_FILE, GITIGNORE, ...PROSE_FILES];
  candidates.push(LEGACY_AGENTS_DOC, AGENTS_DOC);
  const docsDir = path.join(root, AGENTS_DOC_DIR);
  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir)) {
      if (entry.endsWith(".md")) candidates.push(path.posix.join(AGENTS_DOC_DIR, entry));
    }
  }
  return [...new Set(candidates)].filter((file) => fs.existsSync(path.join(root, file)));
}

function planRewrites(root: string, renames: readonly MigrationStep[]): MigrationStep[] {
  const finalPaths = new Map<string, string>();
  for (const step of renames) {
    if (step.kind === "rename") finalPaths.set(step.from, step.to);
  }
  const removed = new Set(renames.flatMap((step) => (step.kind === "remove" ? [step.path] : [])));
  const steps: MigrationStep[] = [];
  for (const file of candidateRewriteFiles(root)) {
    if (removed.has(file)) continue;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (rewriteContent(file, text) === text) continue;
    steps.push({
      kind: "rewrite",
      path: finalPaths.get(file) ?? file,
      description: describeRewrite(file),
    });
  }
  return steps;
}

/**
 * Lists what migrating `root` to the new names would change, in apply order.
 * Empty when the repo is already migrated. Throws `MigrationConflictError`
 * when a legacy file and its new-name target differ.
 */
export function planMigration(root: string): MigrationStep[] {
  const renames = [
    ...planFileRename(root, LEGACY_CONFIG_FILE, CONFIG_FILE),
    ...planFileRename(root, LEGACY_AGENTS_DOC, AGENTS_DOC),
    ...planDirRename(root, LEGACY_RUN_DIR, RUN_DIR),
  ];
  return [...renames, ...planRewrites(root, renames)];
}

function applyRename(root: string, step: { from: string; to: string; tracked: boolean }): void {
  fs.mkdirSync(path.dirname(path.join(root, step.to)), { recursive: true });
  if (step.tracked) runGit(root, ["mv", "--", step.from, step.to]);
  else fs.renameSync(path.join(root, step.from), path.join(root, step.to));
}

function applyRemove(root: string, step: { path: string; tracked: boolean }): void {
  if (step.tracked) runGit(root, ["rm", "-q", "-f", "--", step.path]);
  else fs.rmSync(path.join(root, step.path));
}

function pruneEmptyDirs(directory: string): void {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(directory, entry.name));
  }
  if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
}

function applyRewrite(root: string, relativePath: string): void {
  const absolute = path.join(root, relativePath);
  const text = fs.readFileSync(absolute, "utf8");
  const updated = rewriteContent(relativePath, text);
  if (updated !== text) fs.writeFileSync(absolute, updated);
}

/**
 * Migrates `root` to the new names, using `git mv` for tracked paths. Under
 * `dryRun` it only plans. Safe to rerun: a migrated repo yields no steps.
 */
export function runMigration(root: string, options: { dryRun: boolean }): MigrationResult {
  const steps = planMigration(root);
  if (options.dryRun || steps.length === 0) return { steps, applied: false };
  for (const step of steps) {
    if (step.kind === "rename") applyRename(root, step);
    else if (step.kind === "remove") applyRemove(root, step);
    else applyRewrite(root, step.path);
  }
  pruneEmptyDirs(path.join(root, LEGACY_RUN_DIR));
  return { steps, applied: true };
}

/** One human-readable line for `step`. */
function describeStep(step: MigrationStep): string {
  if (step.kind === "rename") {
    return `${step.tracked ? "git mv" : "mv"} ${step.from} -> ${step.to}`;
  }
  if (step.kind === "remove") return `remove ${step.path} (same as ${step.duplicateOf})`;
  return `rewrite ${step.path}: ${step.description}`;
}

function repoRoot(cwd: string): string {
  try {
    return runGit(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return cwd;
  }
}

/** `emet migrate [--dry-run]`: migrates the repo containing the cwd. */
export function run(argv: string[]): void {
  const unknown = argv.filter((arg) => arg !== "--dry-run");
  if (unknown.length > 0) {
    console.error(`usage: ${BINARY} migrate [--dry-run]`);
    process.exitCode = 2;
    return;
  }
  const dryRun = argv.includes("--dry-run");
  let result: MigrationResult;
  try {
    result = runMigration(repoRoot(process.cwd()), { dryRun });
  } catch (error: unknown) {
    if (error instanceof MigrationConflictError) {
      console.error(`${BINARY}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
  if (result.steps.length === 0) {
    console.log("nothing to migrate");
    return;
  }
  const heading = dryRun ? "would migrate:" : "migrated:";
  console.log([heading, ...result.steps.map((step) => `  ${describeStep(step)}`)].join("\n"));
}

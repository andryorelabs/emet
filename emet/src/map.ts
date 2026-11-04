import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadForgeConfigWithDefaults, resolveRepoRoot } from "./config";
import { classifyPackageManager, type PackageManager } from "./init";
import { globsOverlap } from "./surfaces";

/**
 * `emet map` — the brownfield brief (S18). Generates `map.path`
 * (default `docs/agents/codebase.md`) deterministically from the repo: package
 * manifests, the tracked tree, test files and churn from `git log`. No
 * timestamps, no model calls — the same commit always yields the same file.
 * The file is stamped with the commit SHA it was built from so `--stale` can
 * tell when HEAD has moved past it, and `--for <globs>` prints only the
 * bullets whose path overlaps the given edit surfaces (Kiro `fileMatch` style).
 */

const USAGE = `usage: emet map [--refresh]
       emet map --stale [--max <commits>]
       emet map --for <glob>[,<glob>...]

  (no flag) / --refresh   regenerate the map at map.path, stamped with HEAD
  --stale                 exit 1 when the map is missing, or HEAD is more than
                          --max (default ${defaultMaxCommits()}) commits past the stamp
                          touching mapped areas
  --for <globs>           print only the map sections matching these globs`;

function defaultMaxCommits(): number {
  return 10;
}

const STAMP_PATTERN = /<!-- (?:emet|forge)-map commit=([0-9a-f]{7,40}) -->/;
const HOTSPOT_LIMIT = 10;
const CHURN_COMMIT_WINDOW = 200;
const IGNORED_CHURN =
  /(^|\/)(bun\.lock|bun\.lockb|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$/;
const TEST_FILE =
  /(\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|(^|\/)test_[^/]+\.py$|_test\.py$|_spec\.rb$)/;
const TEST_DIR = /(^|\/)(tests?|__tests__|spec|e2e)\//;

type MapInputs = {
  readonly commit: string;
  readonly files: readonly string[];
  readonly manifests: ReadonlyMap<string, string>;
  readonly churn: ReadonlyMap<string, number>;
  readonly commitSubjects: readonly string[];
};

type PackageJson = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function parsePackageJson(raw: string | undefined): PackageJson | null {
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function detectPackageManager(
  files: ReadonlySet<string>,
  pkg: PackageJson | null,
): PackageManager | null {
  const detected = classifyPackageManager((name) => files.has(name), pkg?.packageManager ?? null);
  return detected === "unknown" ? null : detected;
}

const NON_JS_TEST_COMMANDS: ReadonlyArray<readonly [PackageManager, string]> = [
  ["go", "go test ./..."],
  ["cargo", "cargo test"],
  ["uv", "uv run pytest"],
  ["poetry", "poetry run pytest"],
  ["pip", "pytest"],
];

function stackSection(inputs: MapInputs): string[] {
  const fileSet = new Set(inputs.files);
  const lines: string[] = [];
  const pkg = parsePackageJson(inputs.manifests.get("package.json"));
  if (pkg) {
    const dependencyNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).toSorted();
    const manager = detectPackageManager(fileSet, pkg);
    lines.push(
      `- Node/TypeScript package${pkg.name ? ` \`${pkg.name}\`` : ""}${manager ? `, package manager: ${manager}` : ""}`,
    );
    if (fileSet.has("tsconfig.json")) lines.push("- TypeScript (tsconfig.json present)");
    if (dependencyNames.length > 0)
      lines.push(
        `- Dependencies: ${dependencyNames.slice(0, 15).join(", ")}${dependencyNames.length > 15 ? ", ..." : ""}`,
      );
    const scriptNames = Object.keys(pkg.scripts ?? {}).toSorted();
    if (scriptNames.length > 0)
      lines.push(`- Scripts: ${scriptNames.map((name) => `\`${name}\``).join(", ")}`);
  }
  if (!pkg) {
    const manager = detectPackageManager(fileSet, null);
    if (manager && manager !== "npm") lines.push(`- Package manager: ${manager}`);
  }
  const otherManifests: ReadonlyArray<readonly [string, string]> = [
    ["go.mod", "Go module"],
    ["Cargo.toml", "Rust crate"],
    ["pyproject.toml", "Python project"],
    ["requirements.txt", "Python (requirements.txt)"],
    ["setup.py", "Python (setup.py)"],
    ["Gemfile", "Ruby (Bundler)"],
    ["pom.xml", "Java (Maven)"],
    ["build.gradle", "Java/Kotlin (Gradle)"],
  ];
  for (const [file, label] of otherManifests) {
    if (fileSet.has(file)) lines.push(`- ${label} (\`${file}\`)`);
  }
  return lines.length > 0 ? lines : ["- No recognized package manifest"];
}

function topLevelOf(file: string): string {
  const slash = file.indexOf("/");
  return slash === -1 ? file : `${file.slice(0, slash)}/`;
}

function structureSection(inputs: MapInputs): string[] {
  const counts = new Map<string, number>();
  for (const file of inputs.files) {
    const entry = topLevelOf(file);
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([entry, count]) =>
      entry.endsWith("/") ? `- \`${entry}\` (${count} files)` : `- \`${entry}\``,
    );
}

function conventionsSection(inputs: MapInputs): string[] {
  const fileSet = new Set(inputs.files);
  const lines: string[] = [];
  const tools: ReadonlyArray<readonly [RegExp, string]> = [
    [/^(\.?biome\.jsonc?)$/, "Biome"],
    [/^\.eslintrc|^eslint\.config\./, "ESLint"],
    [/^\.prettierrc|^prettier\.config\./, "Prettier"],
    [/^\.editorconfig$/, "EditorConfig"],
    [/^rustfmt\.toml$/, "rustfmt"],
    [/^\.golangci\./, "golangci-lint"],
  ];
  for (const [pattern, label] of tools) {
    const match = inputs.files.find((file) => !file.includes("/") && pattern.test(file));
    if (match) lines.push(`- ${label} configured (\`${match}\`)`);
  }
  const tsconfig = inputs.manifests.get("tsconfig.json");
  if (tsconfig && /"strict"\s*:\s*true/.test(tsconfig))
    lines.push("- TypeScript `strict` mode enabled");
  for (const guide of ["CLAUDE.md", "AGENTS.md", "CONTRIBUTING.md"]) {
    if (fileSet.has(guide)) lines.push(`- Contributor guidance in \`${guide}\``);
  }
  if (inputs.commitSubjects.length > 0) {
    const conventional = inputs.commitSubjects.filter((subject) =>
      /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\([^)]*\))?!?:/.test(
        subject,
      ),
    ).length;
    if (conventional * 2 >= inputs.commitSubjects.length)
      lines.push("- Commit style: conventional commits");
  }
  return lines.length > 0 ? lines : ["- No formatter, linter or contributor guide detected"];
}

function testingSection(inputs: MapInputs): string[] {
  const testFiles = inputs.files.filter((file) => TEST_FILE.test(file) || TEST_DIR.test(file));
  const lines: string[] = [];
  const pkg = parsePackageJson(inputs.manifests.get("package.json"));
  const testScript = pkg?.scripts?.test;
  if (testScript) lines.push(`- Test command: \`${testScript}\``);
  const manager = detectPackageManager(new Set(inputs.files), pkg);
  const ecosystemCommand = NON_JS_TEST_COMMANDS.find(([name]) => name === manager);
  if (ecosystemCommand && !pkg) lines.push(`- Test command: \`${ecosystemCommand[1]}\``);
  const hasBunTypes = Object.keys({ ...pkg?.devDependencies, ...pkg?.dependencies }).includes(
    "@types/bun",
  );
  if (hasBunTypes) lines.push("- Runner: `bun test`");
  const countsByDirectory = new Map<string, number>();
  for (const file of testFiles) {
    const directory = path.posix.dirname(file);
    const key = directory === "." ? "." : `${directory}/`;
    countsByDirectory.set(key, (countsByDirectory.get(key) ?? 0) + 1);
  }
  for (const [directory, count] of [...countsByDirectory.entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`- \`${directory === "." ? "*" : directory}\` (${count} test files)`);
  }
  return lines.length > 0 ? lines : ["- No test files found"];
}

function hotspotsSection(inputs: MapInputs): string[] {
  const tracked = new Set(inputs.files);
  const ranked = [...inputs.churn.entries()]
    .filter(([file]) => tracked.has(file) && !IGNORED_CHURN.test(file))
    .toSorted(([fileA, countA], [fileB, countB]) => countB - countA || fileA.localeCompare(fileB))
    .slice(0, HOTSPOT_LIMIT);
  return ranked.length > 0
    ? ranked.map(([file, count]) => `- \`${file}\` (${count} commits)`)
    : ["- No history available"];
}

function renderMap(inputs: MapInputs): string {
  const sections: ReadonlyArray<readonly [string, string[]]> = [
    ["Stack", stackSection(inputs)],
    ["Structure", structureSection(inputs)],
    ["Conventions", conventionsSection(inputs)],
    ["Testing", testingSection(inputs)],
    ["Hotspots", hotspotsSection(inputs)],
  ];
  const body = sections.map(([title, lines]) => `## ${title}\n\n${lines.join("\n")}`).join("\n\n");
  return `# Codebase map\n\n<!-- emet-map commit=${inputs.commit} -->\n<!-- generated by \`emet map\`; do not edit by hand -->\n\n${body}\n`;
}

export function parseStamp(content: string): string | null {
  return STAMP_PATTERN.exec(content)?.[1] ?? null;
}

function bulletGlob(line: string): string | null {
  const match = /^- `([^`]+)`/.exec(line);
  if (!match) return null;
  const target = match[1];
  if (target === undefined) return null;
  if (target === "*") return "**";
  return target.endsWith("/") ? `${target}**` : target;
}

/**
 * Keeps the header, the stamp, and every section that is not path-addressed
 * (Stack, Conventions); in Structure/Testing/Hotspots keeps only bullets whose
 * path overlaps one of `globs`, and drops a section left with no bullets.
 */
export function filterMapForGlobs(content: string, globs: readonly string[]): string {
  const pathAddressed = new Set(["Structure", "Testing", "Hotspots"]);
  const blocks = content.split(/\n(?=## )/);
  const kept = blocks.flatMap((block) => {
    const title = /^## (.+)$/m.exec(block)?.[1];
    if (!block.startsWith("## ") || title === undefined || !pathAddressed.has(title))
      return [block];
    const [heading = "", ...rest] = block.split("\n");
    const bullets = rest.filter((line) => {
      const glob = bulletGlob(line);
      return glob !== null && globs.some((candidate) => globsOverlap(candidate, glob));
    });
    return bullets.length > 0 ? [`${heading}\n\n${bullets.join("\n")}\n`] : [];
  });
  return `${kept.join("\n").trimEnd()}\n`;
}

export function mappedAreas(content: string): string[] {
  const block = content.split(/\n(?=## )/).find((section) => section.startsWith("## Structure"));
  if (!block) return [];
  return block
    .split("\n")
    .map(bulletGlob)
    .filter((glob): glob is string => glob !== null)
    .map((glob) => (glob.endsWith("/**") ? glob.slice(0, -3) : glob));
}

async function git(root: string, ...args: string[]): Promise<{ ok: boolean; out: string }> {
  const result = await Bun.$`git -C ${root} ${args}`.nothrow().quiet();
  return { ok: result.exitCode === 0, out: result.stdout.toString() };
}

async function collectInputs(root: string): Promise<MapInputs> {
  const head = await git(root, "rev-parse", "HEAD");
  if (!head.ok) throw new Error("emet map: not a git repository with at least one commit");
  const listed = await git(root, "ls-files");
  const files = listed.out.split("\n").filter((file) => file.length > 0);
  const manifestNames = ["package.json", "tsconfig.json"];
  const manifests = new Map<string, string>();
  for (const name of manifestNames) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: later iterations depend on earlier ones or on output order
    if (files.includes(name)) manifests.set(name, await readFile(path.join(root, name), "utf8"));
  }
  const history = await git(
    root,
    "log",
    `-n${CHURN_COMMIT_WINDOW}`,
    "--name-only",
    "--pretty=format:",
  );
  const churn = new Map<string, number>();
  for (const file of history.out.split("\n")) {
    if (file.length > 0) churn.set(file, (churn.get(file) ?? 0) + 1);
  }
  const subjects = await git(root, "log", "-n20", "--pretty=format:%s");
  return {
    commit: head.out.trim(),
    files,
    manifests,
    churn,
    commitSubjects: subjects.out.split("\n").filter((subject) => subject.length > 0),
  };
}

export async function generateMap(root: string): Promise<string> {
  return renderMap(await collectInputs(root));
}

export type StaleVerdict = { readonly stale: boolean; readonly reason: string };

export async function checkStale(
  root: string,
  mapRelativePath: string,
  maxCommits: number,
): Promise<StaleVerdict> {
  const mapFile = path.join(root, mapRelativePath);
  if (!existsSync(mapFile)) return { stale: true, reason: `no map at ${mapRelativePath}` };
  const content = await readFile(mapFile, "utf8");
  const stamp = parseStamp(content);
  if (!stamp) return { stale: true, reason: "map has no commit stamp" };
  const known = await git(root, "cat-file", "-e", `${stamp}^{commit}`);
  if (!known.ok)
    return { stale: true, reason: `stamped commit ${stamp.slice(0, 7)} not in history` };
  const areas = mappedAreas(content);
  const pathspecs = areas.length > 0 ? areas : ["."];
  const counted = await git(
    root,
    "rev-list",
    "--count",
    `${stamp}..HEAD`,
    "--",
    ...pathspecs,
    `:(exclude)${mapRelativePath}`,
  );
  if (!counted.ok) return { stale: true, reason: "could not count commits since the stamp" };
  const count = Number.parseInt(counted.out.trim(), 10);
  return count > maxCommits
    ? {
        stale: true,
        reason: `${count} commits touching mapped areas since ${stamp.slice(0, 7)} (max ${maxCommits})`,
      }
    : {
        stale: false,
        reason: `${count} commits touching mapped areas since ${stamp.slice(0, 7)} (max ${maxCommits})`,
      };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

export async function run(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }
  const root = await resolveRepoRoot();
  if (!root) {
    console.error("emet map: not inside a git repository");
    process.exitCode = 2;
    return;
  }
  const { config } = await loadForgeConfigWithDefaults(root);
  const mapRelativePath = config.map.path;
  const mapFile = path.join(root, mapRelativePath);

  if (argv.includes("--stale")) {
    const rawMax = flagValue(argv, "--max");
    const maxCommits = rawMax === undefined ? defaultMaxCommits() : Number.parseInt(rawMax, 10);
    if (!Number.isInteger(maxCommits) || maxCommits < 0) {
      console.error("emet map: --max must be a non-negative integer");
      process.exitCode = 2;
      return;
    }
    const verdict = await checkStale(root, mapRelativePath, maxCommits);
    console.log(`${verdict.stale ? "stale" : "fresh"}: ${verdict.reason}`);
    process.exitCode = verdict.stale ? 1 : 0;
    return;
  }

  if (argv.includes("--for")) {
    const rawGlobs = flagValue(argv, "--for");
    const globs = (rawGlobs ?? "")
      .split(",")
      .map((glob) => glob.trim())
      .filter((glob) => glob.length > 0);
    if (globs.length === 0) {
      console.error(`emet map: --for needs at least one glob\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
    if (!existsSync(mapFile)) {
      console.error(`emet map: no map at ${mapRelativePath}; run \`emet map\` first`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(filterMapForGlobs(await readFile(mapFile, "utf8"), globs));
    return;
  }

  const content = await generateMap(root);
  await mkdir(path.dirname(mapFile), { recursive: true });
  await writeFile(mapFile, content);
  console.log(`wrote ${mapRelativePath} (commit ${parseStamp(content)?.slice(0, 7)})`);
}

if (import.meta.main) {
  await run(process.argv.slice(2));
}

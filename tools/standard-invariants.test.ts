import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isAllowed } from "./stale-names.test";

export const PROJECT_SKILLS = ["add-adr", "cut-release"] as const;

const REPO_ROOT = path.join(import.meta.dir, "..");
const STALE_SLUG = /claude-forge|andryore-starter/i;
const MANIFEST_PATHS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"] as const;

interface LockEntry {
  readonly computedHash?: unknown;
}

function readText(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function trackedFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: REPO_ROOT });
  return new TextDecoder()
    .decode(result.stdout)
    .split("\0")
    .filter((file) => file.length > 0);
}

/**
 * Compares lock entries with the hashes of the tracked Module skills, in both directions.
 */
export function checkSkillsLock(
  lockEntries: Readonly<Record<string, LockEntry>>,
  expectedHashes: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const [name, entry] of Object.entries(lockEntries)) {
    const skillHash = expectedHashes[name];
    if (skillHash === undefined) {
      problems.push(`skills-lock.json lists ${name} but no tracked Module skill backs it`);
    } else if (entry.computedHash !== skillHash) {
      problems.push(`skills-lock.json hash for ${name} differs from its SKILL.md`);
    }
  }
  for (const name of Object.keys(expectedHashes)) {
    if (!(name in lockEntries)) {
      problems.push(`Module skill ${name} has no entry in skills-lock.json`);
    }
  }
  return problems;
}

/**
 * Returns the project skill names that are not add-adr or cut-release.
 */
export function findForeignSkills(names: readonly string[]): string[] {
  return names.filter((name) => !(PROJECT_SKILLS as readonly string[]).includes(name));
}

/**
 * Lowercases a line and drops punctuation so a slogan compares across README and manifests.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9 ]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

/**
 * Lists the places where the README slogan, the manifest descriptions and the brand copy disagree.
 */
export function findSloganDrift(input: {
  readme: string;
  copy: string;
  descriptions: Readonly<Record<string, string>>;
}): string[] {
  const readmeSlogan = /^\*\*(.+)\*\*$/m.exec(input.readme)?.[1];
  const copySlogan = /^> (.+)$/m.exec(input.copy)?.[1];
  if (readmeSlogan === undefined) return ["README.md has no bold slogan line"];
  if (copySlogan === undefined) return ["docs/brand/copy.md has no slogan quote"];
  const problems: string[] = [];
  const slogan = normalize(readmeSlogan);
  if (normalize(copySlogan) !== slogan) {
    problems.push("README slogan differs from docs/brand/copy.md");
  }
  for (const [file, description] of Object.entries(input.descriptions)) {
    if (!normalize(description).startsWith(slogan)) {
      problems.push(`${file} description does not start with the README slogan`);
    }
  }
  return problems;
}

function readLockEntries(): Record<string, LockEntry> {
  const lock: unknown = JSON.parse(readText("skills-lock.json"));
  const skills: unknown = Reflect.get(Object(lock), "skills");
  if (typeof skills !== "object" || skills === null) {
    throw new Error("skills-lock.json has no skills object");
  }
  return Object.fromEntries(
    Object.entries(skills).map(([name, entry]): [string, LockEntry] => [
      name,
      { computedHash: Reflect.get(Object(entry), "computedHash") as unknown },
    ]),
  );
}

function trackedSkillNames(): string[] {
  const prefix = ".claude/skills/";
  return [
    ...new Set(
      trackedFiles()
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length).split("/")[0] ?? ""),
    ),
  ];
}

function skillHashes(): Record<string, string> {
  return Object.fromEntries(
    PROJECT_SKILLS.map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(path.join(REPO_ROOT, ".claude", "skills", name, "SKILL.md")))
        .digest("hex"),
    ]),
  );
}

function manifestDescriptions(): Record<string, string> {
  return Object.fromEntries(
    MANIFEST_PATHS.map((file) => {
      const description: unknown = Reflect.get(Object(JSON.parse(readText(file))), "description");
      return [file, typeof description === "string" ? description : ""];
    }),
  );
}

function listDocs(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listDocs(full);
    return entry.name.endsWith(".md") ? [path.relative(path.join(REPO_ROOT, "docs"), full)] : [];
  });
}

describe("standard invariants", () => {
  test("no legacy slug appears outside the allow-list", () => {
    const offenders = trackedFiles()
      .filter(
        (file) =>
          file !== "tools/standard-invariants.test.ts" &&
          file !== "tools/stale-names.test.ts" &&
          !isAllowed(file),
      )
      .filter((file) => {
        try {
          return STALE_SLUG.test(readText(file));
        } catch {
          return false;
        }
      });
    expect(offenders).toEqual([]);
  });

  test("README slogan, manifest descriptions and brand copy agree", () => {
    expect(
      findSloganDrift({
        readme: readText("README.md"),
        copy: readText("docs/brand/copy.md"),
        descriptions: manifestDescriptions(),
      }),
    ).toEqual([]);
  });

  test("a drifted slogan is reported", () => {
    expect(
      findSloganDrift({
        readme: "**Spec to merge, on one approval.**",
        copy: "> Something else.",
        descriptions: { "a.json": "Spec to merge on one approval: x" },
      }),
    ).toEqual(["README slogan differs from docs/brand/copy.md"]);
  });

  test("every doc is indexed in docs/README.md", () => {
    const index = readText("docs/README.md");
    const missing = listDocs(path.join(REPO_ROOT, "docs"))
      .map((file) => file.replaceAll("\\", "/"))
      .filter((file) => file !== "README.md")
      .filter((file) => file === "adr/README.md" || !file.startsWith("adr/"))
      .filter((file) => !index.includes(`](${file})`));
    expect(missing).toEqual([]);
  });

  test("the tracked project skills are exactly add-adr and cut-release", () => {
    expect(trackedSkillNames().toSorted()).toEqual([...PROJECT_SKILLS]);
  });

  test("a foreign skill is reported", () => {
    expect(findForeignSkills(["add-adr", "git-commit"])).toEqual(["git-commit"]);
  });

  test("skills-lock.json agrees with the tracked Module skills in both directions", () => {
    expect(checkSkillsLock(readLockEntries(), skillHashes())).toEqual([]);
  });

  test("a lock entry without a skill fails", () => {
    expect(
      checkSkillsLock({ a: { computedHash: "x" }, b: { computedHash: "y" } }, { a: "x" }),
    ).toEqual(["skills-lock.json lists b but no tracked Module skill backs it"]);
  });

  test("a stale hash fails", () => {
    expect(checkSkillsLock({ a: { computedHash: "x" } }, { a: "z" })).toEqual([
      "skills-lock.json hash for a differs from its SKILL.md",
    ]);
  });

  test("a Module skill without a lock entry fails", () => {
    expect(checkSkillsLock({}, { a: "x" })).toEqual([
      "Module skill a has no entry in skills-lock.json",
    ]);
  });
});

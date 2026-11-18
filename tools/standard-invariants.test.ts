import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isAllowed } from "./stale-names.test";

export const MODULE_SKILLS = ["add-adr", "cut-release"] as const;

const REPO_ROOT = path.join(import.meta.dir, "..");
const STALE_SLUG = /claude-forge|andryore-starter/i;
const MANIFEST_PATHS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"] as const;

type SkillKind = "local" | "github";

interface LockEntry {
  readonly computedHash?: unknown;
  readonly sourceType?: unknown;
}

const SLUG_SCAN_SKIPPED_PREFIXES: readonly { readonly prefix: string; readonly reason: string }[] =
  [];

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
 * Compares lock entries with the hashes of the tracked skills, in both directions.
 * A `local` entry is hashed from its SKILL.md, a `github` entry from its whole folder.
 */
export function checkSkillsLock(
  lockEntries: Readonly<Record<string, LockEntry>>,
  hashes: Readonly<Record<string, string>>,
  kinds: Readonly<Record<string, SkillKind>>,
): string[] {
  const problems: string[] = [];
  for (const [name, entry] of Object.entries(lockEntries)) {
    const skillHash = hashes[name];
    const kind = kinds[name];
    if (skillHash === undefined || kind === undefined) {
      problems.push(`skills-lock.json lists ${name} but no tracked skill backs it`);
    } else if (entry.sourceType !== kind) {
      problems.push(`skills-lock.json sourceType for ${name} is not ${kind}`);
    } else if (entry.computedHash !== skillHash) {
      const source = kind === "local" ? "SKILL.md" : "folder";
      problems.push(`skills-lock.json hash for ${name} differs from its ${source}`);
    }
  }
  for (const name of Object.keys(hashes)) {
    if (!(name in lockEntries)) {
      problems.push(`tracked skill ${name} has no entry in skills-lock.json`);
    }
  }
  return problems;
}

function skillFolderFiles(directory: string, base: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory()
      ? skillFolderFiles(full, base)
      : [path.relative(base, full).split(path.sep).join("/")];
  });
}

/**
 * Hashes a skill folder with the lock's method: sha256 over files sorted by path
 * (locale order), each path then its content.
 */
export function hashSkillFolder(directory: string): string {
  const hash = createHash("sha256");
  const files = skillFolderFiles(directory, directory).toSorted((a, b) => a.localeCompare(b));
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(path.join(directory, file)));
  }
  return hash.digest("hex");
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
      {
        computedHash: Reflect.get(Object(entry), "computedHash") as unknown,
        sourceType: Reflect.get(Object(entry), "sourceType") as unknown,
      },
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

/**
 * A Module skill is `local` and hashed from its SKILL.md; every other tracked skill is third-party and hashed as a folder.
 */
export function skillKindOf(name: string): SkillKind {
  return (MODULE_SKILLS as readonly string[]).includes(name) ? "local" : "github";
}

function skillKinds(): Record<string, SkillKind> {
  return Object.fromEntries(
    trackedSkillNames().map((name): [string, SkillKind] => [name, skillKindOf(name)]),
  );
}

function skillHashes(kinds: Readonly<Record<string, SkillKind>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(kinds).map(([name, kind]) => {
      const directory = path.join(REPO_ROOT, ".claude", "skills", name);
      const hash =
        kind === "local"
          ? createHash("sha256")
              .update(readFileSync(path.join(directory, "SKILL.md")))
              .digest("hex")
          : hashSkillFolder(directory);
      return [name, hash];
    }),
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
          !isAllowed(file) &&
          !SLUG_SCAN_SKIPPED_PREFIXES.some(({ prefix }) => file.startsWith(prefix)),
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

  test("tracked skill directories equal the lock keys in both directions", () => {
    expect(trackedSkillNames().toSorted()).toEqual(Object.keys(readLockEntries()).toSorted());
  });

  test("skills-lock.json hashes match the tracked skills", () => {
    const lock = readLockEntries();
    const kinds = skillKinds();
    expect(checkSkillsLock(lock, skillHashes(kinds), kinds)).toEqual([]);
  });

  test("a lock entry without a skill fails", () => {
    const lock = {
      a: { computedHash: "x", sourceType: "local" },
      b: { computedHash: "y", sourceType: "github" },
    };
    expect(checkSkillsLock(lock, { a: "x" }, { a: "local" })).toEqual([
      "skills-lock.json lists b but no tracked skill backs it",
    ]);
  });

  test("a tracked skill without a lock entry fails", () => {
    expect(checkSkillsLock({}, { a: "x" }, { a: "github" })).toEqual([
      "tracked skill a has no entry in skills-lock.json",
    ]);
  });

  test("a stale Module hash fails", () => {
    const lock = { a: { computedHash: "x", sourceType: "local" } };
    expect(checkSkillsLock(lock, { a: "z" }, { a: "local" })).toEqual([
      "skills-lock.json hash for a differs from its SKILL.md",
    ]);
  });

  test("a stale third-party hash fails", () => {
    const lock = { a: { computedHash: "x", sourceType: "github" } };
    expect(checkSkillsLock(lock, { a: "z" }, { a: "github" })).toEqual([
      "skills-lock.json hash for a differs from its folder",
    ]);
  });

  test("only Module skills are local; a third-party name is hashed as a folder whatever its lock says", () => {
    expect(skillKindOf("add-adr")).toBe("local");
    expect(skillKindOf("animate")).toBe("github");
    const lock = { animate: { computedHash: "x", sourceType: "local" } };
    expect(checkSkillsLock(lock, { animate: "x" }, { animate: skillKindOf("animate") })).toEqual([
      "skills-lock.json sourceType for animate is not github",
    ]);
  });

  test("a sourceType that disagrees with the tracked kind fails", () => {
    const lock = { a: { computedHash: "x", sourceType: "github" } };
    expect(checkSkillsLock(lock, { a: "x" }, { a: "local" })).toEqual([
      "skills-lock.json sourceType for a is not local",
    ]);
  });

  test("the folder hash is sha256 over locale-sorted paths, each path then its content", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "skill-hash-"));
    try {
      mkdirSync(path.join(directory, "references"));
      writeFileSync(path.join(directory, "SKILL.md"), "body");
      writeFileSync(path.join(directory, "references", "a.md"), "ref");
      const expected = createHash("sha256")
        .update("references/a.md")
        .update("ref")
        .update("SKILL.md")
        .update("body")
        .digest("hex");
      expect(hashSkillFolder(directory)).toBe(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

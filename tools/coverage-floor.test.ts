import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const WORKSPACE_PARENTS = ["apps", "packages"];
const TEST_FILE = /\.test\.tsx?$/;
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", ".astro", ".turbo"]);

interface Threshold {
  readonly lines: number;
  readonly functions: number;
}

function hasTests(directory: string): boolean {
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    if (entry.isDirectory()) {
      return !IGNORED_DIRECTORIES.has(entry.name) && hasTests(path.join(directory, entry.name));
    }
    return TEST_FILE.test(entry.name);
  });
}

function workspaceDirectories(): string[] {
  const nested = WORKSPACE_PARENTS.flatMap((parent) => {
    const parentDirectory = path.join(repositoryRoot, parent);
    if (!existsSync(parentDirectory)) return [];
    return readdirSync(parentDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parentDirectory, entry.name));
  });
  return [path.join(repositoryRoot, "emet"), ...nested];
}

function thresholdFor(directory: string): Threshold | undefined {
  const bunfig = path.join(directory, "bunfig.toml");
  if (!existsSync(bunfig)) return undefined;
  const parsed = Bun.TOML.parse(readFileSync(bunfig, "utf8")) as {
    test?: { coverage?: boolean; coverageThreshold?: { lines?: number; functions?: number } };
  };
  const threshold = parsed.test?.coverageThreshold;
  if (!parsed.test?.coverage || !threshold) return undefined;
  if (typeof threshold.lines !== "number" || typeof threshold.functions !== "number") {
    return undefined;
  }
  return { lines: threshold.lines, functions: threshold.functions };
}

describe("workspace coverage floors", () => {
  const tested = workspaceDirectories().filter(
    (directory) => existsSync(directory) && hasTests(directory),
  );

  test("emet and the site are recognised as tested workspaces", () => {
    const names = tested.map((directory) => path.relative(repositoryRoot, directory));
    expect(names).toContain("emet");
    expect(names).toContain(path.join("apps", "site"));
  });

  for (const directory of tested) {
    test(`${path.relative(repositoryRoot, directory)} enforces a line and function floor`, () => {
      const threshold = thresholdFor(directory);
      expect(threshold).toBeDefined();
      expect(threshold?.lines).toBeGreaterThanOrEqual(0);
      expect(threshold?.functions).toBeGreaterThanOrEqual(0);
    });
  }
});

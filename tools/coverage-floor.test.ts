import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFloors } from "./coverage-gate";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const WORKSPACE_PARENTS = ["apps", "packages"];
const TEST_FILE = /\.test\.tsx?$/;
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", ".astro", ".turbo", "coverage"]);

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

const floors = parseFloors(
  readFileSync(path.join(repositoryRoot, "tools/coverage-floors.json"), "utf8"),
);

describe("workspace coverage floors", () => {
  const tested = workspaceDirectories()
    .filter((directory) => existsSync(directory) && hasTests(directory))
    .map((directory) => path.relative(repositoryRoot, directory));

  test("emet and the site are recognised as tested workspaces", () => {
    expect(tested).toContain("emet");
    expect(tested).toContain(path.join("apps", "site"));
  });

  for (const workspace of tested) {
    test(`${workspace} has a positive line and function floor`, () => {
      const floor = floors[workspace];
      expect(floor).toBeDefined();
      expect(floor?.lines ?? 0).toBeGreaterThan(0);
      expect(floor?.functions ?? 0).toBeGreaterThan(0);
    });
  }
});

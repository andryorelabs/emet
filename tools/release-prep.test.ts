import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareRelease } from "./release-prep.ts";

const REPO_URL = "https://github.com/andryorelabs/emet";

const CHANGELOG = `# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- A new thing.

## [0.8.4] - 2026-11-15

### Changed

- An older change.

[Unreleased]: ${REPO_URL}/compare/v0.8.4...HEAD
[0.8.4]: ${REPO_URL}/compare/v0.8.3...v0.8.4
`;

const MANIFEST = `{
  "name": "emet",
  "version": "0.8.4",
  "author": { "name": "Someone" },
  "repository": "${REPO_URL}"
}
`;

/** Runs `prepareRelease` for 0.9.0 on the fixtures, overriding any input. */
function prepare(
  overrides: Partial<Parameters<typeof prepareRelease>[0]> = {},
): ReturnType<typeof prepareRelease> {
  return prepareRelease({
    changelog: CHANGELOG,
    manifest: MANIFEST,
    version: "0.9.0",
    date: "2026-11-16",
    repoUrl: REPO_URL,
    ...overrides,
  });
}

describe("prepareRelease", () => {
  test("bumps the manifest version and keeps the rest of the file byte for byte", () => {
    const { manifest } = prepare();
    expect(manifest).toBe(MANIFEST.replace('"version": "0.8.4"', '"version": "0.9.0"'));
  });

  test("moves the Unreleased entries under a dated heading and leaves Unreleased empty", () => {
    const { changelog } = prepare();
    expect(changelog).toContain(
      "## [Unreleased]\n\n## [0.9.0] - 2026-11-16\n\n### Added\n\n- A new thing.\n\n## [0.8.4]",
    );
  });

  test("adds a compare ref for the new version and points Unreleased at it", () => {
    const { changelog } = prepare();
    expect(changelog).toContain(
      `[Unreleased]: ${REPO_URL}/compare/v0.9.0...HEAD\n[0.9.0]: ${REPO_URL}/compare/v0.8.4...v0.9.0\n[0.8.4]:`,
    );
  });

  test("accepts a prerelease version", () => {
    const { changelog, manifest } = prepare({ version: "1.0.0-rc.1" });
    expect(manifest).toContain('"version": "1.0.0-rc.1"');
    expect(changelog).toContain("## [1.0.0-rc.1] - 2026-11-16");
    expect(changelog).toContain(`[1.0.0-rc.1]: ${REPO_URL}/compare/v0.8.4...v1.0.0-rc.1`);
  });

  test("links the first release to its tag when there is no previous version", () => {
    const changelog = "# Changelog\n\n## [Unreleased]\n\n- First.\n";
    const result = prepare({ changelog, version: "0.1.0" });
    expect(result.changelog).toBe(
      `# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-16\n\n- First.\n\n[Unreleased]: ${REPO_URL}/compare/v0.1.0...HEAD\n[0.1.0]: ${REPO_URL}/releases/tag/v0.1.0\n`,
    );
  });

  test("tolerates a trailing slash on the repository URL", () => {
    const { changelog } = prepare({ repoUrl: `${REPO_URL}/` });
    expect(changelog).toContain(`[0.9.0]: ${REPO_URL}/compare/v0.8.4...v0.9.0`);
  });

  test.each([
    ["a version that is not semver", { version: "v0.9.0" }, /not a semantic version/],
    ["a date that is not YYYY-MM-DD", { date: "16/11/2026" }, /not a YYYY-MM-DD date/],
    ["a version already in the CHANGELOG", { version: "0.8.4" }, /already has a section/],
    [
      "a CHANGELOG without Unreleased",
      { changelog: "# Changelog\n\n## [0.8.4] - 2026-11-15\n" },
      /no "## \[Unreleased\]" section/,
    ],
    [
      "an empty Unreleased section",
      { changelog: "# Changelog\n\n## [Unreleased]\n\n## [0.8.4] - 2026-11-15\n\n- Old.\n" },
      /\[Unreleased\] has no entries/,
    ],
    ["a manifest without a version", { manifest: '{ "name": "emet" }\n' }, /no "version" field/],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() => prepare(overrides)).toThrow(message);
  });
});

describe("release:prep CLI", () => {
  test("rewrites plugin.json and CHANGELOG.md in the working directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-prep-"));
    try {
      mkdirSync(join(directory, ".claude-plugin"));
      writeFileSync(join(directory, ".claude-plugin", "plugin.json"), MANIFEST);
      writeFileSync(join(directory, "CHANGELOG.md"), CHANGELOG);
      const result = Bun.spawnSync(["bun", join(import.meta.dir, "release-prep.ts"), "0.9.0"], {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.stderr.toString()).toBe("");
      expect(result.exitCode).toBe(0);
      const manifest: unknown = JSON.parse(
        readFileSync(join(directory, ".claude-plugin", "plugin.json"), "utf8"),
      );
      expect(manifest).toMatchObject({ version: "0.9.0" });
      expect(readFileSync(join(directory, "CHANGELOG.md"), "utf8")).toMatch(
        /^## \[0\.9\.0\] - \d{4}-\d{2}-\d{2}$/m,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("exits 1 with usage and writes nothing when the version is missing", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-prep-"));
    try {
      mkdirSync(join(directory, ".claude-plugin"));
      writeFileSync(join(directory, ".claude-plugin", "plugin.json"), MANIFEST);
      writeFileSync(join(directory, "CHANGELOG.md"), CHANGELOG);
      const result = Bun.spawnSync(["bun", join(import.meta.dir, "release-prep.ts")], {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("usage: bun run release:prep <version>");
      expect(readFileSync(join(directory, "CHANGELOG.md"), "utf8")).toBe(CHANGELOG);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

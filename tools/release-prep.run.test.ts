import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareRelease, runReleasePrep } from "./release-prep.ts";

const REPO_URL = "https://github.com/andryorelabs/emet";

const CHANGELOG = `# Changelog

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
  "repository": "${REPO_URL}"
}
`;

interface Captured {
  readonly stdout: { write(text: string): void };
  readonly stderr: { write(text: string): void };
  out: string;
  err: string;
}

/** Streams that collect what `runReleasePrep` writes. */
function capture(): Captured {
  const captured: Captured = {
    out: "",
    err: "",
    stdout: {
      write(text) {
        captured.out += text;
      },
    },
    stderr: {
      write(text) {
        captured.err += text;
      },
    },
  };
  return captured;
}

/** Runs `check` against a scratch repository root holding the given manifest and CHANGELOG. */
function withRepository(manifest: string, check: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "release-prep-run-"));
  try {
    mkdirSync(join(directory, ".claude-plugin"));
    writeFileSync(join(directory, ".claude-plugin", "plugin.json"), manifest);
    writeFileSync(join(directory, "CHANGELOG.md"), CHANGELOG);
    check(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("prepareRelease link refs", () => {
  test("rejects an Unreleased ref that is not a compare link", () => {
    expect(() =>
      prepareRelease({
        changelog: CHANGELOG.replace("compare/v0.8.4...HEAD", "tree/main"),
        manifest: MANIFEST,
        version: "0.9.0",
        date: "2026-11-16",
        repoUrl: REPO_URL,
      }),
    ).toThrow(/not a compare\/v<version>\.\.\.HEAD link/);
  });
});

describe("runReleasePrep", () => {
  test("rewrites both files and reports the next step", () => {
    withRepository(MANIFEST, (directory) => {
      const streams = capture();
      expect(runReleasePrep(["0.9.0"], directory, streams)).toBe(0);
      expect(streams.out).toBe(
        "Prepared 0.9.0: .claude-plugin/plugin.json and CHANGELOG.md. Next run bun run build:codex.\n",
      );
      expect(streams.err).toBe("");
      expect(readFileSync(join(directory, ".claude-plugin", "plugin.json"), "utf8")).toContain(
        '"version": "0.9.0"',
      );
      expect(readFileSync(join(directory, "CHANGELOG.md"), "utf8")).toContain(
        `[0.9.0]: ${REPO_URL}/compare/v0.8.4...v0.9.0`,
      );
    });
  });

  test("reads the repository URL from a repository object", () => {
    const manifest = MANIFEST.replace(`"${REPO_URL}"`, `{ "url": "${REPO_URL}/" }`);
    withRepository(manifest, (directory) => {
      expect(runReleasePrep(["0.9.0"], directory, capture())).toBe(0);
      expect(readFileSync(join(directory, "CHANGELOG.md"), "utf8")).toContain(
        `[0.9.0]: ${REPO_URL}/compare/v0.8.4...v0.9.0`,
      );
    });
  });

  test.each([
    ["no repository", '{ "version": "0.8.4" }'],
    ["a repository object without a url", '{ "version": "0.8.4", "repository": {} }'],
    ["a repository url that is not a string", '{ "version": "0.8.4", "repository": { "url": 3 } }'],
    ["a manifest that is not an object", "[]"],
  ])("exits 1 and writes nothing for %s", (_label, manifest) => {
    withRepository(manifest, (directory) => {
      const streams = capture();
      expect(runReleasePrep(["0.9.0"], directory, streams)).toBe(1);
      expect(streams.err).toContain('release:prep: the plugin manifest has no "repository" URL');
      expect(streams.out).toBe("");
      expect(readFileSync(join(directory, "CHANGELOG.md"), "utf8")).toBe(CHANGELOG);
    });
  });

  test("exits 1 with the reason when the version is invalid", () => {
    withRepository(MANIFEST, (directory) => {
      const streams = capture();
      expect(runReleasePrep(["nope"], directory, streams)).toBe(1);
      expect(streams.err).toBe('release:prep: "nope" is not a semantic version like 1.2.3\n');
    });
  });

  test("exits 1 with usage for no version or extra arguments", () => {
    for (const argv of [[], ["0.9.0", "extra"]]) {
      const streams = capture();
      expect(runReleasePrep(argv, "/nonexistent", streams)).toBe(1);
      expect(streams.err).toBe("usage: bun run release:prep <version>\n");
    }
  });

  test("rethrows an error that is not a release-prep problem", () => {
    const directory = mkdtempSync(join(tmpdir(), "release-prep-empty-"));
    try {
      expect(() => runReleasePrep(["0.9.0"], directory, capture())).toThrow(/ENOENT/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

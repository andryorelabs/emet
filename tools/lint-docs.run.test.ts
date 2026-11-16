import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildLycheeDownloadUrl,
  downloadLycheeBinary,
  ensureLycheeBinary,
  findBinaryRecursively,
  LYCHEE_ARGS,
  LYCHEE_VERSION,
  resolveGitCommonDirectory,
  runLintDocs,
} from "./lint-docs.ts";

let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "lint-docs-run-"));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** Makes a fresh empty directory below the scratch root. */
function freshDirectory(name: string): string {
  const directory = mkdtempSync(path.join(scratch, `${name}-`));
  return directory;
}

/** Builds a gzipped tarball whose entries are the given relative file paths. */
function buildArchive(files: Record<string, string>): Uint8Array {
  const source = freshDirectory("archive-source");
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(source, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  const archivePath = path.join(freshDirectory("archive-output"), "lychee.tar.gz");
  const result = Bun.spawnSync(["tar", "-czf", archivePath, "-C", source, "."]);
  expect(result.exitCode).toBe(0);
  return new Uint8Array(readFileSync(archivePath));
}

/** Awaits a promise that must reject and returns the rejection's message. */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the promise to reject");
}

/** Writes an executable that records its arguments and exits with `exitCode`. */
function fakeBinary(exitCode: number): { binary: string; argumentsFile: string } {
  const directory = freshDirectory("fake-lychee");
  const binary = path.join(directory, "lychee");
  const argumentsFile = path.join(directory, "arguments.txt");
  writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argumentsFile}'\nexit ${exitCode}\n`);
  chmodSync(binary, 0o755);
  return { binary, argumentsFile };
}

const ACCEPT = (): boolean => true;
const REJECT = (): boolean => false;

describe("findBinaryRecursively", () => {
  test("finds the binary at the root and in nested directories", () => {
    const root = freshDirectory("find");
    mkdirSync(path.join(root, "a", "b"), { recursive: true });
    writeFileSync(path.join(root, "a", "b", "lychee"), "");
    expect(findBinaryRecursively(root, 2)).toBe(path.join(root, "a", "b", "lychee"));
    writeFileSync(path.join(root, "lychee"), "");
    expect(findBinaryRecursively(root, 0)).toBe(path.join(root, "lychee"));
  });

  test("does not descend past the depth limit", () => {
    const root = freshDirectory("find-deep");
    mkdirSync(path.join(root, "a", "b"), { recursive: true });
    writeFileSync(path.join(root, "a", "b", "lychee"), "");
    expect(findBinaryRecursively(root, 0)).toBeUndefined();
    expect(findBinaryRecursively(root, 1)).toBeUndefined();
    expect(findBinaryRecursively(root, 2)).toBe(path.join(root, "a", "b", "lychee"));
  });

  test("ignores other files and a directory named lychee", () => {
    const root = freshDirectory("find-none");
    writeFileSync(path.join(root, "README.md"), "");
    mkdirSync(path.join(root, "lychee"));
    expect(findBinaryRecursively(root, 2)).toBeUndefined();
  });
});

describe("resolveGitCommonDirectory", () => {
  test("returns the absolute common directory of this checkout", async () => {
    const expected = Bun.spawnSync(["git", "rev-parse", "--git-common-dir"], {
      cwd: import.meta.dir,
    })
      .stdout.toString()
      .trim();
    const resolved = await resolveGitCommonDirectory(import.meta.dir);
    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(path.resolve(import.meta.dir, expected));
  });

  test("defaults to the working directory", async () => {
    expect(path.isAbsolute(await resolveGitCommonDirectory())).toBe(true);
  });

  test("reports git's failure outside a repository", async () => {
    const outside = freshDirectory("not-a-repo");
    const originalCeiling = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = scratch;
    try {
      expect(await rejectionMessage(resolveGitCommonDirectory(outside))).toMatch(
        /lint-docs: git rev-parse --git-common-dir failed/,
      );
    } finally {
      if (originalCeiling === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
      else process.env.GIT_CEILING_DIRECTORIES = originalCeiling;
    }
  });
});

describe("downloadLycheeBinary", () => {
  test("extracts the nested binary, makes it executable and cleans up", async () => {
    const archive = buildArchive({ "lychee-x86_64/lychee": "#!/bin/sh\nexit 0\n" });
    const destination = path.join(freshDirectory("install"), "bin", "lychee");
    const requested: string[] = [];
    await downloadLycheeBinary("v9.9.9", destination, {
      fetchUrl: (url) => {
        requested.push(url);
        return Promise.resolve(new Response(archive));
      },
      arch: "x86_64",
      isChecksumValid: ACCEPT,
    });
    expect(requested).toEqual([buildLycheeDownloadUrl("v9.9.9", "x86_64")]);
    expect(readFileSync(destination, "utf8")).toBe("#!/bin/sh\nexit 0\n");
    expect(statSync(destination).mode & 0o777).toBe(0o755);
    expect(Bun.spawnSync([destination]).exitCode).toBe(0);
  });

  test("fails on an HTTP error and installs nothing", async () => {
    const destination = path.join(freshDirectory("install-404"), "lychee");
    const message = await rejectionMessage(
      downloadLycheeBinary("v9.9.9", destination, {
        fetchUrl: () => Promise.resolve(new Response("nope", { status: 404 })),
        arch: "aarch64",
      }),
    );
    expect(message).toMatch(/failed to download lychee from .*aarch64.* \(HTTP 404\)/);
    expect(existsSync(destination)).toBe(false);
  });

  test("refuses an archive that does not match the pinned checksum", async () => {
    const destination = path.join(freshDirectory("install-sha"), "lychee");
    const message = await rejectionMessage(
      downloadLycheeBinary("v9.9.9", destination, {
        fetchUrl: () => Promise.resolve(new Response("tampered")),
        arch: "x86_64",
      }),
    );
    expect(message).toMatch(/SHA-256 mismatch/);
    expect(existsSync(destination)).toBe(false);
  });

  test("reports a tarball that tar cannot extract", async () => {
    const destination = path.join(freshDirectory("install-tar"), "lychee");
    const message = await rejectionMessage(
      downloadLycheeBinary("v9.9.9", destination, {
        fetchUrl: () => Promise.resolve(new Response("not a tarball")),
        arch: "x86_64",
        isChecksumValid: ACCEPT,
      }),
    );
    expect(message).toMatch(/failed to extract .* \(tar exit \d+\)/);
    expect(existsSync(destination)).toBe(false);
  });

  test("reports an archive without a lychee binary", async () => {
    const archive = buildArchive({ "lychee-x86_64/README.md": "docs" });
    const destination = path.join(freshDirectory("install-empty"), "lychee");
    const message = await rejectionMessage(
      downloadLycheeBinary("v9.9.9", destination, {
        fetchUrl: () => Promise.resolve(new Response(archive)),
        arch: "x86_64",
        isChecksumValid: ACCEPT,
      }),
    );
    expect(message).toMatch(/no "lychee" binary inside the archive/);
    expect(existsSync(destination)).toBe(false);
  });

  test("passes the downloaded bytes and architecture to the checksum check", async () => {
    const archive = buildArchive({ lychee: "#!/bin/sh\n" });
    const seen: { size: number; arch: string }[] = [];
    const message = await rejectionMessage(
      downloadLycheeBinary("v9.9.9", path.join(freshDirectory("install-check"), "lychee"), {
        fetchUrl: () => Promise.resolve(new Response(archive)),
        arch: "aarch64",
        isChecksumValid: (bytes, arch) => {
          seen.push({ size: bytes.length, arch });
          return REJECT();
        },
      }),
    );
    expect(message).toMatch(/SHA-256 mismatch/);
    expect(seen).toEqual([{ size: archive.length, arch: "aarch64" }]);
  });
});

describe("ensureLycheeBinary", () => {
  test("returns a cached binary without downloading", async () => {
    const common = freshDirectory("cache-hit");
    const cached = path.join(common, "lychee", "v1.0.0", "lychee");
    mkdirSync(path.dirname(cached), { recursive: true });
    writeFileSync(cached, "");
    let downloads = 0;
    const result = await ensureLycheeBinary("v1.0.0", {
      resolveCommonDirectory: () => Promise.resolve(common),
      download: () => {
        downloads += 1;
        return Promise.resolve();
      },
    });
    expect(result).toBe(cached);
    expect(downloads).toBe(0);
  });

  test("downloads into the cache path when the binary is missing", async () => {
    const common = freshDirectory("cache-miss");
    const log = spyOn(console, "log").mockImplementation(() => undefined);
    const calls: { version: string; destination: string }[] = [];
    try {
      const result = await ensureLycheeBinary("v1.0.0", {
        resolveCommonDirectory: () => Promise.resolve(common),
        download: (version, destination) => {
          calls.push({ version, destination });
          return Promise.resolve();
        },
      });
      const expected = path.join(common, "lychee", "v1.0.0", "lychee");
      expect(result).toBe(expected);
      expect(calls).toEqual([{ version: "v1.0.0", destination: expected }]);
      expect(log).toHaveBeenCalledWith("lint-docs: lychee v1.0.0 not cached, downloading...");
    } finally {
      log.mockRestore();
    }
  });
});

describe("runLintDocs", () => {
  test("runs lychee with the pinned arguments plus the extra ones and returns its code", async () => {
    const { binary, argumentsFile } = fakeBinary(7);
    const versions: string[] = [];
    const code = await runLintDocs(["--verbose"], (version) => {
      versions.push(version);
      return Promise.resolve(binary);
    });
    expect(code).toBe(7);
    expect(versions).toEqual([LYCHEE_VERSION]);
    expect(readFileSync(argumentsFile, "utf8").trimEnd().split("\n")).toEqual([
      ...LYCHEE_ARGS,
      "--verbose",
    ]);
  });

  test("returns 0 when lychee passes", async () => {
    const { binary } = fakeBinary(0);
    expect(await runLintDocs([], () => Promise.resolve(binary))).toBe(0);
  });

  test("prints the message and returns 1 when the binary cannot be obtained", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await runLintDocs([], () => Promise.reject(new Error("no network")))).toBe(1);
      expect(error).toHaveBeenCalledWith("no network");
    } finally {
      error.mockRestore();
    }
  });

  test("returns 1 when the binary cannot be started", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const missing = path.join(freshDirectory("missing"), "lychee");
      expect(await runLintDocs([], () => Promise.resolve(missing))).toBe(1);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});

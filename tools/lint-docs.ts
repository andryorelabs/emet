/**
 * Local equivalent of `.github/workflows/lint-docs.yml`: runs the same
 * offline lychee link check so `bun run lint:docs` catches broken markdown
 * links before CI does.
 *
 * `LYCHEE_VERSION` mirrors the default `lycheeVersion` of the pinned
 * `lycheeverse/lychee-action`. The binary is cached at
 * `<git-common-dir>/lychee/<version>/lychee`, so every `/forge` worktree
 * shares one download. `tools/lint-docs.test.ts` asserts that
 * {@link LYCHEE_ARGS} matches the workflow's `args` byte for byte.
 */
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const LYCHEE_VERSION = "v0.24.2";

/**
 * SHA-256 of each Linux release tarball of {@link LYCHEE_VERSION}, as published by
 * the GitHub release asset digests. Bumping the version requires new hashes.
 */
export const LYCHEE_SHA256: Readonly<Record<"aarch64" | "x86_64", string>> = {
  aarch64: "91a7bd65685da41b90ccb9bc867a3d649a7818042dae04ff405e55a25bddee4c",
  x86_64: "1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a",
};

/**
 * Checks a downloaded tarball against the pinned digest.
 * @param archive The tarball bytes.
 * @param arch The lychee release architecture.
 * @returns Whether the SHA-256 of the bytes matches the pin.
 */
export function matchesLycheeChecksum(archive: Uint8Array, arch: "aarch64" | "x86_64"): boolean {
  return new Bun.CryptoHasher("sha256").update(archive).digest("hex") === LYCHEE_SHA256[arch];
}

/**
 * The `lycheeverse/lychee-action` release whose default `lycheeVersion` is
 * {@link LYCHEE_VERSION}. The test asserts the workflow still pins it, so an
 * action bump forces a re-check of the lychee version.
 */
export const EXPECTED_LYCHEE_ACTION_VERSION = "v2.9.0";

/**
 * Byte-identical to the `args` of the lychee step in
 * `.github/workflows/lint-docs.yml`, as an argv array so the globs reach
 * lychee unexpanded.
 *
 * `--offline` checks only local files, never the network, so the run is
 * deterministic. `--include-fragments=anchor-only` also verifies `#heading`
 * anchors, but only for local markdown targets. `--no-progress` keeps logs
 * free of the progress bar.
 */
export const LYCHEE_ARGS = [
  "--offline",
  "--include-fragments=anchor-only",
  "--no-progress",
  "*.md",
  "docs/**/*.md",
  "forge/**/*.md",
  ".github/**/*.md",
  "commands/*.md",
  "agents/*.md",
] as const;

/**
 * Maps Node architecture and platform to lychee's release architecture.
 * @param arch The Node.js architecture to map.
 * @param platform The Node.js platform to validate.
 * @returns The lychee release architecture string.
 */
export function resolveLycheeArch(
  arch: NodeJS.Architecture = process.arch,
  platform: NodeJS.Platform = process.platform,
): "aarch64" | "x86_64" {
  if (platform !== "linux") {
    throw new Error(
      `lint-docs: unsupported platform "${platform}"; lychee's prebuilt release binaries are Linux-only. Install lychee manually (https://github.com/lycheeverse/lychee#installation).`,
    );
  }
  if (arch === "arm64") return "aarch64";
  if (arch === "x64") return "x86_64";
  throw new Error(
    `lint-docs: unsupported architecture "${arch}"; lychee only publishes Linux binaries for x64 and arm64.`,
  );
}

/**
 * Builds the release asset URL for a lychee version and architecture.
 * @param version The lychee release version.
 * @param arch The lychee release architecture.
 * @returns The tarball download URL.
 */
export function buildLycheeDownloadUrl(version: string, arch: string): string {
  return `https://github.com/lycheeverse/lychee/releases/download/lychee-${version}/lychee-${arch}-unknown-linux-gnu.tar.gz`;
}

/**
 * Builds the cache path of a version's binary relative to the git common dir.
 * @param version The lychee release version.
 * @returns The relative cache path.
 */
export function buildLycheeCacheRelativePath(version: string): string {
  return path.join("lychee", version, "lychee");
}

/**
 * Resolves the absolute git common directory shared by all worktrees.
 * @returns The absolute git common directory path.
 */
async function resolveGitCommonDirectory(): Promise<string> {
  const child = Bun.spawn({
    cmd: ["git", "rev-parse", "--git-common-dir"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`lint-docs: git rev-parse --git-common-dir failed: ${stderr.trim()}`);
  }
  return path.resolve(process.cwd(), stdout.trim());
}

/**
 * Finds a file named `lychee` under a directory, up to a depth.
 * @param rootDirectory The directory to search from.
 * @param maxDepth How many nested levels to descend into.
 * @returns The binary path, or `undefined` when absent.
 */
function findBinaryRecursively(rootDirectory: string, maxDepth: number): string | undefined {
  for (const entry of readdirSync(rootDirectory, { withFileTypes: true })) {
    const entryPath = path.join(rootDirectory, entry.name);
    if (entry.isFile() && entry.name === "lychee") return entryPath;
    if (!entry.isDirectory() || maxDepth <= 0) continue;
    const found = findBinaryRecursively(entryPath, maxDepth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Downloads the pinned lychee release and atomically installs its binary.
 * @param version The lychee release version.
 * @param destinationPath Where the binary is installed.
 * @returns Resolves once the binary is in place.
 */
async function downloadLycheeBinary(version: string, destinationPath: string): Promise<void> {
  const arch = resolveLycheeArch();
  const url = buildLycheeDownloadUrl(version, arch);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`lint-docs: failed to download lychee from ${url} (HTTP ${response.status}).`);
  }

  const workingDirectory = mkdtempSync(path.join(tmpdir(), "lint-docs-lychee-"));
  try {
    const archivePath = path.join(workingDirectory, "lychee.tar.gz");
    const archive = new Uint8Array(await response.arrayBuffer());
    if (!matchesLycheeChecksum(archive, arch)) {
      throw new Error(`lint-docs: SHA-256 mismatch for ${url}; refusing to run the download.`);
    }
    await Bun.write(archivePath, archive);
    const extractedDirectory = path.join(workingDirectory, "extracted");
    mkdirSync(extractedDirectory);
    const tar = Bun.spawn({
      cmd: ["tar", "-xzf", archivePath, "-C", extractedDirectory],
      stdout: "ignore",
      stderr: "pipe",
    });
    const [tarExitCode, tarStderr] = await Promise.all([
      tar.exited,
      new Response(tar.stderr).text(),
    ]);
    if (tarExitCode !== 0) {
      throw new Error(
        `lint-docs: failed to extract ${url} (tar exit ${tarExitCode}): ${tarStderr}`,
      );
    }
    const extractedBinaryPath = findBinaryRecursively(extractedDirectory, 2);
    if (extractedBinaryPath === undefined) {
      throw new Error(`lint-docs: no "lychee" binary inside the archive from ${url}.`);
    }
    mkdirSync(path.dirname(destinationPath), { recursive: true });
    const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;
    copyFileSync(extractedBinaryPath, temporaryPath);
    chmodSync(temporaryPath, 0o755);
    renameSync(temporaryPath, destinationPath);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
}

/**
 * Returns a cached lychee binary path, downloading it on first use.
 * @param version The lychee release version.
 * @returns The absolute binary path.
 */
async function ensureLycheeBinary(version: string): Promise<string> {
  const commonDirectory = await resolveGitCommonDirectory();
  const binaryPath = path.join(commonDirectory, buildLycheeCacheRelativePath(version));
  if (existsSync(binaryPath)) return binaryPath;
  console.log(`lint-docs: lychee ${version} not cached, downloading...`);
  await downloadLycheeBinary(version, binaryPath);
  return binaryPath;
}

/**
 * Runs lychee over the documentation globs and propagates its exit code.
 * @returns Resolves once lychee exits.
 */
async function main(): Promise<void> {
  const binaryPath = await ensureLycheeBinary(LYCHEE_VERSION);
  const child = Bun.spawn({
    cmd: [binaryPath, ...LYCHEE_ARGS, ...process.argv.slice(2)],
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exitCode = await child.exited;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

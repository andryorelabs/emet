import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What `prepareRelease` reads: the two files, the new version, the release date and the repository URL. */
interface ReleasePrepInput {
  readonly changelog: string;
  readonly manifest: string;
  readonly version: string;
  readonly date: string;
  readonly repoUrl: string;
}

/** The rewritten CHANGELOG and plugin manifest. */
interface ReleasePrepOutput {
  readonly changelog: string;
  readonly manifest: string;
}

const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNRELEASED_HEADING = "## [Unreleased]";
const UNRELEASED_REF_PATTERN = /^\[Unreleased\]: (\S+)$/m;
const PREVIOUS_FROM_COMPARE_PATTERN = /\/compare\/v(\S+)\.\.\.HEAD$/;
const RELEASED_HEADING_PATTERN = /^## \[([^\]]+)\] - /m;
const SECTION_END_PATTERN = /^(?:## \[|\[[^\]]+\]: )/m;
const LINK_REF_LINE_PATTERN = /^\[[^\]]+\]: \S+$/;
const MANIFEST_VERSION_PATTERN = /("version"\s*:\s*")[^"]*(")/;
const USAGE = "usage: bun run release:prep <version>";

/** A release-prep input that cannot produce a valid release. */
export class ReleasePrepError extends Error {
  override readonly name = "ReleasePrepError";
}

/**
 * Bumps the manifest version and moves `[Unreleased]` into a dated section with compare links.
 * @param input - The CHANGELOG and manifest text, the new version, the release date and the repository URL.
 * @returns The rewritten CHANGELOG and manifest text.
 */
export function prepareRelease(input: ReleasePrepInput): ReleasePrepOutput {
  if (!SEMVER_PATTERN.test(input.version)) {
    throw new ReleasePrepError(`"${input.version}" is not a semantic version like 1.2.3`);
  }
  if (!DATE_PATTERN.test(input.date)) {
    throw new ReleasePrepError(`"${input.date}" is not a YYYY-MM-DD date`);
  }
  if (input.changelog.includes(`## [${input.version}]`)) {
    throw new ReleasePrepError(`CHANGELOG.md already has a section for ${input.version}`);
  }
  const repoUrl = input.repoUrl.replace(/\/+$/, "");
  const moved = moveUnreleased(input.changelog, input.version, input.date);
  return {
    changelog: addLinkRefs(moved, input.changelog, input.version, repoUrl),
    manifest: bumpManifest(input.manifest, input.version),
  };
}

/**
 * Renames the `[Unreleased]` entries to a dated section under a fresh empty `[Unreleased]`.
 * @param changelog - The CHANGELOG text.
 * @param version - The new version.
 * @param date - The release date.
 * @returns The CHANGELOG with the new section and no link refs touched.
 */
function moveUnreleased(changelog: string, version: string, date: string): string {
  const headingIndex = changelog.indexOf(`${UNRELEASED_HEADING}\n`);
  if (headingIndex === -1) {
    throw new ReleasePrepError(`CHANGELOG.md has no "${UNRELEASED_HEADING}" section`);
  }
  const bodyStart = headingIndex + UNRELEASED_HEADING.length + 1;
  const afterHeading = changelog.slice(bodyStart);
  const endMatch = SECTION_END_PATTERN.exec(afterHeading);
  const bodyLength = endMatch === null ? afterHeading.length : endMatch.index;
  const body = afterHeading.slice(0, bodyLength).trim();
  if (body === "") {
    throw new ReleasePrepError("[Unreleased] has no entries; describe the release first");
  }
  const rest = afterHeading.slice(bodyLength);
  return `${changelog.slice(0, headingIndex)}${UNRELEASED_HEADING}\n\n## [${version}] - ${date}\n\n${body}\n\n${rest}`;
}

/**
 * Points `[Unreleased]` at the new tag and adds the new version's compare ref.
 * @param changelog - The CHANGELOG after the section move.
 * @param original - The CHANGELOG before the move, to find the previous version.
 * @param version - The new version.
 * @param repoUrl - The repository URL, without a trailing slash.
 * @returns The CHANGELOG with updated link refs.
 */
function addLinkRefs(
  changelog: string,
  original: string,
  version: string,
  repoUrl: string,
): string {
  const unreleasedRef = `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD`;
  const refMatch = UNRELEASED_REF_PATTERN.exec(changelog);
  if (refMatch === null) {
    const previous = RELEASED_HEADING_PATTERN.exec(original)?.[1];
    const lastLine = changelog.trimEnd().split("\n").at(-1) ?? "";
    const separator = LINK_REF_LINE_PATTERN.test(lastLine) ? "\n" : "\n\n";
    const refs = `${unreleasedRef}\n${versionRef(version, previous, repoUrl)}\n`;
    return `${changelog.trimEnd()}${separator}${refs}`;
  }
  const previous = PREVIOUS_FROM_COMPARE_PATTERN.exec(refMatch[1] ?? "")?.[1];
  if (previous === undefined) {
    throw new ReleasePrepError(`the [Unreleased] ref is not a compare/v<version>...HEAD link`);
  }
  return changelog.replace(
    refMatch[0],
    `${unreleasedRef}\n${versionRef(version, previous, repoUrl)}`,
  );
}

/**
 * Builds the link ref of a released version: a compare link, or the tag page for the first release.
 * @param version - The new version.
 * @param previous - The previous released version, if any.
 * @param repoUrl - The repository URL, without a trailing slash.
 * @returns The `[version]: url` line.
 */
function versionRef(version: string, previous: string | undefined, repoUrl: string): string {
  return previous === undefined
    ? `[${version}]: ${repoUrl}/releases/tag/v${version}`
    : `[${version}]: ${repoUrl}/compare/v${previous}...v${version}`;
}

/**
 * Rewrites the `version` field of the manifest text in place, keeping its formatting.
 * @param manifest - The plugin manifest text.
 * @param version - The new version.
 * @returns The manifest text with the new version.
 */
function bumpManifest(manifest: string, version: string): string {
  if (!MANIFEST_VERSION_PATTERN.test(manifest)) {
    throw new ReleasePrepError('the plugin manifest has no "version" field');
  }
  return manifest.replace(MANIFEST_VERSION_PATTERN, `$1${version}$2`);
}

/**
 * Reads the repository URL from the parsed manifest's `repository` field.
 * @param manifest - The plugin manifest text.
 * @returns The repository URL.
 */
function repositoryUrl(manifest: string): string {
  const parsed: unknown = JSON.parse(manifest);
  const repository =
    typeof parsed === "object" && parsed !== null && "repository" in parsed
      ? parsed.repository
      : undefined;
  if (typeof repository === "string") return repository;
  if (typeof repository === "object" && repository !== null && "url" in repository) {
    const { url } = repository;
    if (typeof url === "string") return url;
  }
  throw new ReleasePrepError('the plugin manifest has no "repository" URL');
}

/** Where `runReleasePrep` writes its messages. */
interface ReleasePrepStreams {
  readonly stdout: { write(text: string): unknown };
  readonly stderr: { write(text: string): unknown };
}

/**
 * Runs `bun run release:prep <version>` against the CHANGELOG and plugin manifest of a directory.
 * @param argv - The arguments after the script path.
 * @param directory - The repository root; defaults to the working directory.
 * @param streams - Where messages go; defaults to the process streams.
 * @returns The process exit code.
 */
export function runReleasePrep(
  argv: readonly string[],
  directory: string = process.cwd(),
  streams: ReleasePrepStreams = process,
): number {
  const [version] = argv;
  if (version === undefined || argv.length !== 1) {
    streams.stderr.write(`${USAGE}\n`);
    return 1;
  }
  const changelogPath = join(directory, "CHANGELOG.md");
  const manifestPath = join(directory, ".claude-plugin", "plugin.json");
  try {
    const manifest = readFileSync(manifestPath, "utf8");
    const result = prepareRelease({
      changelog: readFileSync(changelogPath, "utf8"),
      manifest,
      version,
      date: new Date().toISOString().slice(0, "YYYY-MM-DD".length),
      repoUrl: repositoryUrl(manifest),
    });
    writeFileSync(manifestPath, result.manifest);
    writeFileSync(changelogPath, result.changelog);
  } catch (error) {
    if (!(error instanceof ReleasePrepError)) throw error;
    streams.stderr.write(`release:prep: ${error.message}\n`);
    return 1;
  }
  streams.stdout.write(
    `Prepared ${version}: .claude-plugin/plugin.json and CHANGELOG.md. Next run bun run build:codex.\n`,
  );
  return 0;
}

if (import.meta.main) process.exit(runReleasePrep(process.argv.slice(2)));

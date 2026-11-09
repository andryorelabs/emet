import { type Locale, localePath } from "../i18n/locales";

/**
 * One repository file the docs serve.
 */
export interface PublishedSource {
  /**
   * Route below `/docs/`, and the path of its translations below
   * `src/content/translations/<locale>/`, without extension.
   */
  id: string;
  /**
   * Path relative to the repository root, using `/`.
   */
  sourcePath: string;
  /**
   * `changelog` goes through the release notes parser.
   */
  kind: "markdown" | "changelog";
  /**
   * English meta description, 155 characters at most.
   */
  description: string;
  /**
   * English `<title>` and `og:title`, 53 characters at most. The visible H1
   * stays the page title.
   */
  seoTitle: string;
}

/**
 * The allowlist of repository files the Website publishes, in sidebar order.
 * Nothing outside it is read into the site.
 */
export const PUBLISHED_SOURCES: readonly PublishedSource[] = [
  {
    id: "guide/getting-started",
    sourcePath: "docs/guide/getting-started.md",
    kind: "markdown",
    seoTitle: "Getting Started with emet",
    description:
      "Install emet as a Claude Code plugin, check that it works with emet doctor and run it for the first time.",
  },
  {
    id: "guide/fleet",
    sourcePath: "docs/guide/fleet.md",
    kind: "markdown",
    seoTitle: "Fleet Check: Audit Several Repos with emet doctor",
    description:
      "Audit any number of repositories at once with emet doctor, read-only, and see which ones need attention.",
  },
  {
    id: "guide/models-and-effort",
    sourcePath: "docs/guide/models-and-effort.md",
    kind: "markdown",
    seoTitle: "Models and Effort in emet",
    description:
      "How emet picks a model and a reasoning effort for each role, and which configuration keys change them.",
  },
  {
    id: "guide/trackers-and-landing",
    sourcePath: "docs/guide/trackers-and-landing.md",
    kind: "markdown",
    seoTitle: "Trackers and Landing in emet",
    description:
      "Where tickets live, how a wave lands as a pull request or a local merge, and how waves chain.",
  },
  {
    id: "guide/codex",
    sourcePath: "docs/guide/codex.md",
    kind: "markdown",
    seoTitle: "Run emet with Codex",
    description:
      "Use Codex as the Agent host for emet: configure agentHost, dispatch workers and reviewers, and run the opt-in e2e.",
  },
  {
    id: "reference/cli",
    sourcePath: "docs/reference/cli.md",
    kind: "markdown",
    seoTitle: "emet CLI Reference",
    description:
      "Every emet subcommand, the gates and records table, exit codes and environment variables.",
  },
  {
    id: "reference/configuration",
    sourcePath: "docs/reference/configuration.md",
    kind: "markdown",
    seoTitle: "emet Configuration Reference",
    description: "Every key in emet.config.json with its default and meaning.",
  },
  {
    id: "reference/dependencies",
    sourcePath: "docs/reference/dependencies.md",
    kind: "markdown",
    seoTitle: "emet Dependencies",
    description: "What emet needs on the machine, and which command checks each item.",
  },
  {
    id: "troubleshooting",
    sourcePath: "docs/troubleshooting.md",
    kind: "markdown",
    seoTitle: "Troubleshooting emet doctor and preflight",
    description:
      "Failures of emet doctor and emet preflight, grouped by what you see, each with the cause and a fix.",
  },
  {
    id: "architecture",
    sourcePath: "docs/architecture.md",
    kind: "markdown",
    seoTitle: "emet Architecture",
    description: "A code map of emet/src and how the /emet prompts drive it.",
  },
  {
    id: "how-to/update-emet",
    sourcePath: "docs/how-to/update-emet.md",
    kind: "markdown",
    seoTitle: "Update emet",
    description:
      "Move an installed emet to a new release and turn on marketplace auto-update for the plugins.",
  },
  {
    id: "how-to/mascot",
    sourcePath: "docs/how-to/mascot.md",
    kind: "markdown",
    seoTitle: "Use the emet Mascot in Claude Code and Orca",
    description: "Show the emet Mascot in Claude Code with the mod and in Orca with the pet.",
  },
  {
    id: "whats-new",
    sourcePath: "CHANGELOG.md",
    kind: "changelog",
    seoTitle: "What's New in emet: Release Notes",
    description: "Release notes for emet: what changed in every version.",
  },
];

/**
 * Looks a repository path up in the allowlist.
 * @param sourcePath - Path relative to the repository root, using `/`.
 * @returns The published source, or `undefined` when it is not published.
 */
export function findPublishedSource(sourcePath: string): PublishedSource | undefined {
  return PUBLISHED_SOURCES.find((source) => source.sourcePath === sourcePath);
}

/**
 * Looks a page id up in the allowlist.
 * @param id - A published page id such as `guide/fleet`.
 * @returns The published source, or `undefined` when the id is unknown.
 */
export function findPublishedSourceById(id: string): PublishedSource | undefined {
  return PUBLISHED_SOURCES.find((source) => source.id === id);
}

/**
 * Site route of a published source for a locale.
 * @param source - A published source.
 * @param locale - Locale whose route prefix applies.
 * @returns Path with leading and trailing slashes, e.g. `/es/docs/guide/fleet/`.
 */
export function publishedRoute(source: PublishedSource, locale: Locale): string {
  return localePath(locale, `/docs/${source.id}/`);
}

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
    id: "start/overview",
    sourcePath: "docs/start/overview.md",
    kind: "markdown",
    seoTitle: "emet Overview: What It Does",
    description:
      "What emet is, what a run does from spec to merged pull request, and where to go next in the docs.",
  },
  {
    id: "start/install",
    sourcePath: "docs/start/install.md",
    kind: "markdown",
    seoTitle: "Install emet",
    description:
      "Install emet with the standalone installer, add the optional plugins, update, turn on auto-update and uninstall.",
  },
  {
    id: "start/first-run",
    sourcePath: "docs/start/first-run.md",
    kind: "markdown",
    seoTitle: "Your First emet Run",
    description:
      "Check the install with emet doctor, then run emet for the first time on a repository.",
  },
  {
    id: "concepts/runs-waves-specs",
    sourcePath: "docs/concepts/runs-waves-specs.md",
    kind: "markdown",
    seoTitle: "Runs, Waves and Specs in emet",
    description: "How a run, a wave and a spec relate, and what each one holds.",
  },
  {
    id: "concepts/landing",
    sourcePath: "docs/concepts/landing.md",
    kind: "markdown",
    seoTitle: "Landing in emet",
    description:
      "How a spec lands: as one pull request by default, or one wave at a time with landing.unit set to wave.",
  },
  {
    id: "concepts/review-and-gates",
    sourcePath: "docs/concepts/review-and-gates.md",
    kind: "markdown",
    seoTitle: "Review and Gates in emet",
    description: "How the double review and the gates decide whether work can land.",
  },
  {
    id: "concepts/memory",
    sourcePath: "docs/concepts/memory.md",
    kind: "markdown",
    seoTitle: "Memory in emet",
    description: "What emet remembers between runs and where it keeps it.",
  },
  {
    id: "concepts/attention-and-journal",
    sourcePath: "docs/concepts/attention-and-journal.md",
    kind: "markdown",
    seoTitle: "Attention Alerts and the Event Journal",
    description: "How emet asks for attention and records its own events in one global journal.",
  },
  {
    id: "concepts/living-specs",
    sourcePath: "docs/concepts/living-specs.md",
    kind: "markdown",
    seoTitle: "Living Specs in emet",
    description: "How a spec stays current while its tickets land.",
  },
  {
    id: "concepts/security",
    sourcePath: "docs/concepts/security.md",
    kind: "markdown",
    seoTitle: "Security Model of emet",
    description: "How emet limits the damage an unattended run can do.",
  },
  {
    id: "concepts/architecture",
    sourcePath: "docs/concepts/architecture.md",
    kind: "markdown",
    seoTitle: "emet Architecture",
    description: "A code map of emet/src and how the /emet prompts drive it.",
  },
  {
    id: "how-to/use-codex",
    sourcePath: "docs/how-to/use-codex.md",
    kind: "markdown",
    seoTitle: "Run emet with Codex",
    description:
      "Use Codex as the Agent host for emet: configure agentHost, dispatch workers and reviewers, and run the opt-in e2e.",
  },
  {
    id: "how-to/check-a-fleet",
    sourcePath: "docs/how-to/check-a-fleet.md",
    kind: "markdown",
    seoTitle: "Fleet Check: Audit Several Repos with emet doctor",
    description:
      "Audit any number of repositories at once with emet doctor, read-only, and see which ones need attention.",
  },
  {
    id: "how-to/configure-tracker",
    sourcePath: "docs/how-to/configure-tracker.md",
    kind: "markdown",
    seoTitle: "Configure the Tracker and Landing in emet",
    description:
      "Choose where tickets live and how work lands, as a pull request or a local merge, and check the setting.",
  },
  {
    id: "how-to/choose-models",
    sourcePath: "docs/how-to/choose-models.md",
    kind: "markdown",
    seoTitle: "Choose Models and Effort in emet",
    description:
      "Pick a model and a reasoning effort for each role, and which configuration keys change them.",
  },
  {
    id: "how-to/mascot",
    sourcePath: "docs/how-to/mascot.md",
    kind: "markdown",
    seoTitle: "Use the emet Mascot in Claude Code and Orca",
    description: "Show the emet Mascot in Claude Code with the mod and in Orca with the pet.",
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
    id: "reference/stability",
    sourcePath: "docs/reference/stability.md",
    kind: "markdown",
    seoTitle: "emet Stability Promises",
    description: "What emet promises not to break, and what it reserves the right to change.",
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

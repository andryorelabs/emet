import configSchema from "../schema/forge.config.schema.json" with { type: "text" };
import domainTemplate from "../templates/domain.md.tpl" with { type: "text" };
import forgeTemplate from "../templates/forge.md.tpl" with { type: "text" };
import issueTrackerGithubTemplate from "../templates/issue-tracker-github.md.tpl" with { type: "text" };
import issueTrackerLinearTemplate from "../templates/issue-tracker-linear.md.tpl" with { type: "text" };
import issueTrackerLocalTemplate from "../templates/issue-tracker-local.md.tpl" with { type: "text" };
import triageLabelsGithubTemplate from "../templates/triage-labels-github.md.tpl" with { type: "text" };
import triageLabelsLinearTemplate from "../templates/triage-labels-linear.md.tpl" with { type: "text" };
import triageLabelsLocalTemplate from "../templates/triage-labels-local.md.tpl" with { type: "text" };

/**
 * Replaced by `bun build --define` in compiled binaries (see
 * `tools/build-binaries.ts`); undeclared at runtime from source.
 */
declare const FORGE_BUILD_VERSION: string | undefined;

const DEV_VERSION = "0.0.0-dev";

const TEMPLATES: Readonly<Record<string, string>> = {
  "domain.md.tpl": domainTemplate,
  "forge.md.tpl": forgeTemplate,
  "issue-tracker-github.md.tpl": issueTrackerGithubTemplate,
  "issue-tracker-linear.md.tpl": issueTrackerLinearTemplate,
  "issue-tracker-local.md.tpl": issueTrackerLocalTemplate,
  "triage-labels-github.md.tpl": triageLabelsGithubTemplate,
  "triage-labels-linear.md.tpl": triageLabelsLinearTemplate,
  "triage-labels-local.md.tpl": triageLabelsLocalTemplate,
};

/** The version embedded at build time, or `0.0.0-dev` when running from source. */
export const FORGE_VERSION: string =
  typeof FORGE_BUILD_VERSION === "string" ? FORGE_BUILD_VERSION : DEV_VERSION;

/** Returns the embedded `forge/templates/<name>` text; throws for an unknown name. */
export function readTemplate(name: string): string {
  const content = TEMPLATES[name];
  if (content === undefined) throw new Error(`forge: unknown template "${name}"`);
  return content;
}

/** Returns the embedded `forge.config.schema.json` text. */
export function readSchema(): string {
  return configSchema;
}

/** True when running from a `bun build --compile` executable rather than source. */
export function isCompiledBinary(): boolean {
  return Bun.main.startsWith("/$bunfs/") || Bun.main.includes("~BUN");
}

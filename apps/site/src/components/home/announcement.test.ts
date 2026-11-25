import { describe, expect, it } from "bun:test";

import { LOCALES, localePath } from "../../i18n/locales";
import { latestRelease } from "./announcement";

const changelog = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [0.8.2] - 2026-05-01",
  "",
  "- Fixed a thing",
  "",
  "## [0.8.1] - 2026-04-01",
  "",
  "- Older",
  "",
].join("\n");

describe("latestRelease", () => {
  it("returns the newest version and its What's new anchor", () => {
    expect(latestRelease(changelog, "en")).toEqual({
      version: "0.8.2",
      href: "/docs/whats-new/#082",
    });
  });

  it("returns null when the changelog has no entry", () => {
    expect(latestRelease("# Changelog\n\n## [Unreleased]\n", "en")).toBeNull();
    expect(latestRelease("", "es")).toBeNull();
  });

  it("builds a locale-prefixed href for every locale", () => {
    for (const locale of LOCALES) {
      expect(latestRelease(changelog, locale)?.href).toBe(
        `${localePath(locale, "/docs/whats-new/")}#082`,
      );
    }
    expect(latestRelease(changelog, "pt-BR")?.href).toBe("/pt-br/docs/whats-new/#082");
  });
});

describe("AnnouncementPill markup", () => {
  it("renders badge markup with no island", async () => {
    const markup = await Bun.file(new URL("AnnouncementPill.astro", import.meta.url)).text();
    expect(markup).toContain('data-slot="badge"');
    expect(markup).toContain("badgeVariants(");
    expect(markup).not.toContain("client:");
  });
});

import { describe, expect, test } from "bun:test";

import { parseChangelog, renderReleaseNotesMarkdown } from "./release-notes";

const SAMPLE = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "",
  "- Not yet.",
  "",
  "## [0.2.0] - 2026-11-05",
  "",
  "### Added",
  "",
  "- Two.",
  "",
  "## [0.10.0] - 2026-11-06",
  "",
  "- Ten.",
  "",
].join("\n");

describe("parseChangelog", () => {
  test("skips Unreleased and sorts newest first by version number", () => {
    expect(parseChangelog(SAMPLE).map((note) => note.version)).toEqual(["0.10.0", "0.2.0"]);
  });

  test("leaves the compare link references out of the last release body", () => {
    const withLinkReferences = [
      SAMPLE,
      "[Unreleased]: https://github.com/andryorelabs/emet/compare/v0.10.0...HEAD",
      "[0.10.0]: https://github.com/andryorelabs/emet/compare/v0.2.0...v0.10.0",
      "[0.2.0]: https://github.com/andryorelabs/emet/releases/tag/v0.2.0",
      "",
    ].join("\n");
    expect(parseChangelog(withLinkReferences)).toEqual(parseChangelog(SAMPLE));
    expect(parseChangelog(withLinkReferences)[0]?.body).toBe("- Ten.");
  });

  test("rejects a malformed release heading", () => {
    expect(() => parseChangelog("## [1.0] - 2026-01-01")).toThrow(/line 1/);
  });

  test("rejects an impossible date", () => {
    expect(() => parseChangelog("## [1.0.0] - 2026-02-31")).toThrow(/invalid release date/);
  });

  test("renders one H2 per version with its date", () => {
    expect(renderReleaseNotesMarkdown(parseChangelog(SAMPLE))).toStartWith(
      "## 0.10.0\n\n2026-11-06\n\n- Ten.",
    );
  });
});

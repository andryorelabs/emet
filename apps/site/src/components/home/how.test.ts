import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { LOCALES } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const streamsSource = readFileSync(
  new URL("graphics/PaintingStreams.astro", import.meta.url),
  "utf8",
);
const howSource = readFileSync(new URL("HowItWorks.astro", import.meta.url), "utf8");

describe("How it works painting overlay", () => {
  it("is drawn in master pixels, scaled like the cover-fitted painting, and hidden from assistive tech", () => {
    expect(streamsSource).toContain('viewBox="0 0 1672 941"');
    expect(streamsSource).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(streamsSource).toContain('aria-hidden="true"');
    expect(streamsSource).toContain("{merged}");
  });

  it("has a non-empty Merged label in every locale", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).how.merged.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps every ticket pill inside the 360px crop of the master (x 533 to 1139)", () => {
    const heads = [...streamsSource.matchAll(/head: \[(\d+), \d+\]/g)].map((match) =>
      Number(match[1]),
    );
    expect(heads).toHaveLength(3);
    for (const x of heads) {
      expect(x - 48).toBeGreaterThanOrEqual(533);
      expect(x + 48).toBeLessThanOrEqual(1139);
    }
  });
});

describe("How it works per-spec flow", () => {
  it("shows one install snippet that links to the install page", () => {
    expect(howSource).toContain('localePath(locale, "/docs/start/install/")');
    expect(howSource).not.toContain("claude plugin install");
    expect(howSource).not.toContain("codex plugin add");
  });

  it("lands one pull request for the spec and none for a wave", () => {
    expect(howSource).toContain("how.prTitle");
    expect(howSource).not.toContain("Wave 2: home layout");
    for (const locale of LOCALES) {
      const { how, showcase } = getStrings(locale);
      expect(how.wave).toContain("{n}");
      expect(how.caption.trim().length).toBeGreaterThan(0);
      expect(showcase.status).toContain("41");
    }
  });
});

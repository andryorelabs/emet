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

describe("How it works pinned runway markup", () => {
  const cssSource = readFileSync(new URL("../../styles/home/how.css", import.meta.url), "utf8");

  it("is a runway with three steps and a stage the pin can drive", () => {
    expect(howSource).toContain('id="how"');
    expect(howSource).toContain("data-how-pin");
    expect(howSource.match(/class="exchange step"/g)).toHaveLength(3);
    expect(howSource).toContain("data-how-stage");
    expect(howSource).toContain("data-dither-src");
    expect(howSource).toContain("initHowPin(runway)");
    expect(howSource).not.toContain("style=");
  });

  it("keeps Claude Code and Codex tabs with a terminal-icon header and literal host commands", () => {
    expect(howSource).toContain('label: "Claude Code"');
    expect(howSource).toContain('label: "Codex"');
    expect(howSource).toContain("`/emet:run ${how.request}`");
    expect(howSource).toContain("`$emet:run ${how.request}`");
    expect(howSource.match(/<Fragment set:html=\{terminalIcon\} \/>/g)).toHaveLength(3);
  });

  it("pins only when the script marks the runway and stacks otherwise", () => {
    expect(cssSource).toMatch(/\.how\[data-pinned\] \{[^}]*height: 420vh/);
    expect(cssSource).toMatch(/\.how\[data-pinned\] \.how-stick \{[^}]*position: sticky/);
    expect(cssSource).not.toMatch(/^\.how \{[^}]*height: 420vh/m);
    expect(cssSource).toContain('[data-step-state="idle"]');
    expect(cssSource).toContain("grid-template-rows: 0fr");
    expect(cssSource).not.toMatch(/(^|\n)\.how-stick \{[^}]*position: sticky/);
  });

  it("shows no dither canvas unless pinned", () => {
    expect(cssSource).toMatch(/\.how-dither \{\s*display: none;/);
    expect(cssSource).toMatch(/\.how\[data-pinned\] \.how-dither \{[^}]*display: block/);
  });

  it("hides the dither canvas once painting-fx is active so the clouds and eyes show", () => {
    expect(cssSource).toMatch(/\.how-painting\[data-fx="on"\] \.how-dither \{\s*display: none;/);
    const pinnedBlock = cssSource.indexOf(".how[data-pinned] .how-dither");
    const fxBlock = cssSource.indexOf('.how-painting[data-fx="on"] .how-dither');
    expect(fxBlock).toBeGreaterThan(pinnedBlock);
  });
});

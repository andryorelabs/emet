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

  it("keeps the plan lines of step 2 and prints them as plain text", () => {
    expect(howSource).toContain("`${waveLine(1)}  theme tokens #42`");
    expect(howSource).toContain(
      "`${waveLine(2)}  settings toggle #43 \\u00b7 remember the choice #44 \\u00b7 docs and screenshots #45`",
    );
    for (const locale of LOCALES) {
      expect(getStrings(locale).how.waveLine).toContain("{n}");
    }
  });

  it("lands as one five-line terminal panel and drops the hand-written diagram", () => {
    expect(howSource).toContain("<HomeTerminal");
    expect(howSource).toContain("lines={landLines}");
    expect(howSource).toContain('text: "emet status"');
    expect(howSource).toContain("`spec/41. ${how.caption}`");
    expect(howSource).not.toContain("WaveDiagram");
    expect(howSource).not.toContain("graphics/typed-terminal");
  });

  it("prints the land line in one piece with localized Open and Closes words", () => {
    expect(howSource).toContain(
      "${how.open}  ${how.prTitle} \\u00b7 ${how.closes} #42 #43 #44 #45",
    );
    expect(howSource).not.toContain("`Open ");
    for (const locale of LOCALES) {
      const { how, showcase } = getStrings(locale);
      expect(how.open.trim().length).toBeGreaterThan(0);
      expect(how.closes.trim().length).toBeGreaterThan(0);
      expect(showcase.laneReview.trim().length).toBeGreaterThan(0);
      expect(showcase.laneHeld.trim().length).toBeGreaterThan(0);
    }
  });

  it("passes the review and held lane words to the lanes canvas", () => {
    const showcaseSource = readFileSync(new URL("Showcase.astro", import.meta.url), "utf8");
    expect(showcaseSource).toContain("data-label-review={showcase.laneReview}");
    expect(showcaseSource).toContain("data-label-held={showcase.laneHeld}");
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

  it("uses the shadcn code block with literal host commands and a terminal-icon header", () => {
    expect(howSource).toContain("<HomeCodeBlock");
    expect(howSource).not.toContain("CodeBlock.astro");
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

describe("How it works waiting, done and stream styling", () => {
  const cssSource = readFileSync(new URL("../../styles/home/how.css", import.meta.url), "utf8");
  const graphicsSource = readFileSync(
    new URL("../../styles/graphics.css", import.meta.url),
    "utf8",
  );

  it("dims waiting steps to 0.38 with a muted colour, never an opacity on their text", () => {
    expect(cssSource).toMatch(
      /\[data-step-state="idle"\]::before,\s*\.how\[data-pinned\] \.step\[data-step-state="idle"\] \.step-dot \{\s*opacity: 0\.38;/,
    );
    expect(cssSource).toMatch(
      /\[data-step-state="idle"\] h3,[^{]*\{\s*color: var\(--text-muted\);/,
    );
    expect(cssSource).not.toMatch(/\.step\[data-step-state="(idle|done)"\] \{[^}]*opacity/);
  });

  it("shrinks a done step to a 42px one-line panel", () => {
    expect(cssSource).toMatch(/\[data-step-state="done"\] \.snippet \{\s*height: 42px;/);
    expect(cssSource).toMatch(/\.snippet pre \{[^}]*white-space: nowrap/);
    expect(cssSource).not.toMatch(/(^|\n)pre \{/);
  });

  it("times the streams: lines 0.9s, river 0.9s after 0.2s, pills 0.5s, Merged 0.5s after 0.5s", () => {
    expect(graphicsSource).toMatch(
      /\.ps-line \{\s*transition: stroke-dashoffset 900ms var\(--ease-out\);/,
    );
    expect(graphicsSource).toMatch(
      /\.ps-river \{\s*transition: stroke-dashoffset 900ms var\(--ease-out\) 200ms;/,
    );
    expect(graphicsSource).toMatch(/\.ps-pill \{\s*transition: opacity 500ms/);
    expect(graphicsSource).toContain("opacity: 0.6;");
    expect(graphicsSource).toContain("opacity 500ms var(--ease-out) 500ms");
    expect(graphicsSource).toContain("transform: scale(0.8);");
  });

  it("loops the flow dots every 1.8s with 0.25s and 0.5s delays and pauses them off-screen", () => {
    expect(graphicsSource).toContain("animation: ps-flow 1800ms ease-in-out infinite both;");
    expect(graphicsSource).toMatch(/nth-child\(6\) \{\s*animation-delay: 250ms;/);
    expect(graphicsSource).toMatch(/nth-child\(7\) \{\s*animation-delay: 500ms;/);
    expect(graphicsSource).toMatch(/\[data-paused\] \.ps-dot \{\s*animation-play-state: paused;/);
  });
});

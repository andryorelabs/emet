import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { renderIsland } from "../../test/render";
import { FaqAccordion, segments } from "./FaqAccordion";

const items = [
  { question: "How do I uninstall?", answer: "Run `emet uninstall`. Add `--dry-run` first." },
  { question: "What do I need?", answer: "Claude Code and git." },
];

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("segments", () => {
  test("flags the text between backticks as code", () => {
    expect(segments("Run `emet uninstall` now")).toEqual([
      { text: "Run ", code: false },
      { text: "emet uninstall", code: true },
      { text: " now", code: false },
    ]);
  });
});

describe("FaqAccordion", () => {
  test("opens the first question and keeps the reveal hooks", () => {
    const { container, unmount } = renderIsland(
      <FaqAccordion items={items} heading="Questions" more="More" href="/docs/troubleshooting/" />,
    );
    const triggers = container.querySelectorAll<HTMLElement>("[data-slot=accordion-trigger]");
    expect(triggers).toHaveLength(2);
    expect(triggers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(triggers[1]?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("h2[data-reveal=heading]")?.textContent).toBe("Questions");
    expect(container.querySelectorAll("[data-reveal=item]")).toHaveLength(2);
    unmount();
  });

  test("renders backtick segments as code and links to troubleshooting", () => {
    const { container, unmount } = renderIsland(
      <FaqAccordion items={items} heading="Questions" more="More" href="/docs/troubleshooting/" />,
    );
    const codes = [...container.querySelectorAll("code")].map((node) => node.textContent);
    expect(codes).toEqual(["emet uninstall", "--dry-run"]);
    const link = container.querySelector<HTMLAnchorElement>("a[data-faq-more]");
    expect(link?.getAttribute("href")).toBe("/docs/troubleshooting/");
    expect(link?.textContent).toBe("More");
    unmount();
  });
});

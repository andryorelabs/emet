import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { findPublishedSourceById, publishedRoute } from "../../docs/published";
import { LOCALES, localePath } from "../../i18n/locales";
import { getStrings } from "../../i18n/ui";

const faqSource = readFileSync(new URL("Faq.astro", import.meta.url), "utf8");
const faqAccordionSource = readFileSync(new URL("FaqAccordion.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../styles/home/faq.css", import.meta.url), "utf8");

describe("FAQ", () => {
  it("opens the answer in 0.4s with the prototype ease", () => {
    expect(css).toContain("transition: grid-template-rows 400ms ease;");
  });

  it("has eight rows in every locale", () => {
    for (const locale of LOCALES) {
      expect(getStrings(locale).faq.items).toHaveLength(8);
    }
    expect(faqSource).toContain("<FaqAccordion client:visible");
    expect(faqAccordionSource).toContain("AccordionTrigger");
  });

  it("links More questions to the localized troubleshooting page in every locale", () => {
    const source = findPublishedSourceById("troubleshooting");
    expect(source).toBeDefined();
    expect(faqSource).toContain('localePath(locale, "/docs/troubleshooting/")');
    for (const locale of LOCALES) {
      if (source === undefined) throw new Error("troubleshooting source missing");
      expect(localePath(locale, "/docs/troubleshooting/")).toBe(publishedRoute(source, locale));
    }
  });

  it("animates the panel through grid rows and rotates the plus", () => {
    expect(css).toContain("grid-template-columns: minmax(0, 380px) minmax(0, 1fr)");
    expect(css).toMatch(/grid-template-rows: 1fr;/);
    expect(css).toMatch(/\[data-ending-style\] \{\s*grid-template-rows: 0fr;/);
    expect(css).toContain('[aria-expanded="true"]::after');
    expect(css).toContain("rotate(45deg)");
    expect(faqAccordionSource).toContain("data-faq-more");
  });

  it("drops the panel transition when motion is reduced", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-faq-item\] \[data-slot="accordion-content"\],\s*\[data-faq-item\] \[data-faq-trigger\]::after \{\s*transition: none;/,
    );
    expect(css).not.toContain(".faq-chevron");
  });
});

import { describe, expect, test } from "bun:test";

import { LOCALES } from "../../i18n/locales";
import {
  type FetchLike,
  type StarRoot,
  fetchBuildStarCount,
  formatStarCount,
  getBuildStarCount,
  parseStarsResponse,
  refreshStarCounts,
} from "./github-stars";
import { GITHUB_STARS_TOOLTIP, starsTooltip } from "./github-strings";

const respondWith =
  (body: unknown, status = 200): FetchLike =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

const rejecting: FetchLike = () => Promise.reject(new Error("offline"));

describe("formatStarCount", () => {
  test("formats compact counts", () => {
    expect(formatStarCount(0)).toBe("0");
    expect(formatStarCount(999)).toBe("999");
    expect(formatStarCount(1000)).toBe("1k");
    expect(formatStarCount(1234)).toBe("1.2k");
    expect(formatStarCount(12345)).toBe("12k");
  });
});

describe("parseStarsResponse", () => {
  test("reads stargazers_count", () => {
    expect(parseStarsResponse({ stargazers_count: 377 })).toBe(377);
  });

  test("ignores malformed payloads", () => {
    const malformed = [
      null,
      "x",
      5,
      [],
      {},
      { stargazers_count: "3" },
      { stargazers_count: -1 },
      { stargazers_count: 1.5 },
    ];
    for (const payload of malformed) {
      expect(parseStarsResponse(payload)).toBeNull();
    }
  });
});

describe("fetchBuildStarCount", () => {
  test("returns the count on success", async () => {
    expect(await fetchBuildStarCount(respondWith({ stargazers_count: 42 }))).toBe(42);
  });

  test("returns null on a bad status, bad JSON or a thrown fetch", async () => {
    expect(await fetchBuildStarCount(respondWith({ stargazers_count: 42 }, 500))).toBeNull();
    expect(await fetchBuildStarCount(respondWith({ nope: true }))).toBeNull();
    expect(await fetchBuildStarCount(rejecting)).toBeNull();
  });

  test("getBuildStarCount shares one promise", () => {
    expect(getBuildStarCount()).toBe(getBuildStarCount());
  });
});

interface FakeLabel {
  hidden: boolean;
  textContent: string;
}

const fakeRoot = (label: FakeLabel | null, template?: string) => {
  const link = {
    lang: "en",
    title: "",
    dataset: { starsTemplate: template },
    querySelector: () => label,
  };
  const root: StarRoot = { querySelectorAll: () => [link] };
  return { link, root };
};

describe("refreshStarCounts", () => {
  test("updates the label and tooltip", async () => {
    const label = { hidden: true, textContent: "" };
    const { link, root } = fakeRoot(label, "{count} stars");
    await refreshStarCounts(root, respondWith({ stargazers_count: 1234 }));
    expect(label).toEqual({ hidden: false, textContent: "1.2k" });
    expect(link.title).toBe("1,234 stars");
  });

  test("tolerates a missing label and template", async () => {
    const { link, root } = fakeRoot(null);
    await refreshStarCounts(root, respondWith({ stargazers_count: 5 }));
    expect(link.title).toBe("");
  });

  test("keeps the build value on errors and malformed JSON", async () => {
    const label = { hidden: false, textContent: "7" };
    const { root } = fakeRoot(label, "{count} stars");
    await refreshStarCounts(root, respondWith({ stargazers_count: 9 }, 502));
    await refreshStarCounts(root, respondWith({ stargazers_count: "x" }));
    await refreshStarCounts(root, rejecting);
    expect(label.textContent).toBe("7");
  });
});

describe("star tooltips", () => {
  test("every locale has an N stars template", () => {
    for (const locale of LOCALES) {
      expect(GITHUB_STARS_TOOLTIP[locale]).toContain("{count}");
    }
  });

  test("starsTooltip fills the grouped count", () => {
    expect(starsTooltip("en", 1234)).toBe("1,234 stars");
    expect(starsTooltip("es", 12)).toBe("12 estrellas");
  });
});

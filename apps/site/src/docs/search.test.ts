import { describe, expect, mock, test } from "bun:test";

import { restrictToMarkTags } from "./search-markup";
import {
  installSearchTrustedTypesPolicy,
  restrictToPagefindWorker,
  type TrustedTypesFactory,
} from "./search-trusted-types";

const ORIGIN = "https://emet.andryore.dev";

describe("restrictToMarkTags", () => {
  test("keeps the highlight tags Pagefind puts around matches", () => {
    expect(restrictToMarkTags("Two <mark>waves</mark> match")).toBe("Two <mark>waves</mark> match");
  });

  test("turns every other tag into inert text", () => {
    expect(restrictToMarkTags("<img src=x onerror=alert(1)>")).toBe(
      "&lt;img src=x onerror=alert(1)>",
    );
    expect(restrictToMarkTags('<mark onclick="x()">hit</mark>')).toBe(
      '&lt;mark onclick="x()">hit</mark>',
    );
  });
});

describe("restrictToPagefindWorker", () => {
  test("allows the Pagefind worker by relative and absolute URL", () => {
    expect(restrictToPagefindWorker("/pagefind/pagefind-worker.js", ORIGIN)).toBe(
      "/pagefind/pagefind-worker.js",
    );
    const absolute = `${ORIGIN}/pagefind/pagefind-worker.js`;
    expect(restrictToPagefindWorker(absolute, ORIGIN)).toBe(absolute);
  });

  test("blocks other paths and other origins", () => {
    expect(() => restrictToPagefindWorker("/assets/evil.js", ORIGIN)).toThrow(TypeError);
    expect(() =>
      restrictToPagefindWorker("https://example.com/pagefind/pagefind-worker.js", ORIGIN),
    ).toThrow(TypeError);
  });
});

describe("installSearchTrustedTypesPolicy", () => {
  test("registers the default policy with HTML and script URL callbacks only", () => {
    const createPolicy = mock<TrustedTypesFactory["createPolicy"]>();
    installSearchTrustedTypesPolicy({ createPolicy }, ORIGIN);
    expect(createPolicy).toHaveBeenCalledTimes(1);
    const [name, rules] = createPolicy.mock.calls[0] ?? [];
    expect(name).toBe("default");
    expect(Object.keys(rules ?? {}).toSorted()).toEqual(["createHTML", "createScriptURL"]);
  });

  test("does nothing without Trusted Types support", () => {
    expect(() => {
      installSearchTrustedTypesPolicy(undefined, ORIGIN);
    }).not.toThrow();
  });
});
